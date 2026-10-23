import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { ensureSeed, makeHousehold, makeUser, PNG_1PX, prisma, uniq } from "./helpers";
import { currentPeriod, generateBills, myBills, saveIplType, unpaidSummary, voidBill } from "@/server/services/ipl";
import { approvePayment, submitPayment } from "@/server/services/ipl-payments";
import { cancelOpeningBill, correctOpeningBill, createOpeningArrears, openingSummary } from "@/server/services/ipl-opening";
import {
  confirmOpeningImport, confirmResidentImport, OPENING_COLUMNS, openingTemplate, previewOpeningImport, previewResidentImport,
  RESIDENT_COLUMNS, residentTemplate,
} from "@/server/services/imports";
import { readSheet } from "@/server/excel";
import { addMonths, correctOpening } from "@/lib/ipl";
import { periodLabel } from "@/lib/format";
import { ForbiddenError } from "@/server/errors";

beforeAll(ensureSeed);

const proof = () => ({ name: "bukti.png", data: PNG_1PX });
const incomeCount = (organizationId: string) => prisma.financeTransaction.count({ where: { organizationId, type: "INCOME" } });

async function setup() {
  const { ctx: admin } = await makeUser("ADMIN");
  const type = await saveIplType(admin, null, { name: uniq("IPL Awal "), amount: 100000, dueDay: 10, isActive: true });
  const hh = await makeHousehold({ withAccount: true });
  return { admin, type, ...hh, member: hh.member! };
}

async function xlsx(sheet: string, header: string[], rows: (string | number | null)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  return { name: "uji.xlsx", data: Buffer.from(await wb.xlsx.writeBuffer()) };
}

describe("Logika koreksi tunggakan awal", () => {
  it("mempertahankan pembayaran lewat aplikasi dan menghitung status ulang", () => {
    const bill = { amount: 100000, paidAmount: 70000, initialPaidAmount: 20000, status: "PARTIAL" as const };
    expect(correctOpening(bill, { amount: 120000, initialPaidAmount: 20000 })).toEqual({ amount: 120000, initialPaidAmount: 20000, paidAmount: 70000, status: "PARTIAL" });
    expect(correctOpening(bill, { amount: 80000, initialPaidAmount: 30000 })).toMatchObject({ paidAmount: 80000, status: "PAID" });
    expect(() => correctOpening(bill, { amount: 40000, initialPaidAmount: 0 })).toThrow(/lebih kecil/);
  });
});

