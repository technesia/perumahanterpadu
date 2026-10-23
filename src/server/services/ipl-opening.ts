import { z } from "zod";
import type { IplBillStatus, Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { assertCan, type AuthContext } from "../auth/context";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { writeAudit } from "../audit";
import { optionalIsoDate, optionalText, pageParams, rupiahSchema } from "../validation";
import { PENDING_PAYMENT_STATUSES, currentPeriod } from "./ipl";
import { addDays, dateOnly, todayDate } from "@/lib/dates";
import { comparePeriod, correctOpening, dueDateFor, LUMP_PERIOD, OPENING_KINDS, type Period } from "@/lib/ipl";
import { periodLabel, rupiah } from "@/lib/format";

// ───────────────────────── Inti: rencana & penyimpanan baris tunggakan awal ─────────────────────────

export interface OpeningRow {
  unitId: string;
  residentId: string;
  iplTypeId: string;
  /** Periode bulanan, atau LUMP_PERIOD (0/0) untuk tunggakan tanpa rincian periode. */
  period: Period;
  amount: number;
  /** Bagian yang sudah dibayar sebelum aplikasi digunakan (bukan pemasukan kas). */
  initialPaid: number;
  notes: string | null;
  /** Hanya untuk tunggakan tanpa rincian: tanggal saldo dicatat. */
  asOf?: Date | null;
}

export type PlanIssue = { kind: "DUPLICATE"; message: string };

const key = (unitId: string, p: Period) => `${unitId}:${p.year}:${p.month}`;
const isLump = (p: Period) => p.year === 0 && p.month === 0;

/**
 * Mengecek duplikasi terhadap data yang sudah ada & antarbaris. Satu rumah hanya boleh memiliki
 * satu tagihan aktif per periode bulanan (jenis iuran apa pun, termasuk tagihan bulanan dari
 * aplikasi) dan satu tunggakan awal tanpa rincian periode.
 * Mengembalikan isu per indeks baris; baris tanpa isu aman disimpan.
 */
export async function planOpeningRows(db: Tx, organizationId: string, rows: OpeningRow[]) {
  const unitIds = [...new Set(rows.map((r) => r.unitId))];
  const existing = unitIds.length
    ? await db.iplBill.findMany({
      where: { organizationId, unitId: { in: unitIds }, status: { not: "VOID" } },
      select: { unitId: true, periodYear: true, periodMonth: true, kind: true },
    })
    : [];
  const taken = new Map(existing.map((e) => [key(e.unitId, { year: e.periodYear, month: e.periodMonth }), e.kind]));
  const seen = new Map<string, number>();
  const issues = new Map<number, PlanIssue>();
  rows.forEach((r, i) => {
    const k = key(r.unitId, r.period);
    const label = periodLabel(r.period.year, r.period.month);
    const kind = taken.get(k);
    if (kind) {
      issues.set(i, {
        kind: "DUPLICATE",
        message: isLump(r.period)
          ? "Rumah ini sudah memiliki tunggakan awal tanpa rincian periode. Gunakan koreksi untuk mengubahnya."
          : kind === "REGULAR"
            ? `Periode ${label} sudah memiliki tagihan bulanan di aplikasi.`
            : `Periode ${label} sudah tercatat sebagai tunggakan awal.`,
      });
      return;
    }
    if (seen.has(k)) {
      issues.set(i, { kind: "DUPLICATE", message: `${isLump(r.period) ? "Tunggakan tanpa rincian" : `Periode ${label}`} untuk rumah ini muncul lebih dari sekali (sama dengan baris ${seen.get(k)! + 1}).` });
      return;
    }
    seen.set(k, i);
  });
  return issues;
}

/** Tanggal jatuh tempo tunggakan tanpa rincian: tanggal saldo (paling lambat kemarin) agar langsung terhitung tunggakan. */
function lumpDueDate(asOf: Date | null | undefined, today = todayDate()) {
  const yesterday = addDays(today, -1);
  return asOf && asOf < today ? asOf : yesterday;
}

/**
 * Menyimpan baris tunggakan awal dalam transaksi yang sudah berjalan. Pemanggil wajib sudah
 * memvalidasi identitas warga/rumah. Duplikasi dicek ulang di dalam transaksi (setelah rumah
 * dikunci) sehingga dua proses bersamaan tidak dapat mencatat periode yang sama.
 * Tidak pernah mencatat pemasukan kas.
 */
export async function insertOpeningRows(tx: Tx, ctx: AuthContext, rows: OpeningRow[]) {
  const unitIds = [...new Set(rows.map((r) => r.unitId))].sort();
  if (unitIds.length) await tx.$queryRaw`SELECT id FROM residential_units WHERE id = ANY(${unitIds}::text[]) ORDER BY id FOR UPDATE`;
  const issues = await planOpeningRows(tx, ctx.organizationId, rows);
  if (issues.size) {
    const [i, issue] = [...issues.entries()][0];
    throw new ConflictError(rows.length > 1 ? `Baris ${i + 1}: ${issue.message}` : issue.message);
  }
  const types = await tx.iplType.findMany({ where: { organizationId: ctx.organizationId, id: { in: [...new Set(rows.map((r) => r.iplTypeId))] } } });
  const typeMap = new Map(types.map((t) => [t.id, t]));
  const ids: string[] = [];
  for (const r of rows) {
    const type = typeMap.get(r.iplTypeId);
    if (!type) throw new AppError("Jenis iuran tidak valid.");
    if (r.initialPaid > r.amount) throw new AppError("Nominal terbayar melebihi nominal tagihan.");
    const lump = isLump(r.period);
    const status: IplBillStatus = r.initialPaid === 0 ? "UNPAID" : r.initialPaid === r.amount ? "PAID" : "PARTIAL";
    const data = {
      residentId: r.residentId, amount: r.amount, paidAmount: r.initialPaid, initialPaidAmount: r.initialPaid,
      status, kind: lump ? ("OPENING_LUMP" as const) : ("OPENING_PERIOD" as const), notes: r.notes,
      dueDate: lump ? lumpDueDate(r.asOf) : dueDateFor(r.period, type.dueDay),
      paidAt: status === "PAID" ? new Date() : null, createdById: ctx.userId,
    };
    // Tagihan yang pernah dibatalkan untuk kunci yang sama dipakai ulang (unique constraint).
    const voided = await tx.iplBill.findUnique({
      where: { organizationId_unitId_iplTypeId_periodYear_periodMonth: { organizationId: ctx.organizationId, unitId: r.unitId, iplTypeId: r.iplTypeId, periodYear: r.period.year, periodMonth: r.period.month } },
      select: { id: true, status: true },
    });
    if (voided && voided.status !== "VOID") throw new ConflictError(`Periode ${periodLabel(r.period.year, r.period.month)} sudah tercatat.`);
    const bill = voided
      ? await tx.iplBill.update({ where: { id: voided.id }, data })
      : await tx.iplBill.create({ data: { ...data, organizationId: ctx.organizationId, unitId: r.unitId, iplTypeId: r.iplTypeId, periodYear: r.period.year, periodMonth: r.period.month } });
    ids.push(bill.id);
  }
  return ids;
}

// ───────────────────────── Input manual ─────────────────────────

const periodRowSchema = z.object({
  year: z.coerce.number().int().min(2000, "Tahun tidak valid.").max(2100, "Tahun tidak valid."),
  month: z.coerce.number().int().min(1, "Bulan tidak valid.").max(12, "Bulan tidak valid."),
  amount: rupiahSchema("Nominal tagihan"),
  paidAmount: z.coerce.number().int("Nominal terbayar harus bilangan bulat.").min(0, "Nominal terbayar tidak boleh negatif.").max(2_000_000_000).default(0),
});

export const openingInputSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("LUMP"),
    residentId: z.string().min(1, "Warga wajib dipilih.").max(40),
    unitId: z.string().min(1, "Rumah wajib dipilih.").max(40),
    iplTypeId: z.string().min(1, "Jenis iuran wajib dipilih.").max(40),
    amount: rupiahSchema("Total tunggakan"),
    asOf: optionalIsoDate,
    notes: optionalText(500),
  }),
  z.object({
    method: z.literal("PERIOD"),
    residentId: z.string().min(1, "Warga wajib dipilih.").max(40),
    unitId: z.string().min(1, "Rumah wajib dipilih.").max(40),
    iplTypeId: z.string().min(1, "Jenis iuran wajib dipilih.").max(40),
    periods: z.array(periodRowSchema).min(1, "Tambahkan minimal satu periode.").max(120, "Maksimal 120 periode sekali simpan."),
    notes: optionalText(500),
  }),
], { errorMap: () => ({ message: "Metode input wajib dipilih." }) });
export type OpeningInput = z.input<typeof openingInputSchema>;

