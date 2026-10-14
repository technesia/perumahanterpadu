import { z } from "zod";
import type { FinanceType, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { assertCan, assertCanAny, type AuthContext } from "../auth/context";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { writeAudit } from "../audit";
import { nextNumber } from "../counters";
import { storeFile, type UploadInput } from "../storage";
import { isoDate, optionalText, pageParams, requiredText, rupiahSchema } from "../validation";
import { dateOnly, todayDate, toIsoDate } from "@/lib/dates";
import { rupiah } from "@/lib/format";

/**
 * Saldo kas: saldo awal + pemasukan tercatat (POSTED) − pengeluaran tercatat (POSTED),
 * dihitung sejak tanggal berlaku saldo awal terbaru.
 * Pengajuan pembayaran yang belum diverifikasi tidak pernah masuk ke tabel ini.
 */
export async function cashSummary(organizationId: string, range?: { from?: Date; to?: Date }) {
  const opening = await prisma.openingBalance.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  const from = range?.from && opening ? (range.from > opening.effectiveDate ? range.from : opening.effectiveDate) : range?.from ?? opening?.effectiveDate;
  const dateFilter = { ...(from ? { gte: from } : {}), ...(range?.to ? { lte: range.to } : {}) };
  const grouped = await prisma.financeTransaction.groupBy({
    by: ["type", "source"],
    where: { organizationId, status: "POSTED", date: Object.keys(dateFilter).length ? dateFilter : undefined },
    _sum: { amount: true },
  });
  const sum = (type: string, source?: string) =>
    grouped.filter((g) => g.type === type && (!source || g.source === source)).reduce((s, g) => s + (g._sum.amount ?? 0), 0);
  const openingAmount = opening?.amount ?? 0;
  const income = sum("INCOME");
  const expense = sum("EXPENSE");
  return {
    opening: openingAmount,
    openingDate: opening?.effectiveDate ?? null,
    income,
    incomeIpl: sum("INCOME", "IPL_PAYMENT"),
    incomeOther: income - sum("INCOME", "IPL_PAYMENT"),
    expense,
    balance: openingAmount + income - expense,
  };
}

// ───────────────────────── Transaksi manual ─────────────────────────

export const transactionSchema = z.object({
  date: isoDate("Tanggal"),
  categoryId: z.string().min(1, "Kategori wajib dipilih.").max(40),
  description: requiredText("Deskripsi", 300),
  amount: rupiahSchema("Nominal"),
  method: z.enum(["CASH", "BANK_TRANSFER", "QRIS"], { errorMap: () => ({ message: "Metode wajib dipilih." }) }),
  reference: optionalText(100),
  counterparty: optionalText(150),
  notes: optionalText(1000),
});
export type TransactionInput = z.input<typeof transactionSchema>;

const managePerm = (type: FinanceType): "finance.income.manage" | "finance.expense.manage" =>
  type === "INCOME" ? "finance.income.manage" : "finance.expense.manage";

async function validateCategory(organizationId: string, type: FinanceType, categoryId: string) {
  const cat = await prisma.financeCategory.findFirst({ where: { id: categoryId, organizationId, type, isActive: true } });
  if (!cat) throw new AppError("Kategori tidak valid.", "VALIDATION", { categoryId: "Kategori tidak valid." });
  // Pemasukan IPL hanya tercatat otomatis dari verifikasi pembayaran — mencegah pencatatan ganda.
  if (cat.isSystem) throw new AppError("Pemasukan IPL dicatat otomatis dari verifikasi pembayaran IPL.", "VALIDATION", { categoryId: "Gunakan modul Pembayaran IPL." });
  return cat;
}

function validateDate(iso: string) {
  const d = dateOnly(iso);
  if (d > todayDate()) throw new AppError("Tanggal transaksi tidak boleh di masa depan.", "VALIDATION", { date: "Tidak boleh melebihi hari ini." });
  return d;
}

export async function createTransaction(ctx: AuthContext, type: FinanceType, input: TransactionInput, attachment: UploadInput | null) {
  assertCan(ctx, managePerm(type));
  const data = transactionSchema.parse(input);
  const date = validateDate(data.date);
  const cat = await validateCategory(ctx.organizationId, type, data.categoryId);
  return prisma.$transaction(async (tx) => {
    const file = attachment ? await storeFile(tx, ctx.organizationId, attachment, "finance", ctx.userId) : null;
    const t = await tx.financeTransaction.create({
      data: {
        organizationId: ctx.organizationId, number: await nextNumber(tx, ctx.organizationId, type === "INCOME" ? "KM" : "KK", date),
        type, source: "MANUAL", categoryId: cat.id, date, description: data.description, amount: data.amount, method: data.method,
        reference: data.reference, counterparty: data.counterparty, notes: data.notes, attachmentFileId: file?.id ?? null,
        createdById: ctx.userId, updatedById: ctx.userId,
        histories: { create: { action: "CREATED", after: { ...data, category: cat.name }, actorId: ctx.userId } },
      },
    });
    await writeAudit(ctx, {
      action: type === "INCOME" ? "FINANCE_INCOME_CREATED" : "FINANCE_EXPENSE_CREATED", module: "finance",
      entityType: "FinanceTransaction", entityId: t.id,
      summary: `Mencatat ${type === "INCOME" ? "pemasukan" : "pengeluaran"} ${t.number} ${rupiah(t.amount)} — ${cat.name}`,
    }, tx);
    return t;
  });
}

async function loadManual(ctx: AuthContext, id: string) {
  const t = await prisma.financeTransaction.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { category: true } });
  if (!t) throw new NotFoundError("Transaksi tidak ditemukan.");
  assertCan(ctx, managePerm(t.type));
  if (t.source !== "MANUAL") throw new AppError("Transaksi IPL otomatis tidak dapat diubah dari modul keuangan.");
  if (t.status === "VOID") throw new ConflictError("Transaksi sudah dibatalkan.");
  return t;
}

