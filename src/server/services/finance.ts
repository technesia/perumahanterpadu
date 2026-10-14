import { prisma } from "../db";

/**
 * Saldo kas: saldo awal + pemasukan tercatat (POSTED) − pengeluaran tercatat (POSTED).
 * Pengajuan pembayaran yang belum diverifikasi tidak pernah masuk ke tabel ini.
 */
export async function cashSummary(organizationId: string, range?: { from?: Date; to?: Date }) {
  const opening = await prisma.openingBalance.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  const dateFilter = {
    ...(opening ? { gte: opening.effectiveDate } : {}),
    ...(range?.to ? { lte: range.to } : {}),
  };
  const base = { organizationId, status: "POSTED" as const, date: Object.keys(dateFilter).length ? dateFilter : undefined };
  const grouped = await prisma.financeTransaction.groupBy({ by: ["type", "source"], where: base, _sum: { amount: true } });
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