/** Warga aktif yang tercatat sebagai penghuni aktif rumah tersebut. */
async function assertResidentOfUnit(organizationId: string, residentId: string, unitId: string) {
  const m = await prisma.residentUnitMembership.findFirst({
    where: { organizationId, residentId, unitId, endDate: null, resident: { archivedAt: null }, unit: { isActive: true } },
    include: { resident: { select: { fullName: true } }, unit: { select: { houseNumber: true } } },
  });
  if (!m) throw new AppError("Warga tidak terdaftar sebagai penghuni aktif rumah tersebut.", "VALIDATION", { residentId: "Pilih warga yang terhubung dengan rumah." });
  return m;
}

export async function createOpeningArrears(ctx: AuthContext, input: OpeningInput) {
  assertCan(ctx, "ipl.opening_manage");
  const data = openingInputSchema.parse(input);
  const m = await assertResidentOfUnit(ctx.organizationId, data.residentId, data.unitId);
  const type = await prisma.iplType.findFirst({ where: { id: data.iplTypeId, organizationId: ctx.organizationId } });
  if (!type) throw new AppError("Jenis iuran tidak ditemukan.", "VALIDATION", { iplTypeId: "Tidak valid." });
  const now = currentPeriod();

  let rows: OpeningRow[];
  if (data.method === "LUMP") {
    const asOf = data.asOf ? dateOnly(data.asOf) : null;
    if (asOf && asOf > todayDate()) throw new AppError("Tanggal saldo tidak boleh melebihi hari ini.", "VALIDATION", { asOf: "Tidak boleh melebihi hari ini." });
    rows = [{ unitId: data.unitId, residentId: data.residentId, iplTypeId: type.id, period: LUMP_PERIOD, amount: data.amount, initialPaid: 0, notes: data.notes, asOf }];
  } else {
    rows = data.periods.map((p, i) => {
      const period = { year: p.year, month: p.month };
      if (comparePeriod(period, now) > 0) throw new AppError(`Baris ${i + 1}: tunggakan awal tidak boleh untuk periode mendatang.`, "VALIDATION", { [`periods.${i}`]: "Periode mendatang." });
      if (p.paidAmount > p.amount) throw new AppError(`Baris ${i + 1}: nominal terbayar melebihi nominal tagihan.`, "VALIDATION", { [`periods.${i}`]: "Terbayar melebihi tagihan." });
      return { unitId: data.unitId, residentId: data.residentId, iplTypeId: type.id, period, amount: p.amount, initialPaid: p.paidAmount, notes: data.notes };
    });
  }

  return prisma.$transaction(async (tx) => {
    const ids = await insertOpeningRows(tx, ctx, rows);
    const total = rows.reduce((s, r) => s + r.amount - r.initialPaid, 0);
    await writeAudit(ctx, {
      action: "IPL_OPENING_CREATED", module: "ipl", entityType: "ResidentialUnit", entityId: data.unitId,
      summary: data.method === "LUMP"
        ? `Mencatat tunggakan awal tanpa rincian periode ${rupiah(total)} untuk ${m.resident.fullName} (${m.unit.houseNumber})`
        : `Mencatat tunggakan awal ${rows.length} periode (${rows.map((r) => periodLabel(r.period.year, r.period.month)).join(", ")}) sisa ${rupiah(total)} untuk ${m.resident.fullName} (${m.unit.houseNumber})`,
      metadata: { method: data.method, billIds: ids, iplType: type.name, outstanding: total },
    }, tx);
    return { count: ids.length, outstanding: total };
  });
}

