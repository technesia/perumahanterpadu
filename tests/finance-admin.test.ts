import { beforeAll, describe, expect, it } from "vitest";
import { ensureSeed, makeHousehold, makeUser, PNG_1PX, prisma, uniq } from "./helpers";
import {
  cashSummary, correctTransaction, createTransaction, listTransactions, setOpeningBalance, voidTransaction, yearlyRecap,
} from "@/server/services/finance";
import { generateBills, saveIplType, currentPeriod } from "@/server/services/ipl";
import { approvePayment, submitPayment } from "@/server/services/ipl-payments";
import { cancelOwnRequest, getRequest, listRequests, processRequest, submitRequest } from "@/server/services/admin-requests";
import { auditLogsSince, listAuditLogs } from "@/server/services/audit-logs";
import { todayDate, toIsoDate } from "@/lib/dates";
import { ForbiddenError, NotFoundError } from "@/server/errors";

beforeAll(ensureSeed);
const today = () => toIsoDate(todayDate());

async function cat(code: string) {
  const org = await prisma.organization.findFirstOrThrow({ where: { slug: "taman-pesona-rajeg-mulya" } });
  return prisma.financeCategory.findUniqueOrThrow({ where: { organizationId_code: { organizationId: org.id, code } } });
}

const tx = (categoryId: string, amount: number) => ({ date: today(), categoryId, description: uniq("Transaksi "), amount, method: "CASH" as const });