function snapshot(t: { date: Date; categoryId: string; description: string; amount: number; method: string | null; reference: string | null; counterparty: string | null; notes: string | null }) {
  return { date: toIsoDate(t.date), categoryId: t.categoryId, description: t.description, amount: t.amount, method: t.method, reference: t.reference, counterparty: t.counterparty, notes: t.notes };
}

/** Koreksi transaksi: wajib alasan; nilai sebelum & sesudah disimpan sebagai histori. */
export async function correctTransaction(ctx: AuthContext, id: string, input: TransactionInput, reason: string, attachment: UploadInput | null) {
  const t = await loadManual(ctx, id);
  const data = transactionSchema.parse(input);
  if (!reason?.trim()) throw new AppError("Alasan koreksi wajib diisi.", "VALIDATION", { reason: "Alasan koreksi wajib diisi." });
  const date = validateDate(data.date);
  await validateCategory(ctx.organizationId, t.type, data.categoryId);
  const before = snapshot(t);
  return prisma.$transaction(async (tx) => {
    const file = attachment ? await storeFile(tx, ctx.organizationId, attachment, "finance", ctx.userId) : null;
    const updated = await tx.financeTransaction.update({
      where: { id },
      data: {
        date, categoryId: data.categoryId, description: data.description, amount: data.amount, method: data.method,
        reference: data.reference, counterparty: data.counterparty, notes: data.notes, updatedById: ctx.userId,
        ...(file ? { attachmentFileId: file.id } : {}),
      },
    });
    const after = snapshot(updated);
    await tx.financeTransactionHistory.create({ data: { transactionId: id, action: "CORRECTED", before, after, reason: reason.trim(), actorId: ctx.userId } });
    await writeAudit(ctx, {
      action: "FINANCE_CORRECTED", module: "finance", entityType: "FinanceTransaction", entityId: id,
      summary: `Mengoreksi transaksi ${t.number}${before.amount !== after.amount ? ` (${rupiah(before.amount)} → ${rupiah(after.amount)})` : ""}`,
      metadata: { reason: reason.trim(), before, after },
    }, tx);
    return updated;
  });
}

export async function voidTransaction(ctx: AuthContext, id: string, reason: string) {
  const t = await loadManual(ctx, id);
  if (!reason?.trim()) throw new AppError("Alasan pembatalan wajib diisi.", "VALIDATION", { reason: "Alasan wajib diisi." });
  return prisma.$transaction(async (tx) => {
    await tx.financeTransaction.update({ where: { id }, data: { status: "VOID", voidReason: reason.trim(), voidedAt: new Date(), voidedById: ctx.userId } });
    await tx.financeTransactionHistory.create({ data: { transactionId: id, action: "VOIDED", before: snapshot(t), reason: reason.trim(), actorId: ctx.userId } });
    await writeAudit(ctx, {
      action: "FINANCE_VOIDED", module: "finance", entityType: "FinanceTransaction", entityId: id,
      summary: `Membatalkan transaksi ${t.number} ${rupiah(t.amount)}`, metadata: { reason: reason.trim() },
    }, tx);
  });
}

// ───────────────────────── Query ─────────────────────────

export interface FinanceFilter { q?: string; categoryId?: string; from?: string; to?: string; status?: string; source?: string; page: number }

export async function listTransactions(ctx: AuthContext, type: FinanceType, f: FinanceFilter, pageSize = 25) {
  assertCan(ctx, "finance.view");
  const where: Prisma.FinanceTransactionWhereInput = { organizationId: ctx.organizationId, type };
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.status === "POSTED" || f.status === "VOID") where.status = f.status;
  if (f.source === "MANUAL" || f.source === "IPL_PAYMENT") where.source = f.source;
  const dr: Prisma.DateTimeFilter = {};
  try {
    if (f.from) dr.gte = dateOnly(f.from);
    if (f.to) dr.lte = dateOnly(f.to);
  } catch { /* filter tanggal tidak valid diabaikan */ }
  if (Object.keys(dr).length) where.date = dr;
  if (f.q) {
    const q = f.q.trim().slice(0, 80);
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { counterparty: { contains: q, mode: "insensitive" } },
      { reference: { contains: q, mode: "insensitive" } },
    ];
  }
  const [items, total, sum] = await Promise.all([
    prisma.financeTransaction.findMany({
      where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], ...pageParams(f.page, pageSize),
      include: { category: { select: { name: true } } },
    }),
    prisma.financeTransaction.count({ where }),
    prisma.financeTransaction.aggregate({ where: { ...where, status: "POSTED" }, _sum: { amount: true } }),
  ]);
  return { items, total, sumPosted: sum._sum.amount ?? 0 };
}