// ───────────────────────── Koreksi & pembatalan ─────────────────────────

async function lockOpeningBill(tx: Tx, ctx: AuthContext, billId: string) {
  const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ipl_bills WHERE id = ${billId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  if (!row) throw new NotFoundError("Tunggakan tidak ditemukan.");
  const bill = await tx.iplBill.findUniqueOrThrow({
    where: { id: billId },
    include: { unit: { select: { houseNumber: true } }, allocations: { select: { payment: { select: { status: true } } } } },
  });
  if (bill.kind === "REGULAR") throw new AppError("Hanya tunggakan awal yang dapat dikoreksi di menu ini.");
  if (bill.allocations.some((a) => (PENDING_PAYMENT_STATUSES as readonly string[]).includes(a.payment.status))) {
    throw new ConflictError("Tunggakan sedang dalam proses verifikasi pembayaran. Selesaikan verifikasi terlebih dahulu.");
  }
  return bill;
}

export const correctionSchema = z.object({
  amount: rupiahSchema("Nominal tagihan"),
  initialPaidAmount: z.coerce.number().int("Nominal terbayar harus bilangan bulat.").min(0, "Nominal terbayar tidak boleh negatif.").max(2_000_000_000),
  reason: z.string().trim().min(5, "Alasan koreksi wajib diisi (minimal 5 karakter).").max(500),
});

/**
 * Koreksi nominal tunggakan awal. Menyimpan nilai sebelum/sesudah, pelaku, dan waktu.
 * Pembayaran yang sudah dikonfirmasi lewat aplikasi tidak berubah dan kas tidak disentuh,
 * sehingga koreksi tidak dapat menggandakan pemasukan maupun pengeluaran.
 */
export async function correctOpeningBill(ctx: AuthContext, billId: string, input: z.input<typeof correctionSchema>) {
  assertCan(ctx, "ipl.opening_manage");
  const data = correctionSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const bill = await lockOpeningBill(tx, ctx, billId);
    if (bill.status === "VOID") throw new AppError("Tunggakan yang sudah dibatalkan tidak dapat dikoreksi.");
    if (bill.kind === "OPENING_LUMP" && data.initialPaidAmount !== bill.initialPaidAmount && data.initialPaidAmount !== 0) {
      throw new AppError("Tunggakan tanpa rincian periode dicatat sebagai sisa tunggakan; ubah total nominalnya saja.", "VALIDATION", { initialPaidAmount: "Isi 0." });
    }
    let next;
    try {
      next = correctOpening(bill, { amount: data.amount, initialPaidAmount: data.initialPaidAmount });
    } catch (e) {
      const appPaid = bill.paidAmount - bill.initialPaidAmount;
      throw new AppError(
        appPaid > 0 && (e as Error).message.includes("lebih kecil")
          ? `Nominal tidak boleh lebih kecil dari total terbayar (${rupiah(appPaid + data.initialPaidAmount)}), termasuk ${rupiah(appPaid)} yang dibayar lewat aplikasi.`
          : (e as Error).message,
        "VALIDATION", { amount: "Periksa nominal." },
      );
    }
    if (next.amount === bill.amount && next.initialPaidAmount === bill.initialPaidAmount) throw new AppError("Tidak ada perubahan nilai.");
    await tx.iplBillCorrection.create({
      data: {
        organizationId: ctx.organizationId, billId, reason: data.reason, actorId: ctx.userId, actorName: ctx.name,
        amountBefore: bill.amount, amountAfter: next.amount,
        initialPaidBefore: bill.initialPaidAmount, initialPaidAfter: next.initialPaidAmount,
        statusBefore: bill.status, statusAfter: next.status,
      },
    });
    await tx.iplBill.update({
      where: { id: billId },
      data: { ...next, paidAt: next.status === "PAID" ? bill.paidAt ?? new Date() : null },
    });
    const label = periodLabel(bill.periodYear, bill.periodMonth);
    await writeAudit(ctx, {
      action: "IPL_OPENING_CORRECTED", module: "ipl", entityType: "IplBill", entityId: billId,
      summary: `Koreksi tunggakan awal ${bill.unit.houseNumber} ${label}: ${rupiah(bill.amount - bill.paidAmount)} → ${rupiah(next.amount - next.paidAmount)} sisa`,
      metadata: {
        reason: data.reason,
        before: { amount: bill.amount, initialPaidAmount: bill.initialPaidAmount, paidAmount: bill.paidAmount, status: bill.status },
        after: next,
      },
    }, tx);
    return next;
  });
}