describe("Keuangan (#23–#27)", () => {
  it("saldo = saldo awal + pemasukan − pengeluaran; void tidak dihitung", async () => {
    const { ctx: admin } = await makeUser("ADMIN");
    const { ctx: sa } = await makeUser("SUPER_ADMIN");
    const before = await cashSummary(admin.organizationId);
    await expect(setOpeningBalance(admin, { amount: 1, effectiveDate: "2020-01-01", note: "x" })).rejects.toBeInstanceOf(ForbiddenError);

    const inc = await createTransaction(admin, "INCOME", tx((await cat("INC_OTHER_DUES")).id, 300000), null);
    const exp = await createTransaction(admin, "EXPENSE", { ...tx((await cat("EXP_CLEANING")).id, 120000), counterparty: "CV Bersih" }, { name: "nota.png", data: PNG_1PX });
    expect(exp.attachmentFileId).not.toBeNull();
    let after = await cashSummary(admin.organizationId);
    expect(after.balance - before.balance).toBe(300000 - 120000);
    expect(after.incomeOther - before.incomeOther).toBe(300000);

    await voidTransaction(admin, inc.id, "Salah input");
    after = await cashSummary(admin.organizationId);
    expect(after.balance - before.balance).toBe(-120000);
    await expect(voidTransaction(admin, inc.id, "lagi")).rejects.toThrow(/sudah dibatalkan/);

    // Saldo awal (Super Admin) tercatat di audit
    const ob = await setOpeningBalance(sa, { amount: 5_000_000, effectiveDate: "2020-01-01", note: "Kas warisan pengurus lama" });
    const withOpening = await cashSummary(admin.organizationId);
    expect(withOpening.opening).toBe(5_000_000);
    expect(await prisma.auditLog.count({ where: { entityId: ob.id, action: "OPENING_BALANCE_SET" } })).toBe(1);
  });

  it("pemasukan IPL hanya otomatis — kategori IPL tidak bisa dicatat manual", async () => {
    const { ctx } = await makeUser("ADMIN");
    await expect(createTransaction(ctx, "INCOME", tx((await cat("INC_IPL")).id, 1000), null)).rejects.toThrow(/otomatis/);
  });

  it("IPL tervalidasi → pemasukan sekali; pengeluaran tidak mengubah status lunas (#23–#25)", async () => {
    const { ctx: admin } = await makeUser("ADMIN");
    const type = await saveIplType(admin, null, { name: uniq("IPL "), amount: 75000, dueDay: 5, isActive: true });
    const hh = await makeHousehold({ withAccount: true });
    const p0 = currentPeriod();
    await generateBills(admin, { iplTypeId: type.id, fromYear: p0.year, fromMonth: p0.month, toYear: p0.year, toMonth: p0.month, unitIds: [hh.unit.id] });
    const bill = await prisma.iplBill.findFirstOrThrow({ where: { unitId: hh.unit.id } });
    const pay = await submitPayment(hh.member!.ctx, { unitId: hh.unit.id, billIds: [bill.id], method: "BANK_TRANSFER" }, { name: "b.png", data: PNG_1PX });
    const pending = await listTransactions(admin, "INCOME", { q: pay.number, page: 1 });
    expect(pending.total).toBe(0); // menunggu verifikasi bukan pemasukan (#18)
    await approvePayment(admin, pay.id);
    const listed = await listTransactions(admin, "INCOME", { q: pay.number, page: 1 });
    expect(listed.total).toBe(1);
    expect(listed.items[0].source).toBe("IPL_PAYMENT");
    // transaksi IPL otomatis tidak dapat dikoreksi/dibatalkan dari modul keuangan
    await expect(voidTransaction(admin, listed.items[0].id, "x")).rejects.toThrow(/otomatis/);

    await createTransaction(admin, "EXPENSE", tx((await cat("EXP_SECURITY")).id, 75000), null);
    expect((await prisma.iplBill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("PAID");
  });

  it("koreksi wajib alasan, menyimpan nilai sebelum/sesudah, tercatat di audit log (#26)", async () => {
    const { ctx } = await makeUser("ADMIN");
    const c = await cat("EXP_REPAIR");
    const t = await createTransaction(ctx, "EXPENSE", tx(c.id, 50000), null);
    await expect(correctTransaction(ctx, t.id, tx(c.id, 55000), "", null)).rejects.toThrow(/Alasan/);
    await correctTransaction(ctx, t.id, { ...tx(c.id, 55000), description: t.description }, "Nota asli Rp55.000", null);
    const h = await prisma.financeTransactionHistory.findFirstOrThrow({ where: { transactionId: t.id, action: "CORRECTED" } });
    expect((h.before as { amount: number }).amount).toBe(50000);
    expect((h.after as { amount: number }).amount).toBe(55000);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: t.id, action: "FINANCE_CORRECTED" } });
    expect(log.summary).toContain("Rp");
  });

  it("transaksi di masa depan ditolak; rekap tahunan cocok dengan database (#27)", async () => {
    const { ctx } = await makeUser("ADMIN");
    const c = await cat("EXP_OTHER");
    const future = toIsoDate(new Date(todayDate().getTime() + 3 * 86400000));
    await expect(createTransaction(ctx, "EXPENSE", { ...tx(c.id, 1000), date: future }, null)).rejects.toThrow(/masa depan/);
    const year = todayDate().getUTCFullYear();
    const recap = await yearlyRecap(ctx, year);
    const raw = await prisma.financeTransaction.groupBy({
      by: ["type"], where: { organizationId: ctx.organizationId, status: "POSTED", date: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } }, _sum: { amount: true },
    });
    const sum = (t: string) => raw.find((r) => r.type === t)?._sum.amount ?? 0;
    expect(recap.totals.expense).toBe(sum("EXPENSE"));
    expect(recap.totals.incomeIpl + recap.totals.incomeOther).toBe(sum("INCOME"));
  });

  it("Security & Member tidak dapat mengakses keuangan (#5)", async () => {
    const { ctx: sec } = await makeUser("SECURITY");
    const { ctx: mem } = await makeUser("MEMBER");
    await expect(listTransactions(sec, "INCOME", { page: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createTransaction(mem, "EXPENSE", tx((await cat("EXP_OTHER")).id, 1000), null)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Pengajuan surat (#28–#30)", () => {
  async function typeId() {
    const org = await prisma.organization.findFirstOrThrow({ where: { slug: "taman-pesona-rajeg-mulya" } });
    return (await prisma.administrativeRequestType.findUniqueOrThrow({ where: { organizationId_code: { organizationId: org.id, code: "DOMICILE" } } })).id;
  }

  it("Member mengajukan, Admin memproses, Member melihat status; catatan internal tersembunyi", async () => {
    const hh = await makeHousehold({ withAccount: true });
    const member = hh.member!.ctx;
    const { ctx: admin } = await makeUser("ADMIN");
    const r = await submitRequest(member, { typeId: await typeId(), purpose: "Persyaratan buka rekening bank", contactPhone: "" }, [{ name: "ktp.pdf", data: Buffer.from("%PDF-1.4 test") }]);
    expect(r.number).toMatch(/^SRT-/);
    expect(r.status).toBe("SUBMITTED");
    expect(await prisma.notification.count({ where: { userId: admin.userId, type: "ADMIN_REQUEST_NEW" } })).toBeGreaterThan(0);

    await processRequest(admin, r.id, { status: "PROCESSING", internalNotes: "Cek KK di arsip RT" });
    await expect(processRequest(admin, r.id, { status: "REJECTED" })).rejects.toThrow(/Alasan/);
    await processRequest(admin, r.id, { status: "APPROVED", note: "Silakan ambil surat di rumah Ketua RT" });
    await expect(processRequest(admin, r.id, { status: "REJECTED", note: "x" })).rejects.toThrow(/tidak dapat diubah/);

    const seen = await getRequest(member, r.id);
    expect(seen.status).toBe("APPROVED");
    expect(seen.internalNotes).toBeNull();
    expect(seen.histories.map((h) => h.toStatus)).toEqual(["SUBMITTED", "PROCESSING", "APPROVED"]);
    expect((await getRequest(admin, r.id)).internalNotes).toBe("Cek KK di arsip RT");
  });

  it("Member hanya melihat pengajuan sendiri; tidak dapat memproses", async () => {
    const a = await makeHousehold({ withAccount: true });
    const b = await makeHousehold({ withAccount: true });
    const r = await submitRequest(a.member!.ctx, { typeId: await typeId(), purpose: "Keperluan sekolah anak", contactPhone: "" }, []);
    await expect(getRequest(b.member!.ctx, r.id)).rejects.toBeInstanceOf(NotFoundError);
    const listB = await listRequests(b.member!.ctx, { page: 1 });
    expect(listB.items.some((i) => i.id === r.id)).toBe(false);
    await expect(processRequest(a.member!.ctx, r.id, { status: "APPROVED" })).rejects.toBeInstanceOf(ForbiddenError);
    await cancelOwnRequest(a.member!.ctx, r.id);
    expect((await getRequest(a.member!.ctx, r.id)).status).toBe("CANCELLED");
  });

  it("Admin tidak dapat menyetujui pengajuannya sendiri", async () => {
    const hh = await makeHousehold();
    const { ctx: admin } = await makeUser("ADMIN", { residentId: hh.resident.id });
    const adminCtx = { ...admin, residentId: hh.resident.id, permissions: new Set([...admin.permissions, "administration.submit"]) };
    const r = await submitRequest(adminCtx, { typeId: await typeId(), purpose: "Untuk diri sendiri", contactPhone: "" }, []);
    await expect(processRequest(adminCtx, r.id, { status: "APPROVED" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Activity Log (#39–#42)", () => {
  it("hanya Admin/Super Admin; log baru tersedia lewat query since", async () => {
    const { ctx: admin } = await makeUser("ADMIN");
    const { ctx: mem } = await makeUser("MEMBER");
    const { ctx: sec } = await makeUser("SECURITY");
    await expect(listAuditLogs(mem, { page: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listAuditLogs(sec, { page: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    const since = new Date();
    await new Promise((r) => setTimeout(r, 10));
    await createTransaction(admin, "EXPENSE", tx((await cat("EXP_OTHER")).id, 2000), null);
    const fresh = await auditLogsSince(admin, since);
    expect(fresh.some((l) => l.action === "FINANCE_EXPENSE_CREATED" && l.userRole === "ADMIN")).toBe(true);
    const filtered = await listAuditLogs(admin, { module: "finance", page: 1 });
    expect(filtered.items.every((l) => l.module === "finance")).toBe(true);
  });
});

describe("Pengaturan", () => {
  it("hanya Super Admin yang dapat mengubah kebijakan; perubahan tercatat", async () => {
    const { updateSettings } = await import("@/server/services/settings");
    const { ctx: admin } = await makeUser("ADMIN");
    const { ctx: sa } = await makeUser("SUPER_ADMIN");
    const input = { arrearsWindowMonths: 60, deathRecordMaxYears: 10, allowPartialPayment: false, holdPendingBookings: true };
    await expect(updateSettings(admin, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateSettings(sa, { ...input, arrearsWindowMonths: 5 })).rejects.toThrow();
    await updateSettings(sa, input);
    expect(await prisma.auditLog.count({ where: { userId: sa.userId, action: "SETTINGS_UPDATED" } })).toBe(1);
  });
});