export async function getTransaction(ctx: AuthContext, id: string) {
  assertCan(ctx, "finance.view");
  const t = await prisma.financeTransaction.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      category: true,
      histories: { orderBy: { createdAt: "asc" } },
      iplPayment: { select: { id: true, number: true } },
    },
  });
  if (!t) throw new NotFoundError("Transaksi tidak ditemukan.");
  const ids = [...new Set([t.createdById, t.updatedById, t.voidedById, ...t.histories.map((h) => h.actorId)].filter(Boolean))] as string[];
  const [actors, file] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    t.attachmentFileId ? prisma.storedFile.findUnique({ where: { id: t.attachmentFileId }, select: { id: true, originalName: true, mimeType: true } }) : null,
  ]);
  return { ...t, attachment: file, actorNames: Object.fromEntries(actors.map((a) => [a.id, a.name])) };
}

export async function listCategories(ctx: AuthContext, type?: FinanceType) {
  assertCanAny(ctx, ["finance.view"]);
  return prisma.financeCategory.findMany({
    where: { organizationId: ctx.organizationId, ...(type ? { type } : {}) },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

// ───────────────────────── Saldo awal & rekap ─────────────────────────

export const openingBalanceSchema = z.object({
  amount: z.coerce.number({ invalid_type_error: "Nominal harus angka." }).int("Nominal harus bilangan bulat.").min(-2_000_000_000).max(2_000_000_000),
  effectiveDate: isoDate("Tanggal berlaku"),
  note: requiredText("Keterangan", 300),
});

export async function setOpeningBalance(ctx: AuthContext, input: z.input<typeof openingBalanceSchema>) {
  assertCan(ctx, "finance.opening_balance");
  const data = openingBalanceSchema.parse(input);
  const effectiveDate = validateDate(data.effectiveDate);
  return prisma.$transaction(async (tx) => {
    const prev = await tx.openingBalance.findFirst({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" } });
    const row = await tx.openingBalance.create({ data: { organizationId: ctx.organizationId, amount: data.amount, effectiveDate, note: data.note, setById: ctx.userId } });
    await writeAudit(ctx, {
      action: "OPENING_BALANCE_SET", module: "finance", entityType: "OpeningBalance", entityId: row.id,
      summary: `Mengatur saldo awal ${rupiah(data.amount)} per ${data.effectiveDate}${prev ? ` (sebelumnya ${rupiah(prev.amount)})` : ""}`,
      metadata: { note: data.note, previous: prev ? { amount: prev.amount, effectiveDate: toIsoDate(prev.effectiveDate) } : null },
    }, tx);
    return row;
  });
}

export async function openingBalanceHistory(ctx: AuthContext) {
  assertCan(ctx, "finance.view");
  return prisma.openingBalance.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 10 });
}

/** Rekap bulanan satu tahun + per kategori. Hanya transaksi POSTED. */
export async function yearlyRecap(ctx: AuthContext, year: number) {
  assertCan(ctx, "finance.view");
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31));
  const monthly = await prisma.$queryRaw<{ month: number; type: FinanceType; source: string; total: bigint }[]>`
    SELECT EXTRACT(MONTH FROM date)::int AS month, type, source::text AS source, SUM(amount)::bigint AS total
    FROM finance_transactions
    WHERE "organizationId" = ${ctx.organizationId} AND status = 'POSTED' AND date BETWEEN ${from} AND ${to}
    GROUP BY 1, 2, 3`;
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, incomeIpl: 0, incomeOther: 0, expense: 0 }));
  for (const r of monthly) {
    const m = months[r.month - 1];
    const v = Number(r.total);
    if (r.type === "EXPENSE") m.expense += v;
    else if (r.source === "IPL_PAYMENT") m.incomeIpl += v;
    else m.incomeOther += v;
  }
  const byCat = await prisma.financeTransaction.groupBy({
    by: ["categoryId", "type"], where: { organizationId: ctx.organizationId, status: "POSTED", date: { gte: from, lte: to } }, _sum: { amount: true },
  });
  const cats = await prisma.financeCategory.findMany({ where: { id: { in: byCat.map((c) => c.categoryId) } }, select: { id: true, name: true } });
  const name = new Map(cats.map((c) => [c.id, c.name]));
  return {
    months,
    categories: byCat.map((c) => ({ name: name.get(c.categoryId) ?? "-", type: c.type, total: c._sum.amount ?? 0 })).sort((a, b) => b.total - a.total),
    totals: months.reduce((s, m) => ({ incomeIpl: s.incomeIpl + m.incomeIpl, incomeOther: s.incomeOther + m.incomeOther, expense: s.expense + m.expense }), { incomeIpl: 0, incomeOther: 0, expense: 0 }),
  };
}