describe("Input tunggakan awal manual", () => {
  it("periode bulanan: tercatat sebagai tagihan, tanpa pemasukan kas, dan menolak periode ganda", async () => {
    const s = await setup();
    const before = await incomeCount(s.admin.organizationId);
    const old = addMonths(currentPeriod(), -70); // di luar jendela 60 bulan → tetap dilacak
    const p1 = addMonths(currentPeriod(), -3);
    await createOpeningArrears(s.admin, {
      method: "PERIOD", residentId: s.resident.id, unitId: s.unit.id, iplTypeId: s.type.id,
      periods: [{ ...old, amount: 80000, paidAmount: 0 }, { ...p1, amount: 100000, paidAmount: 40000 }],
    });
    const bills = await prisma.iplBill.findMany({ where: { unitId: s.unit.id }, orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }] });
    expect(bills.map((b) => [b.kind, b.status, b.paidAmount, b.initialPaidAmount])).toEqual([
      ["OPENING_PERIOD", "UNPAID", 0, 0], ["OPENING_PERIOD", "PARTIAL", 40000, 40000],
    ]);
    expect(await incomeCount(s.admin.organizationId)).toBe(before);
    // Langsung tercermin di tagihan warga, termasuk periode di luar jendela
    const mine = await myBills(s.member.ctx);
    expect(mine.summary.arrearsAmount).toBe(80000 + 60000);
    // Duplikasi: periode sama (meski jenis iuran berbeda) ditolak
    const other = await saveIplType(s.admin, null, { name: uniq("Sampah "), amount: 20000, dueDay: 10, isActive: true });
    await expect(createOpeningArrears(s.admin, {
      method: "PERIOD", residentId: s.resident.id, unitId: s.unit.id, iplTypeId: other.id, periods: [{ ...p1, amount: 20000, paidAmount: 0 }],
    })).rejects.toThrow(/sudah tercatat sebagai tunggakan awal/);
    await expect(createOpeningArrears(s.admin, {
      method: "PERIOD", residentId: s.resident.id, unitId: s.unit.id, iplTypeId: s.type.id,
      periods: [{ ...addMonths(p1, -1), amount: 1, paidAmount: 0 }, { ...addMonths(p1, -1), amount: 1, paidAmount: 0 }],
    })).rejects.toThrow(/lebih dari sekali/);
    // Penerbitan tagihan bulanan melewati periode tunggakan awal
    const g = await generateBills(s.admin, { iplTypeId: s.type.id, fromYear: p1.year, fromMonth: p1.month, toYear: p1.year, toMonth: p1.month, unitIds: [s.unit.id] });
    expect(g).toMatchObject({ created: 0, skippedOpening: 1 });
  });

  it("menolak warga yang bukan penghuni rumah, periode mendatang, dan pengguna tanpa izin", async () => {
    const s = await setup();
    const other = await makeHousehold();
    await expect(createOpeningArrears(s.admin, { method: "LUMP", residentId: other.resident.id, unitId: s.unit.id, iplTypeId: s.type.id, amount: 1000 }))
      .rejects.toThrow(/bukan|tidak terdaftar/i);
    await expect(createOpeningArrears(s.admin, {
      method: "PERIOD", residentId: s.resident.id, unitId: s.unit.id, iplTypeId: s.type.id, periods: [{ ...addMonths(currentPeriod(), 1), amount: 1000, paidAmount: 0 }],
    })).rejects.toThrow(/mendatang/);
    await expect(createOpeningArrears(s.member.ctx, { method: "LUMP", residentId: s.resident.id, unitId: s.unit.id, iplTypeId: s.type.id, amount: 1000 }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it("total nominal: Tunggakan Awal Tanpa Rincian Periode, dibayar sebagian lewat aplikasi → kas & piutang konsisten", async () => {
    const s = await setup();
    await createOpeningArrears(s.admin, { method: "LUMP", residentId: s.resident.id, unitId: s.unit.id, iplTypeId: s.type.id, amount: 900000 });
    await expect(createOpeningArrears(s.admin, { method: "LUMP", residentId: s.resident.id, unitId: s.unit.id, iplTypeId: s.type.id, amount: 5 }))
      .rejects.toThrow(/sudah memiliki tunggakan awal tanpa rincian/);
    const lump = await prisma.iplBill.findFirstOrThrow({ where: { unitId: s.unit.id, kind: "OPENING_LUMP" } });
    expect([lump.periodYear, lump.periodMonth]).toEqual([0, 0]);
    expect(periodLabel(0, 0)).toMatch(/tanpa rincian periode/);
    const mine = await myBills(s.member.ctx);
    expect(mine.summary.payable.map((b) => b.id)).toContain(lump.id);
    expect((await unpaidSummary(s.admin)).amount).toBeGreaterThanOrEqual(900000);

    const org = await prisma.organization.findFirstOrThrow({ where: { id: s.admin.organizationId } });
    await prisma.organization.update({ where: { id: org.id }, data: { allowPartialPayment: true } });
    try {
      const p = await submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: [lump.id], amounts: { [lump.id]: 300000 }, method: "BANK_TRANSFER" }, proof());
      await approvePayment(s.admin, p.id);
      const after = await prisma.iplBill.findUniqueOrThrow({ where: { id: lump.id } });
      expect([after.status, after.paidAmount, after.initialPaidAmount]).toEqual(["PARTIAL", 300000, 0]);
      expect(await prisma.financeTransaction.count({ where: { iplPaymentId: p.id } })).toBe(1);
      expect((await prisma.financeTransaction.findFirstOrThrow({ where: { iplPaymentId: p.id } })).amount).toBe(300000);
    } finally {
      await prisma.organization.update({ where: { id: org.id }, data: { allowPartialPayment: org.allowPartialPayment } });
    }
  });
});