/** Membatalkan tunggakan awal yang salah input. Ditolak bila sudah ada pembayaran lewat aplikasi. */
export async function cancelOpeningBill(ctx: AuthContext, billId: string, reason: string) {
  assertCan(ctx, "ipl.opening_manage");
  const r = reason.trim();
  if (r.length < 5) throw new AppError("Alasan pembatalan wajib diisi (minimal 5 karakter).", "VALIDATION", { reason: "Alasan wajib diisi." });
  return prisma.$transaction(async (tx) => {
    const bill = await lockOpeningBill(tx, ctx, billId);
    if (bill.status === "VOID") throw new AppError("Tunggakan sudah dibatalkan.");
    if (bill.paidAmount - bill.initialPaidAmount > 0) {
      throw new AppError("Tunggakan sudah menerima pembayaran lewat aplikasi sehingga tidak dapat dibatalkan. Gunakan koreksi nominal.");
    }
    await tx.iplBillCorrection.create({
      data: {
        organizationId: ctx.organizationId, billId, reason: r, actorId: ctx.userId, actorName: ctx.name,
        amountBefore: bill.amount, amountAfter: bill.amount,
        initialPaidBefore: bill.initialPaidAmount, initialPaidAfter: bill.initialPaidAmount,
        statusBefore: bill.status, statusAfter: "VOID",
      },
    });
    await tx.iplBill.update({ where: { id: billId }, data: { status: "VOID" } });
    await writeAudit(ctx, {
      action: "IPL_OPENING_CANCELLED", module: "ipl", entityType: "IplBill", entityId: billId,
      summary: `Membatalkan tunggakan awal ${bill.unit.houseNumber} ${periodLabel(bill.periodYear, bill.periodMonth)} (${rupiah(bill.amount - bill.paidAmount)})`,
      metadata: { reason: r, amount: bill.amount, initialPaidAmount: bill.initialPaidAmount, statusBefore: bill.status },
    }, tx);
  });
}

