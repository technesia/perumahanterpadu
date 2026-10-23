import type { MembershipRelation, OccupancyStatus, ResidentStatus } from "@prisma/client";
import { prisma } from "../db";
import { assertCan, type AuthContext } from "../auth/context";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { nextNumber } from "../counters";
import { decryptField, encryptField } from "../crypto";
import { emailSchema, phoneSchema } from "../validation";
import {
  buildTemplate, buildValidationFile, dateValue, fileHash, intValue, matchKey, monthValue, readSheet, rupiahValue, text,
  type ColumnDef, type RowStatus, type SheetRow,
} from "../excel";
import { currentPeriod } from "./ipl";
import { insertOpeningRows, planOpeningRows, type OpeningRow } from "./ipl-opening";
import { comparePeriod, LUMP_PERIOD } from "@/lib/ipl";
import { periodLabel, rupiah } from "@/lib/format";
import { dateOnly, todayDate, toIsoDate } from "@/lib/dates";

export interface ImportFile { name: string; data: Buffer }

/** Mengambil berkas impor dari FormData (field "file"). */
export async function importFileFromForm(fd: FormData): Promise<ImportFile> {
  const f = fd.get("file");
  if (!f || typeof f === "string" || f.size === 0) throw new AppError("Pilih berkas Excel (.xlsx) terlebih dahulu.", "VALIDATION", { file: "Berkas wajib dipilih." });
  return { name: (f.name || "impor.xlsx").replace(/[^\w .()-]/g, "_").slice(0, 120), data: Buffer.from(await f.arrayBuffer()) };
}

export interface AnalyzedRow { rowNumber: number; status: RowStatus; messages: string[]; display: Record<string, string> }
export interface ImportPreview {
  fileName: string; hash: string; total: number;
  counts: Record<RowStatus, number>;
  rows: AnalyzedRow[];
  /** Berkas hasil validasi (.xlsx, base64) untuk diperbaiki Admin. */
  validationFile: string;
  extra?: Record<string, string | number>;
}

const emptyCounts = (): Record<RowStatus, number> => ({ VALID: 0, DUPLICATE: 0, UNMATCHED: 0, INVALID: 0 });
const PREVIEW_ROWS = 500;

async function finishPreview(file: ImportFile, sheet: string, columns: ColumnDef[], rows: SheetRow[], analyzed: AnalyzedRow[], extra?: ImportPreview["extra"]): Promise<ImportPreview> {
  const counts = emptyCounts();
  for (const a of analyzed) counts[a.status]++;
  const vf = await buildValidationFile(sheet, columns, analyzed.map((a, i) => ({ row: rows[i], status: a.status, messages: a.messages })));
  // Baris bermasalah ditampilkan lebih dulu agar mudah diperbaiki.
  const ordered = [...analyzed.filter((a) => a.status !== "VALID"), ...analyzed.filter((a) => a.status === "VALID")];
  return { fileName: file.name, hash: fileHash(file.data), total: analyzed.length, counts, rows: ordered.slice(0, PREVIEW_ROWS), validationFile: vf.toString("base64"), extra };
}

function assertSameFile(file: ImportFile, expectedHash: string) {
  if (!expectedHash || fileHash(file.data) !== expectedHash) {
    throw new AppError("Berkas berbeda dengan yang dipratinjau. Unggah ulang dan periksa pratinjau sebelum mengonfirmasi impor.");
  }
}

// ───────────────────────── Tunggakan awal IPL ─────────────────────────

export const OPENING_SHEET = "Riwayat Tunggakan IPL";
export const OPENING_COLUMNS: ColumnDef[] = [
  { header: "No Rumah", key: "house", required: true, width: 12, note: "Sama persis dengan Nomor Rumah di menu Data Rumah." },
  { header: "Nama Warga", key: "name", required: true, width: 30, note: "Nama penghuni aktif rumah tersebut (sesuai Data Warga)." },
  { header: "Bulan", key: "month", width: 11, note: "Angka 1–12 atau nama bulan. Kosongkan Bulan dan Tahun untuk tunggakan tanpa rincian periode." },
  { header: "Tahun", key: "year", width: 9 },
  { header: "Nominal Tagihan", key: "amount", required: true, width: 18, note: "Rupiah tanpa desimal, mis. 150000." },
  { header: "Sudah Dibayar", key: "paid", width: 16, note: "Bagian yang sudah dibayar sebelum aplikasi digunakan (opsional)." },
  { header: "Keterangan", key: "notes", width: 36 },
];