describe("Koreksi & audit tunggakan awal", () => {
  it("menyimpan nilai sebelum/sesudah, pelaku, alasan; tidak menyentuh kas; pembayaran terkonfirmasi tetap", async () => {
    const s = await setup();
    const p1 = addMonths(currentPeriod(), -2);
    await createOpeningArrears(s.admin, { method: "PERIOD", residentId: s.resident.id, unitId: s.unit.id, iplTypeId: s.type.id, periods: [{ ...p1, amount: 100000, paidAmount: 0 }] });
    const bill = await prisma.iplBill.findFirstOrThrow({ where: { unitId: s.unit.id } });
    const pay = await submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: [bill.id], method: "CASH" }, null);
    // Saat menunggu verifikasi, koreksi ditolak
    await expect(correctOpeningBill(s.admin, bill.id, { amount: 90000, initialPaidAmount: 0, reason: "Salah input nominal" })).rejects.toThrow(/verifikasi/);
    await approvePayment(s.admin, pay.id);
    const incomeBefore = await incomeCount(s.admin.organizationId);
    await expect(correctOpeningBill(s.admin, bill.id, { amount: 50000, initialPaidAmount: 0, reason: "Terlalu kecil" })).rejects.toThrow(/tidak boleh lebih kecil/);
    await expect(correctOpeningBill(s.admin, bill.id, { amount: 120000, initialPaidAmount: 0, reason: "abc" })).rejects.toThrow();
    await correctOpeningBill(s.admin, bill.id, { amount: 120000, initialPaidAmount: 0, reason: "Nominal sesuai buku kas lama" });
    const after = await prisma.iplBill.findUniqueOrThrow({ where: { id: bill.id } });
    expect([after.amount, after.paidAmount, after.status]).toEqual([120000, 100000, "PARTIAL"]);
    const corr = await prisma.iplBillCorrection.findFirstOrThrow({ where: { billId: bill.id } });
    expect(corr).toMatchObject({ amountBefore: 100000, amountAfter: 120000, statusBefore: "PAID", statusAfter: "PARTIAL", actorId: s.admin.userId, reason: "Nominal sesuai buku kas lama" });
    expect(await incomeCount(s.admin.organizationId)).toBe(incomeBefore);
    expect((await prisma.iplPayment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe("APPROVED");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: bill.id, action: "IPL_OPENING_CORRECTED" } });
    expect(log.metadata).toMatchObject({ before: { amount: 100000 }, after: { amount: 120000 } });
    // Riwayat koreksi append-only di level database
    await expect(prisma.iplBillCorrection.update({ where: { id: corr.id }, data: { reason: "ubah riwayat" } })).rejects.toThrow();
    // Sudah ada pembayaran lewat aplikasi → tidak dapat dibatalkan; voidBill biasa juga ditolak
    await expect(cancelOpeningBill(s.admin, bill.id, "Salah rumah")).rejects.toThrow(/pembayaran lewat aplikasi/);
    await expect(voidBill(s.admin, bill.id, "x")).rejects.toThrow(/menu Tunggakan Awal/);
  });

  it("pembatalan mencatat riwayat dan ringkasan piutang konsisten", async () => {
    const s = await setup();
    const p1 = addMonths(currentPeriod(), -4);
    const before = await openingSummary(s.admin);
    await createOpeningArrears(s.admin, {
      method: "PERIOD", residentId: s.resident.id, unitId: s.unit.id, iplTypeId: s.type.id,
      periods: [{ ...p1, amount: 100000, paidAmount: 25000 }, { ...addMonths(p1, 1), amount: 100000, paidAmount: 0 }],
    });
    const mid = await openingSummary(s.admin);
    expect(mid.openingTotal - before.openingTotal).toBe(175000);
    expect(mid.remaining - before.remaining).toBe(175000);
    expect(mid.paidViaApp - before.paidViaApp).toBe(0);
    const b2 = await prisma.iplBill.findFirstOrThrow({ where: { unitId: s.unit.id, periodMonth: addMonths(p1, 1).month, periodYear: addMonths(p1, 1).year } });
    await cancelOpeningBill(s.admin, b2.id, "Rumah kosong saat itu");
    expect((await openingSummary(s.admin)).remaining - before.remaining).toBe(75000);
    expect(await prisma.iplBillCorrection.count({ where: { billId: b2.id, statusAfter: "VOID" } })).toBe(1);
    // Periode yang dibatalkan dapat dicatat ulang
    await createOpeningArrears(s.admin, { method: "PERIOD", residentId: s.resident.id, unitId: s.unit.id, iplTypeId: s.type.id, periods: [{ ...addMonths(p1, 1), amount: 90000, paidAmount: 0 }] });
    expect((await prisma.iplBill.findUniqueOrThrow({ where: { id: b2.id } })).status).toBe("UNPAID");
  });
});