// ───────────────────────── Query & ringkasan ─────────────────────────

const openingWhere = (organizationId: string): Prisma.IplBillWhereInput => ({ organizationId, kind: { in: [...OPENING_KINDS] }, status: { not: "VOID" } });

/**
 * Ringkasan piutang tunggakan awal:
 * - total tunggakan awal = nominal − bagian yang sudah dibayar sebelum aplikasi
 * - pembayaran atas tunggakan = pembayaran terkonfirmasi lewat aplikasi (masuk kas)
 * - sisa piutang = nominal − seluruh pembayaran
 */
export async function openingSummary(ctx: AuthContext) {
  assertCan(ctx, "ipl.view");
  const [agg, lump, units] = await Promise.all([
    prisma.iplBill.aggregate({ where: openingWhere(ctx.organizationId), _sum: { amount: true, paidAmount: true, initialPaidAmount: true }, _count: { _all: true } }),
    prisma.iplBill.count({ where: { ...openingWhere(ctx.organizationId), kind: "OPENING_LUMP" } }),
    prisma.iplBill.groupBy({ by: ["unitId"], where: openingWhere(ctx.organizationId) }),
  ]);
  const amount = agg._sum.amount ?? 0;
  const paid = agg._sum.paidAmount ?? 0;
  const initialPaid = agg._sum.initialPaidAmount ?? 0;
  return {
    records: agg._count._all, lumpRecords: lump, units: units.length,
    openingTotal: amount - initialPaid,
    paidViaApp: paid - initialPaid,
    remaining: amount - paid,
  };
}