export async function openingTemplate() {
  const p = currentPeriod();
  return buildTemplate({
    sheetName: OPENING_SHEET, columns: OPENING_COLUMNS,
    examples: [
      { house: "A-01", name: "Budi Santoso", month: 1, year: p.year, amount: 150000, paid: 0, notes: "Contoh tunggakan per bulan" },
      { house: "A-01", name: "Budi Santoso", month: 2, year: p.year, amount: 150000, paid: 50000, notes: "Contoh dibayar sebagian" },
      { house: "B-03", name: "Siti Aminah", month: null, year: null, amount: 900000, paid: null, notes: "Contoh tunggakan tanpa rincian periode" },
    ],
    instructions: [
      "1. Satu baris = satu periode tunggakan (bulan & tahun) untuk satu rumah.",
      "2. Untuk tunggakan yang hanya diketahui totalnya, kosongkan Bulan dan Tahun. Data ini disimpan sebagai \"Tunggakan Awal Tanpa Rincian Periode\" (maksimal satu per rumah).",
      "3. No Rumah dan Nama Warga harus cocok dengan data di aplikasi. Tambahkan data warga terlebih dahulu bila belum ada (gunakan template Data Warga).",
      "4. Periode yang sudah memiliki tagihan atau sudah tercatat sebagai tunggakan awal akan ditandai Duplikat dan tidak disimpan.",
      "5. Tunggakan awal TIDAK dicatat sebagai pemasukan kas. Kas hanya bertambah saat pembayaran dikonfirmasi di aplikasi.",
      "6. Jenis iuran dipilih di layar impor. Setelah unggah, periksa pratinjau, lalu klik Konfirmasi Impor.",
    ],
  });
}