describe("Impor Excel", () => {
  it("template resmi dapat dibaca kembali dengan kolom yang benar", async () => {
    const rows = await readSheet(await openingTemplate(), OPENING_COLUMNS);
    expect(rows.length).toBe(3);
    expect(rows[0].values).toMatchObject({ house: "A-01", month: 1, amount: 150000 });
    expect((await readSheet(await residentTemplate(), RESIDENT_COLUMNS)).length).toBe(1);
  });

  it("pratinjau tidak menyimpan; menandai valid/duplikat/tidak cocok/tidak valid; konfirmasi transaksional", async () => {
    const s = await setup();
    const p1 = addMonths(currentPeriod(), -6);
    const p2 = addMonths(currentPeriod(), -5);
    // p2 sudah ada sebagai tagihan bulanan → duplikat
    await generateBills(s.admin, { iplTypeId: s.type.id, fromYear: p2.year, fromMonth: p2.month, toYear: p2.year, toMonth: p2.month, unitIds: [s.unit.id] });
    const h = s.unit.houseNumber;
    const file = await xlsx("Riwayat Tunggakan IPL", OPENING_COLUMNS.map((c) => c.header), [
      [h, s.resident.fullName, p1.month, p1.year, 100000, 20000, "ok"],
      [h, s.resident.fullName.toUpperCase(), "Januari", 2010, "Rp 75.000", null, "ok (di luar jendela)"],
      [h, s.resident.fullName, p2.month, p2.year, 100000, null, "dup tagihan"],
      [h, s.resident.fullName, p1.month, p1.year, 100000, null, "dup baris"],
      [h, "Orang Lain", p1.month, p1.year, 100000, null, "tidak cocok"],
      ["ZZ-999", s.resident.fullName, p1.month, p1.year, 100000, null, "rumah tidak ada"],
      [h, s.resident.fullName, 13, p1.year, 100000, null, "bulan salah"],
      [h, s.resident.fullName, null, null, 500000, null, "lump"],
    ]);
    const before = await prisma.iplBill.count({ where: { unitId: s.unit.id } });
    const pv = await previewOpeningImport(s.admin, file, s.type.id);
    expect(pv.counts).toEqual({ VALID: 3, DUPLICATE: 2, UNMATCHED: 2, INVALID: 1 });
    expect(pv.validationFile.length).toBeGreaterThan(100);
    expect(await prisma.iplBill.count({ where: { unitId: s.unit.id } })).toBe(before);
    // Berkas hasil validasi memuat status per baris
    const vf = new ExcelJS.Workbook();
    await vf.xlsx.load(Buffer.from(pv.validationFile, "base64") as unknown as ArrayBuffer);
    const statuses = vf.worksheets[0].getColumn(OPENING_COLUMNS.length + 2).values.slice(2);
    expect(statuses).toContain("Duplikat");
    // Konfirmasi butuh berkas yang sama
    await expect(confirmOpeningImport(s.admin, { ...file, data: Buffer.concat([file.data, Buffer.from(" ")]) }, s.type.id, pv.hash)).rejects.toThrow(/berbeda/);
    const r = await confirmOpeningImport(s.admin, file, s.type.id, pv.hash);
    expect(r).toMatchObject({ imported: 3, outstanding: 80000 + 75000 + 500000 });
    expect(await prisma.iplBill.count({ where: { unitId: s.unit.id, kind: { not: "REGULAR" } } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: "IPL_OPENING_IMPORTED", userId: s.admin.userId, status: "SUCCESS" } })).toBe(1);
    // Impor ulang berkas yang sama → semua duplikat, tidak ada yang tersimpan
    const again = await previewOpeningImport(s.admin, file, s.type.id);
    expect(again.counts.VALID).toBe(0);
    await expect(confirmOpeningImport(s.admin, file, s.type.id, again.hash)).rejects.toThrow(/Tidak ada baris valid/);
  });

  it("impor dibatalkan seluruhnya bila konflik terjadi setelah pratinjau", async () => {
    const s = await setup();
    const p1 = addMonths(currentPeriod(), -8);
    const p2 = addMonths(currentPeriod(), -7);
    const file = await xlsx("Riwayat Tunggakan IPL", OPENING_COLUMNS.map((c) => c.header), [
      [s.unit.houseNumber, s.resident.fullName, p1.month, p1.year, 100000, null, null],
      [s.unit.houseNumber, s.resident.fullName, p2.month, p2.year, 100000, null, null],
    ]);
    const pv = await previewOpeningImport(s.admin, file, s.type.id);
    expect(pv.counts.VALID).toBe(2);
    // Proses lain mencatat p2 di antara pratinjau dan konfirmasi
    await createOpeningArrears(s.admin, { method: "PERIOD", residentId: s.resident.id, unitId: s.unit.id, iplTypeId: s.type.id, periods: [{ ...p2, amount: 1000, paidAmount: 0 }] });
    // Konfirmasi memvalidasi ulang: baris p2 kini duplikat, hanya p1 yang disimpan
    const r = await confirmOpeningImport(s.admin, file, s.type.id, pv.hash);
    expect(r.imported).toBe(1);
    expect(await prisma.iplBill.count({ where: { unitId: s.unit.id } })).toBe(2);
  });

  it("Member tidak dapat mengimpor", async () => {
    const s = await setup();
    const file = await xlsx("Riwayat Tunggakan IPL", OPENING_COLUMNS.map((c) => c.header), [[s.unit.houseNumber, s.resident.fullName, 1, 2020, 1000, null, null]]);
    await expect(previewOpeningImport(s.member.ctx, file, s.type.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("impor data warga: validasi, deteksi NIK/nama ganda, hanya menambah", async () => {
    const { ctx: admin } = await makeUser("ADMIN");
    const hh = await makeHousehold();
    const nik = `3603${Date.now().toString().slice(-12)}`;
    const file = await xlsx("Data Warga", RESIDENT_COLUMNS.map((c) => c.header), [
      ["Andi Baru", nik, "081211112222", "", "Aktif", "Penghuni Tetap", "2024-01-15", hh.unit.houseNumber, "Anggota Keluarga"],
      ["Andi Kembar", nik, "", "", "", "Sementara/Kontrak", "", "", ""],
      [hh.resident.fullName, "", "", "", "Aktif", "Penghuni Tetap", "", hh.unit.houseNumber, "Kepala Keluarga"],
      ["Rumah Hilang", "", "", "", "Aktif", "Penghuni Tetap", "", "XX-0", ""],
      ["NIK Salah", "123", "0812", "bukan-email", "Meninggal", "", "31/02/2024", "", ""],
    ]);
    const pv = await previewResidentImport(admin, file);
    expect(pv.counts).toEqual({ VALID: 1, DUPLICATE: 2, UNMATCHED: 1, INVALID: 1 });
    const invalid = pv.rows.find((r) => r.status === "INVALID")!;
    expect(invalid.messages.join(" ")).toMatch(/NIK harus 16 digit/);
    expect(invalid.messages.join(" ")).toMatch(/Status Hunian wajib/);
    expect(JSON.stringify(pv.rows)).not.toContain(nik); // NIK disamarkan di pratinjau
    const r = await confirmResidentImport(admin, file, pv.hash);
    expect(r.imported).toBe(1);
    const created = await prisma.resident.findFirstOrThrow({ where: { fullName: "Andi Baru" }, include: { memberships: true } });
    expect(created.nik).not.toContain(nik); // terenkripsi
    expect(created.memberships[0]).toMatchObject({ unitId: hh.unit.id, relation: "FAMILY" });
    const again = await previewResidentImport(admin, file);
    expect(again.counts.VALID).toBe(0);
    const { ctx: sec } = await makeUser("SECURITY");
    await expect(previewResidentImport(sec, file)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