export interface OpeningFilter { q?: string; kind?: string; status?: string; page: number }

export async function listOpeningBills(ctx: AuthContext, f: OpeningFilter, pageSize = 30) {
  assertCan(ctx, "ipl.view");
  const where: Prisma.IplBillWhereInput = { organizationId: ctx.organizationId, kind: { in: [...OPENING_KINDS] } };
  if (f.kind === "OPENING_PERIOD" || f.kind === "OPENING_LUMP") where.kind = f.kind;
  if (f.status === "OPEN") where.status = { in: ["UNPAID", "PARTIAL"] };
  else if (f.status === "PAID" || f.status === "VOID") where.status = f.status;
  if (f.q) {
    const q = f.q.trim().slice(0, 60);
    where.OR = [
      { unit: { houseNumber: { contains: q, mode: "insensitive" } } },
      { resident: { fullName: { contains: q, mode: "insensitive" } } },
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.iplBill.findMany({
      where,
      include: {
        unit: { select: { houseNumber: true } }, resident: { select: { fullName: true } }, iplType: { select: { name: true } },
        allocations: { select: { amount: true, payment: { select: { status: true, number: true } } } },
        _count: { select: { corrections: true } },
      },
      orderBy: [{ unit: { houseNumber: "asc" } }, { periodYear: "asc" }, { periodMonth: "asc" }],
      ...pageParams(f.page, pageSize),
    }),
    prisma.iplBill.count({ where }),
  ]);
  return {
    total,
    items: rows.map((b) => {
      const pending = b.allocations.some((a) => (PENDING_PAYMENT_STATUSES as readonly string[]).includes(a.payment.status));
      return {
        id: b.id, kind: b.kind, status: b.status, houseNumber: b.unit.houseNumber, residentName: b.resident?.fullName ?? null,
        typeName: b.iplType.name, periodYear: b.periodYear, periodMonth: b.periodMonth, dueDate: b.dueDate,
        amount: b.amount, initialPaidAmount: b.initialPaidAmount, paidViaApp: b.paidAmount - b.initialPaidAmount,
        outstanding: b.amount - b.paidAmount, notes: b.notes, pending, corrections: b._count.corrections,
      };
    }),
  };
}

/** Riwayat koreksi sebuah tunggakan awal (terbaru dulu). */
export async function openingCorrections(ctx: AuthContext, billId: string) {
  assertCan(ctx, "ipl.view");
  const bill = await prisma.iplBill.findFirst({ where: { id: billId, organizationId: ctx.organizationId, kind: { in: [...OPENING_KINDS] } }, select: { id: true } });
  if (!bill) throw new NotFoundError("Tunggakan tidak ditemukan.");
  return prisma.iplBillCorrection.findMany({ where: { billId }, orderBy: { createdAt: "desc" } });
}
