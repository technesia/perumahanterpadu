import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ensureSeed, makeHousehold, makeUser, PNG_1PX, prisma, uniq } from "./helpers";
import { currentPeriod, generateBills, myBills, saveIplType, unitBills, unpaidList, unpaidSummary } from "@/server/services/ipl";
import { applyProviderEvent, approvePayment, getPayment, rejectPayment, submitPayment } from "@/server/services/ipl-payments";
import { __setQrisProviderForTest } from "@/server/payments/qris";
import { authorizeFile } from "@/server/services/files";
import { addMonths } from "@/lib/ipl";
import { ForbiddenError, NotFoundError } from "@/server/errors";

beforeAll(ensureSeed);
afterEach(() => __setQrisProviderForTest(null));

const proof = () => ({ name: "bukti.png", data: PNG_1PX });

/** Rumah dengan 6 tagihan: 5 bulan lalu s.d. bulan ini. */
async function setup() {
  const { ctx: admin } = await makeUser("ADMIN");
  const type = await saveIplType(admin, null, { name: uniq("IPL Bulanan "), amount: 150000, dueDay: 10, isActive: true });
  const hh = await makeHousehold({ withAccount: true });
  const now = currentPeriod();
  const from = addMonths(now, -5);
  const res = await generateBills(admin, { iplTypeId: type.id, fromYear: from.year, fromMonth: from.month, toYear: now.year, toMonth: now.month, unitIds: [hh.unit.id] });
  const bills = await prisma.iplBill.findMany({ where: { unitId: hh.unit.id }, orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }] });
  return { admin, type, ...hh, member: hh.member!, bills, generated: res };
}

const income = (paymentId: string) => prisma.financeTransaction.count({ where: { iplPaymentId: paymentId } });