async function analyzeOpening(ctx: AuthContext, file: ImportFile, iplTypeId: string) {
  assertCan(ctx, "ipl.opening_manage");
  const type = await prisma.iplType.findFirst({ where: { id: iplTypeId, organizationId: ctx.organizationId } });
  if (!type) throw new AppError("Pilih jenis iuran untuk data yang diimpor.", "VALIDATION", { iplTypeId: "Jenis iuran wajib dipilih." });
  const rows = await readSheet(file.data, OPENING_COLUMNS, OPENING_SHEET);
  if (!rows.length) throw new AppError("Tidak ada data pada berkas.");
  const units = await prisma.residentialUnit.findMany({
    where: { organizationId: ctx.organizationId, isActive: true },
    select: { id: true, houseNumber: true, memberships: { where: { endDate: null, resident: { archivedAt: null } }, select: { resident: { select: { id: true, fullName: true } } } } },
  });
  const unitMap = new Map(units.map((u) => [matchKey(u.houseNumber), u]));
  const now = currentPeriod();

  const analyzed: AnalyzedRow[] = [];
  const candidates: { index: number; row: OpeningRow }[] = [];
  rows.forEach((r, index) => {
    const v = r.values;
    const msgs: string[] = [];
    let status: RowStatus = "VALID";
    const house = text(v.house);
    const name = text(v.name);
    const month = monthValue(v.month);
    const year = intValue(v.year);
    const amount = rupiahValue(v.amount);
    const paid = rupiahValue(v.paid) ?? 0;
    const lump = month === null && year === null;
    if (!house) msgs.push("No Rumah wajib diisi.");
    if (!name) msgs.push("Nama Warga wajib diisi.");
    if (amount === null) msgs.push("Nominal Tagihan wajib diisi.");
    else if (Number.isNaN(amount) || amount <= 0) msgs.push("Nominal Tagihan harus angka Rupiah lebih dari 0.");
    if (Number.isNaN(paid) || paid < 0) msgs.push("Sudah Dibayar harus angka Rupiah (boleh 0).");
    if (!lump) {
      if (month === null || Number.isNaN(month)) msgs.push("Bulan harus 1–12 atau nama bulan (kosongkan Bulan dan Tahun untuk tunggakan tanpa rincian).");
      if (year === null || Number.isNaN(year) || year < 2000 || year > 2100) msgs.push("Tahun harus 4 digit (mis. 2025).");
      if (msgs.length === 0 && comparePeriod({ year: year!, month: month! }, now) > 0) msgs.push("Periode mendatang tidak dapat dicatat sebagai tunggakan awal.");
    } else if (paid > 0) {
      msgs.push("Tunggakan tanpa rincian periode diisi dengan sisa tunggakan saja; kosongkan Sudah Dibayar.");
    }
    if (msgs.length === 0 && paid > amount!) msgs.push("Sudah Dibayar melebihi Nominal Tagihan.");
    if (msgs.length) status = "INVALID";
    const unit = house ? unitMap.get(matchKey(house)) : undefined;
    let residentId: string | undefined;
    if (status === "VALID") {
      if (!unit) { status = "UNMATCHED"; msgs.push(`Rumah "${house}" tidak ditemukan di Data Rumah.`); }
      else {
        const m = unit.memberships.find((x) => matchKey(x.resident.fullName) === matchKey(name));
        if (!m) {
          status = "UNMATCHED";
          const names = unit.memberships.map((x) => x.resident.fullName).join(", ");
          msgs.push(`"${name}" bukan penghuni aktif rumah ${unit.houseNumber}${names ? ` (penghuni: ${names})` : " (belum ada penghuni)"}.`);
        } else residentId = m.resident.id;
      }
    }
    const period = lump ? LUMP_PERIOD : { year: year ?? 0, month: month ?? 0 };
    analyzed.push({
      rowNumber: r.rowNumber, status, messages: msgs,
      display: {
        house, name, period: lump ? "Tanpa rincian periode" : month && year && !Number.isNaN(month) && !Number.isNaN(year) ? periodLabel(year, month) : `${text(v.month)} ${text(v.year)}`.trim(),
        amount: amount && !Number.isNaN(amount) ? rupiah(amount) : text(v.amount), paid: paid && !Number.isNaN(paid) ? rupiah(paid) : "-",
      },
    });
    if (status === "VALID") {
      candidates.push({ index, row: { unitId: unit!.id, residentId: residentId!, iplTypeId: type.id, period, amount: amount!, initialPaid: paid, notes: text(v.notes).slice(0, 500) || null } });
    }
  });
  const issues = await planOpeningRows(prisma, ctx.organizationId, candidates.map((c) => c.row));
  const valid: OpeningRow[] = [];
  candidates.forEach((c, i) => {
    const issue = issues.get(i);
    if (issue) {
      analyzed[c.index].status = "DUPLICATE";
      analyzed[c.index].messages.push(issue.message.replace(/\(sama dengan baris (\d+)\)/, (_, n) => `(sama dengan baris Excel ${rows[candidates[Number(n) - 1].index].rowNumber})`));
    } else valid.push(c.row);
  });
  return { type, rows, analyzed, valid };
}

export async function previewOpeningImport(ctx: AuthContext, file: ImportFile, iplTypeId: string) {
  const { type, rows, analyzed, valid } = await analyzeOpening(ctx, file, iplTypeId);
  return finishPreview(file, OPENING_SHEET, OPENING_COLUMNS, rows, analyzed, {
    iplType: type.name, outstanding: valid.reduce((s, r) => s + r.amount - r.initialPaid, 0),
  });
}

/**
 * Menyimpan baris valid dalam SATU transaksi. Bila ada kegagalan (mis. periode yang sama
 * dicatat proses lain setelah pratinjau), seluruh impor dibatalkan.
 */