describe("Penerbitan tagihan", () => {
  it("menerbitkan per periode dan tidak menggandakan (#21)", async () => {
    const s = await setup();
    expect(s.generated.created).toBe(6);
    const now = currentPeriod();
    const from = addMonths(now, -5);
    const again = await generateBills(s.admin, { iplTypeId: s.type.id, fromYear: from.year, fromMonth: from.month, toYear: now.year, toMonth: now.month, unitIds: [s.unit.id] });
    expect(again.created).toBe(0);
    expect(await prisma.iplBill.count({ where: { unitId: s.unit.id } })).toBe(6);
  });

  it("menolak periode di luar jendela 60 bulan", async () => {
    const s = await setup();
    const tooOld = addMonths(currentPeriod(), -60);
    await expect(generateBills(s.admin, { iplTypeId: s.type.id, fromYear: tooOld.year, fromMonth: tooOld.month, toYear: tooOld.year, toMonth: tooOld.month })).rejects.toThrow(/paling awal/);
  });

  it("Member tidak dapat menerbitkan tagihan", async () => {
    const s = await setup();
    await expect(generateBills(s.member.ctx, { iplTypeId: s.type.id, fromYear: 2026, fromMonth: 1, toYear: 2026, toMonth: 1 })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Alur pembayaran IPL", () => {
  it("bayar 3 bulan sekaligus → alokasi per periode, menunggu verifikasi bukan pemasukan (#15, #17, #18)", async () => {
    const s = await setup();
    const three = s.bills.slice(0, 3).map((b) => b.id);
    await expect(submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: three, method: "BANK_TRANSFER" }, null)).rejects.toThrow(/Bukti transfer wajib/);

    const p = await submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: three, method: "BANK_TRANSFER" }, proof());
    expect(p.status).toBe("PENDING_VERIFICATION");
    expect(p.totalAmount).toBe(450000);
    expect(await prisma.iplPaymentAllocation.count({ where: { paymentId: p.id } })).toBe(3);
    expect(await prisma.iplPaymentProof.count({ where: { paymentId: p.id } })).toBe(1);
    expect(await income(p.id)).toBe(0);
    // Tagihan belum lunas walaupun bukti sudah diunggah
    expect(await prisma.iplBill.count({ where: { id: { in: three }, status: "PAID" } })).toBe(0);
    // Admin menerima notifikasi
    expect(await prisma.notification.count({ where: { userId: s.admin.userId, type: "IPL_PAYMENT_PENDING" } })).toBeGreaterThan(0);

    const mine = await myBills(s.member.ctx);
    expect(mine.items.filter((i) => i.displayStatus === "PENDING")).toHaveLength(3);
  });

  it("disetujui → 3 periode lunas, periode lain tetap, pemasukan tercatat sekali (#14, #19, #23)", async () => {
    const s = await setup();
    const three = s.bills.slice(0, 3).map((b) => b.id);
    const p = await submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: three, method: "BANK_TRANSFER" }, proof());
    await approvePayment(s.admin, p.id);
    const bills = await prisma.iplBill.findMany({ where: { unitId: s.unit.id }, orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }] });
    expect(bills.slice(0, 3).every((b) => b.status === "PAID")).toBe(true);
    expect(bills.slice(3).every((b) => b.status === "UNPAID")).toBe(true);
    expect(await income(p.id)).toBe(1);
    const tx = await prisma.financeTransaction.findUniqueOrThrow({ where: { iplPaymentId: p.id } });
    expect([tx.type, tx.source, tx.amount]).toEqual(["INCOME", "IPL_PAYMENT", 450000]);

    // Verifikasi ulang ditolak — tidak ada pemasukan ganda
    await expect(approvePayment(s.admin, p.id)).rejects.toThrow(/sudah diproses/);
    expect(await income(p.id)).toBe(1);
    // Member mendapat notifikasi
    expect(await prisma.notification.count({ where: { userId: s.member.user.id, type: "IPL_PAYMENT_APPROVED" } })).toBe(1);
  });

  it("ditolak → periode tidak lunas, alasan tersimpan, dapat diajukan ulang (#20)", async () => {
    const s = await setup();
    const one = [s.bills[0].id];
    const p = await submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: one, method: "BANK_TRANSFER" }, proof());
    await expect(rejectPayment(s.admin, p.id, "")).rejects.toThrow(/Alasan/);
    await rejectPayment(s.admin, p.id, "Nominal transfer tidak sesuai");
    expect((await prisma.iplBill.findUniqueOrThrow({ where: { id: one[0] } })).status).toBe("UNPAID");
    expect((await getPayment(s.member.ctx, p.id)).rejectionReason).toBe("Nominal transfer tidak sesuai");
    expect(await income(p.id)).toBe(0);
    const again = await submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: one, method: "BANK_TRANSFER" }, proof());
    expect(again.status).toBe("PENDING_VERIFICATION");
  });

  it("mencegah pembayaran ganda untuk periode yang sama (#21)", async () => {
    const s = await setup();
    const one = [s.bills[1].id];
    const p = await submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: one, method: "BANK_TRANSFER" }, proof());
    await expect(submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: one, method: "BANK_TRANSFER" }, proof())).rejects.toThrow(/menunggu verifikasi/);
    await approvePayment(s.admin, p.id);
    await expect(submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: one, method: "BANK_TRANSFER" }, proof())).rejects.toThrow(/sudah lunas/);
  });

  it("pengajuan bersamaan untuk periode yang sama: hanya satu yang lolos", async () => {
    const s = await setup();
    const one = [s.bills[2].id];
    const results = await Promise.allSettled([
      submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: one, method: "BANK_TRANSFER" }, proof()),
      submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: one, method: "BANK_TRANSFER" }, proof()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("Member tidak dapat membayar/melihat tagihan rumah lain atau memalsukan residentId (IDOR)", async () => {
    const s = await setup();
    const other = await setup();
    await expect(submitPayment(s.member.ctx, { unitId: other.unit.id, billIds: [other.bills[0].id], method: "BANK_TRANSFER" }, proof())).rejects.toThrow(/Rumah tidak/);
    // residentId dari request diabaikan untuk Member
    await expect(submitPayment(s.member.ctx, { residentId: other.resident.id, unitId: other.unit.id, billIds: [other.bills[0].id], method: "BANK_TRANSFER" }, proof())).rejects.toThrow(/Rumah tidak/);
    // tagihan rumah lain disisipkan ke rumah sendiri
    await expect(submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: [other.bills[0].id], method: "BANK_TRANSFER" }, proof())).rejects.toThrow(/tidak valid/);
    await expect(unitBills(s.member.ctx, other.unit.id)).rejects.toBeInstanceOf(NotFoundError);
    const p = await submitPayment(other.member.ctx, { unitId: other.unit.id, billIds: [other.bills[0].id], method: "BANK_TRANSFER" }, proof());
    await expect(getPayment(s.member.ctx, p.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("bukti transfer hanya dapat diakses pemilik & staf IPL", async () => {
    const s = await setup();
    const other = await setup();
    const p = await submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: [s.bills[0].id], method: "BANK_TRANSFER" }, proof());
    const pr = await prisma.iplPaymentProof.findFirstOrThrow({ where: { paymentId: p.id } });
    const { ctx: sec } = await makeUser("SECURITY");
    expect(await authorizeFile(s.member.ctx, pr.fileId)).not.toBeNull();
    expect(await authorizeFile(s.admin, pr.fileId)).not.toBeNull();
    expect(await authorizeFile(other.member.ctx, pr.fileId)).toBeNull();
    expect(await authorizeFile(sec, pr.fileId)).toBeNull();
  });

  it("Member & Security tidak dapat memverifikasi pembayaran (#5)", async () => {
    const s = await setup();
    const p = await submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: [s.bills[0].id], method: "BANK_TRANSFER" }, proof());
    const { ctx: sec } = await makeUser("SECURITY");
    await expect(approvePayment(s.member.ctx, p.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(approvePayment(sec, p.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("menolak berkas yang bukan JPG/PNG/PDF walau berekstensi .png", async () => {
    const s = await setup();
    await expect(submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: [s.bills[0].id], method: "BANK_TRANSFER" }, { name: "x.png", data: Buffer.from("<script>alert(1)</script>") })).rejects.toThrow(/Format berkas/);
  });

  it("parsial ditolak bila kebijakan tidak mengizinkan; diizinkan → status Parsial", async () => {
    const s = await setup();
    const b = s.bills[0];
    await expect(submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: [b.id], amounts: { [b.id]: 50000 }, method: "BANK_TRANSFER" }, proof())).rejects.toThrow(/parsial tidak diizinkan/);
    await prisma.organization.update({ where: { id: s.admin.organizationId }, data: { allowPartialPayment: true } });
    try {
      const p = await submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: [b.id], amounts: { [b.id]: 50000 }, method: "BANK_TRANSFER" }, proof());
      await approvePayment(s.admin, p.id);
      const after = await prisma.iplBill.findUniqueOrThrow({ where: { id: b.id } });
      expect([after.status, after.paidAmount]).toEqual(["PARTIAL", 50000]);
    } finally {
      await prisma.organization.update({ where: { id: s.admin.organizationId }, data: { allowPartialPayment: false } });
    }
  });
});

describe("Tunggakan & widget IPL Belum Bayar (#13, #22)", () => {
  it("warga menunggak terlihat dengan rincian; setelah lunas hilang dari daftar", async () => {
    const s = await setup();
    const before = await myBills(s.member.ctx);
    // 6 tagihan; periode berjalan bisa belum jatuh tempo, sisanya tunggakan
    expect(before.summary.arrearsCount).toBeGreaterThanOrEqual(5);
    const list = await unpaidList(s.admin, { q: s.unit.houseNumber, page: 1 });
    expect(list.items).toHaveLength(1);
    expect(list.items[0].resident?.phone).toBe("081234567890");
    expect(list.items[0].bills[0]).toMatchObject({ periodYear: s.bills[0].periodYear, periodMonth: s.bills[0].periodMonth, outstanding: 150000 });

    const p = await submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: s.bills.map((b) => b.id), method: "BANK_TRANSFER" }, proof());
    // Menunggu verifikasi bukan tunggakan
    expect((await myBills(s.member.ctx)).summary.arrearsCount).toBe(0);
    await approvePayment(s.admin, p.id);
    const after = await myBills(s.member.ctx);
    expect(after.summary.arrearsCount).toBe(0);
    expect(after.summary.pendingCount).toBe(0);
    expect((await unpaidList(s.admin, { q: s.unit.houseNumber, page: 1 })).items).toHaveLength(0);
  });

  it("ringkasan hanya untuk staf", async () => {
    const s = await setup();
    const sum = await unpaidSummary(s.admin);
    expect(sum.unitsInArrears).toBeGreaterThan(0);
    await expect(unpaidSummary(s.member.ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("QRIS", () => {
  it("tanpa provider: QRIS ditolak dengan pesan jelas", async () => {
    const s = await setup();
    await expect(submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: [s.bills[0].id], method: "QRIS" }, null)).rejects.toThrow(/QRIS belum aktif/);
  });

  it("webhook provider: lunas hanya setelah konfirmasi, idempoten, nominal dicocokkan", async () => {
    const s = await setup();
    const txId = uniq("qr");
    __setQrisProviderForTest({ name: "fake", createCharge: async () => ({ providerTransactionId: txId }), parseWebhook: async () => { throw new Error(); } });
    const p = await submitPayment(s.member.ctx, { unitId: s.unit.id, billIds: [s.bills[0].id], method: "QRIS" }, null);
    expect(p.status).toBe("AWAITING_PROVIDER");
    expect((await prisma.iplBill.findUniqueOrThrow({ where: { id: s.bills[0].id } })).status).toBe("UNPAID");

    await expect(applyProviderEvent("fake", { providerTransactionId: txId, amount: 1, status: "PAID" })).rejects.toThrow(/tidak cocok/);
    const r1 = await applyProviderEvent("fake", { providerTransactionId: txId, amount: 150000, status: "PAID" });
    const r2 = await applyProviderEvent("fake", { providerTransactionId: txId, amount: 150000, status: "PAID" });
    expect(r1).toMatchObject({ status: "APPROVED", duplicate: false });
    expect(r2.duplicate).toBe(true);
    expect((await prisma.iplBill.findUniqueOrThrow({ where: { id: s.bills[0].id } })).status).toBe("PAID");
    expect(await income(p.id)).toBe(1);
  });
});