export async function confirmOpeningImport(ctx: AuthContext, file: ImportFile, iplTypeId: string, expectedHash: string) {
  assertSameFile(file, expectedHash);
  const { type, analyzed, valid } = await analyzeOpening(ctx, file, iplTypeId);
  if (!valid.length) throw new AppError("Tidak ada baris valid untuk diimpor.");
  const counts = emptyCounts();
  for (const a of analyzed) counts[a.status]++;
  const outstanding = valid.reduce((s, r) => s + r.amount - r.initialPaid, 0);
  try {
    await prisma.$transaction(async (tx) => {
      const ids = await insertOpeningRows(tx, ctx, valid);
      await writeAudit(ctx, {
        action: "IPL_OPENING_IMPORTED", module: "ipl", entityType: "IplType", entityId: type.id,
        summary: `Impor tunggakan awal dari ${file.name}: ${ids.length} data (${rupiah(outstanding)} sisa piutang), ${analyzed.length - ids.length} baris dilewati`,
        metadata: { fileName: file.name, fileHash: expectedHash, iplType: type.name, counts, imported: ids.length },
      }, tx);
    }, { timeout: 60_000 });
  } catch (e) {
    await writeAudit(ctx, {
      action: "IPL_OPENING_IMPORTED", module: "ipl", status: "FAILED", entityType: "IplType", entityId: type.id,
      summary: `Impor tunggakan awal dari ${file.name} gagal dan dibatalkan seluruhnya`,
      metadata: { fileName: file.name, fileHash: expectedHash, error: (e as Error).message.slice(0, 300) },
    }).catch(() => { /* audit gagal tidak boleh menutupi error asli */ });
    throw e instanceof AppError ? new AppError(`Impor dibatalkan seluruhnya: ${e.message} Unggah ulang untuk pratinjau terbaru.`) : e;
  }
  return { imported: valid.length, skipped: analyzed.length - valid.length, outstanding };
}

// ───────────────────────── Data warga ─────────────────────────

export const RESIDENT_SHEET = "Data Warga";
export const RESIDENT_COLUMNS: ColumnDef[] = [
  { header: "Nama Lengkap", key: "fullName", required: true, width: 30 },
  { header: "NIK", key: "nik", width: 20, note: "16 digit angka. Isi sebagai teks agar tidak berubah format." },
  { header: "No HP", key: "phone", width: 16, note: "Contoh 081234567890" },
  { header: "Email", key: "email", width: 26 },
  { header: "Status Warga", key: "status", width: 14, note: "Aktif atau Pendatang. Kosong = Aktif." },
  { header: "Status Hunian", key: "occupancy", required: true, width: 20, note: "Penghuni Tetap atau Sementara/Kontrak." },
  { header: "Tanggal Masuk", key: "moveInDate", width: 15, note: "YYYY-MM-DD atau DD/MM/YYYY (opsional)." },
  { header: "No Rumah", key: "house", width: 12, note: "Harus sudah ada di Data Rumah (opsional)." },
  { header: "Hubungan", key: "relation", width: 18, note: "Kepala Keluarga, Anggota Keluarga, atau Penyewa. Kosong = Kepala Keluarga." },
];

const STATUS_MAP: Record<string, ResidentStatus> = { aktif: "ACTIVE", pendatang: "NEWCOMER", "pendatang baru": "NEWCOMER" };
const OCC_MAP: Record<string, OccupancyStatus> = {
  "penghuni tetap": "PERMANENT", tetap: "PERMANENT", "sementara/kontrak": "TEMPORARY", sementara: "TEMPORARY", kontrak: "TEMPORARY",
};
const REL_MAP: Record<string, MembershipRelation> = { "kepala keluarga": "HEAD", "anggota keluarga": "FAMILY", anggota: "FAMILY", penyewa: "TENANT" };

export async function residentTemplate() {
  return buildTemplate({
    sheetName: RESIDENT_SHEET, columns: RESIDENT_COLUMNS,
    examples: [
      { fullName: "Budi Santoso", nik: "3603xxxxxxxxxxxx", phone: "081234567890", email: "", status: "Aktif", occupancy: "Penghuni Tetap", moveInDate: "2020-05-01", house: "A-01", relation: "Kepala Keluarga" },
    ],
    lists: { status: ["Aktif", "Pendatang"], occupancy: ["Penghuni Tetap", "Sementara/Kontrak"], relation: ["Kepala Keluarga", "Anggota Keluarga", "Penyewa"] },
    instructions: [
      "1. Satu baris = satu warga. Impor hanya MENAMBAH warga baru; data warga yang sudah ada tidak diubah.",
      "2. Warga dianggap duplikat bila NIK sudah terdaftar, atau (tanpa NIK) nama yang sama sudah tercatat di rumah yang sama.",
      "3. No Rumah harus sudah ada di menu Data Rumah. Kosongkan bila warga belum terhubung ke rumah.",
      "4. Warga berstatus Pindah atau Meninggal tidak diimpor; catat melalui menu Data Warga.",
      "5. Setelah unggah, periksa pratinjau, lalu klik Konfirmasi Impor. Unduh Berkas Hasil Validasi untuk memperbaiki baris bermasalah.",
    ],
  });
}

interface ResidentCandidate {
  fullName: string; nik: string | null; phone: string | null; email: string | null; status: ResidentStatus;
  occupancyStatus: OccupancyStatus; moveInDate: string | null; unitId: string | null; relation: MembershipRelation;
}

async function analyzeResidents(ctx: AuthContext, file: ImportFile) {
  assertCan(ctx, "residents.create");
  const rows = await readSheet(file.data, RESIDENT_COLUMNS, RESIDENT_SHEET);
  if (!rows.length) throw new AppError("Tidak ada data pada berkas.");
  const [units, existing] = await Promise.all([
    prisma.residentialUnit.findMany({ where: { organizationId: ctx.organizationId, isActive: true }, select: { id: true, houseNumber: true } }),
    prisma.resident.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      select: { fullName: true, nik: true, memberships: { where: { endDate: null }, select: { unitId: true } } },
    }),
  ]);
  const unitMap = new Map(units.map((u) => [matchKey(u.houseNumber), u]));
  const niks = new Set(existing.map((r) => decryptField(r.nik)).filter(Boolean) as string[]);
  const nameAtUnit = new Set(existing.flatMap((r) => r.memberships.map((m) => `${m.unitId}:${matchKey(r.fullName)}`)));
  const seenNik = new Map<string, number>();
  const seenNameUnit = new Map<string, number>();
  const today = todayDate();

  const analyzed: AnalyzedRow[] = [];
  const valid: ResidentCandidate[] = [];
  for (const r of rows) {
    const v = r.values;
    const msgs: string[] = [];
    const fullName = text(v.fullName).slice(0, 121);
    const nikRaw = text(v.nik).replace(/\s/g, "");
    const phone = phoneSchema.safeParse(text(v.phone).replace(/[\s-]/g, ""));
    const email = emailSchema.safeParse(text(v.email));
    const statusText = matchKey(text(v.status));
    const occText = matchKey(text(v.occupancy));
    const relText = matchKey(text(v.relation));
    const moveIn = dateValue(v.moveInDate);
    const house = text(v.house);

    if (!fullName) msgs.push("Nama Lengkap wajib diisi.");
    else if (fullName.length > 120) msgs.push("Nama Lengkap maksimal 120 karakter.");
    if (nikRaw && !/^\d{16}$/.test(nikRaw)) msgs.push("NIK harus 16 digit angka.");
    if (!phone.success) msgs.push(phone.error.issues[0].message);
    if (!email.success) msgs.push(email.error.issues[0].message);
    const status = statusText ? STATUS_MAP[statusText] : "ACTIVE";
    if (!status) msgs.push(statusText === "pindah" || statusText === "meninggal" ? "Warga berstatus Pindah/Meninggal dicatat melalui menu Data Warga." : "Status Warga harus Aktif atau Pendatang.");
    const occupancyStatus = OCC_MAP[occText];
    if (!occText) msgs.push("Status Hunian wajib diisi.");
    else if (!occupancyStatus) msgs.push("Status Hunian harus Penghuni Tetap atau Sementara/Kontrak.");
    const relation = relText ? REL_MAP[relText] : "HEAD";
    if (!relation) msgs.push("Hubungan harus Kepala Keluarga, Anggota Keluarga, atau Penyewa.");
    let moveInDate: string | null = null;
    if (moveIn === "INVALID") msgs.push("Tanggal Masuk tidak valid (gunakan YYYY-MM-DD).");
    else if (moveIn) {
      const d = new Date(`${moveIn}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || toIsoDate(d) !== moveIn) msgs.push("Tanggal Masuk tidak valid.");
      else if (dateOnly(moveIn) > today) msgs.push("Tanggal Masuk tidak boleh melebihi hari ini.");
      else moveInDate = moveIn;
    }
    let rowStatus: RowStatus = msgs.length ? "INVALID" : "VALID";
    const unit = house ? unitMap.get(matchKey(house)) : undefined;
    if (rowStatus === "VALID" && house && !unit) { rowStatus = "UNMATCHED"; msgs.push(`Rumah "${house}" tidak ditemukan di Data Rumah.`); }
    if (rowStatus === "VALID") {
      const nk = unit ? `${unit.id}:${matchKey(fullName)}` : null;
      if (nikRaw && niks.has(nikRaw)) { rowStatus = "DUPLICATE"; msgs.push("NIK sudah terdaftar di Data Warga."); }
      else if (nikRaw && seenNik.has(nikRaw)) { rowStatus = "DUPLICATE"; msgs.push(`NIK sama dengan baris Excel ${seenNik.get(nikRaw)}.`); }
      else if (!nikRaw && nk && nameAtUnit.has(nk)) { rowStatus = "DUPLICATE"; msgs.push(`Warga dengan nama yang sama sudah tercatat di rumah ${unit!.houseNumber}.`); }
      else if (nk && seenNameUnit.has(nk)) { rowStatus = "DUPLICATE"; msgs.push(`Nama dan rumah sama dengan baris Excel ${seenNameUnit.get(nk)}.`); }
      if (rowStatus === "VALID") {
        if (nikRaw) seenNik.set(nikRaw, r.rowNumber);
        if (nk) seenNameUnit.set(nk, r.rowNumber);
        valid.push({ fullName, nik: nikRaw || null, phone: phone.success ? phone.data : null, email: email.success ? email.data : null, status: status!, occupancyStatus: occupancyStatus!, moveInDate, unitId: unit?.id ?? null, relation: relation! });
      }
    }
    analyzed.push({
      rowNumber: r.rowNumber, status: rowStatus, messages: msgs,
      display: { name: fullName, nik: nikRaw ? `${nikRaw.slice(0, 4)}••••••••${nikRaw.slice(-4)}` : "-", house: house || "-", occupancy: text(v.occupancy) || "-" },
    });
  }
  return { rows, analyzed, valid };
}

export async function previewResidentImport(ctx: AuthContext, file: ImportFile) {
  const { rows, analyzed } = await analyzeResidents(ctx, file);
  return finishPreview(file, RESIDENT_SHEET, RESIDENT_COLUMNS, rows, analyzed);
}

export async function confirmResidentImport(ctx: AuthContext, file: ImportFile, expectedHash: string) {
  assertSameFile(file, expectedHash);
  const { analyzed, valid } = await analyzeResidents(ctx, file);
  if (!valid.length) throw new AppError("Tidak ada baris valid untuk diimpor.");
  const counts = emptyCounts();
  for (const a of analyzed) counts[a.status]++;
  try {
    await prisma.$transaction(async (tx) => {
      for (const c of valid) {
        const code = await nextNumber(tx, ctx.organizationId, "W");
        const resident = await tx.resident.create({
          data: {
            organizationId: ctx.organizationId, code, fullName: c.fullName, nik: encryptField(c.nik), phone: c.phone, email: c.email,
            status: c.status, occupancyStatus: c.occupancyStatus, moveInDate: c.moveInDate ? dateOnly(c.moveInDate) : null,
            createdById: ctx.userId, updatedById: ctx.userId,
          },
        });
        if (c.unitId) {
          await tx.residentUnitMembership.create({
            data: {
              organizationId: ctx.organizationId, residentId: resident.id, unitId: c.unitId, relation: c.relation,
              startDate: c.moveInDate ? dateOnly(c.moveInDate) : todayDate(), createdById: ctx.userId,
            },
          });
        }
        await tx.residentHistory.create({
          data: { residentId: resident.id, action: "CREATED", changes: { status: c.status, occupancyStatus: c.occupancyStatus }, note: `Impor Excel: ${file.name}`, actorId: ctx.userId },
        });
      }
      await writeAudit(ctx, {
        action: "RESIDENTS_IMPORTED", module: "residents",
        summary: `Impor data warga dari ${file.name}: ${valid.length} warga ditambahkan, ${analyzed.length - valid.length} baris dilewati`,
        metadata: { fileName: file.name, fileHash: expectedHash, counts, imported: valid.length },
      }, tx);
    }, { timeout: 60_000 });
  } catch (e) {
    await writeAudit(ctx, {
      action: "RESIDENTS_IMPORTED", module: "residents", status: "FAILED",
      summary: `Impor data warga dari ${file.name} gagal dan dibatalkan seluruhnya`,
      metadata: { fileName: file.name, fileHash: expectedHash, error: (e as Error).message.slice(0, 300) },
    }).catch(() => { /* audit gagal tidak boleh menutupi error asli */ });
    throw e instanceof AppError ? new AppError(`Impor dibatalkan seluruhnya: ${e.message}`) : e;
  }
  return { imported: valid.length, skipped: analyzed.length - valid.length };
}
