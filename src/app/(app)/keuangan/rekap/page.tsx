import { HandCoins, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { cashSummary, openingBalanceHistory, yearlyRecap } from "@/server/services/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { spInt } from "@/components/ui/filter-bar";
import { formatDateOnly, formatDateTime, MONTHS_ID, rupiah } from "@/lib/format";
import { todayDate } from "@/lib/dates";
import { OpeningBalanceForm } from "./opening-form";

export const metadata = { title: "Rekap Keuangan" };

export default async function RecapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage("finance.view");
  const thisYear = todayDate().getUTCFullYear();
  const y = spInt((await searchParams).year);
  const year = y && y >= 2000 && y <= thisYear ? y : thisYear;
  const [cash, recap, openings] = await Promise.all([cashSummary(ctx.organizationId), yearlyRecap(ctx, year), openingBalanceHistory(ctx)]);
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);
  return (
    <>
      <PageHeader title="Rekap Keuangan" description="Saldo akhir = saldo awal + pemasukan terkonfirmasi − pengeluaran tercatat."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Rekap Keuangan" }]} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Saldo Akhir Kas" value={rupiah(cash.balance)} icon={Wallet} tone="gold" />
        <StatCard label="Saldo Awal" value={rupiah(cash.opening)} hint={cash.openingDate ? `per ${formatDateOnly(cash.openingDate)}` : "Belum diatur"} icon={Wallet} tone="slate" />
        <StatCard label="Total Pemasukan" value={rupiah(cash.income)} hint={`IPL ${rupiah(cash.incomeIpl)} · non-IPL ${rupiah(cash.incomeOther)}`} icon={TrendingUp} />
        <StatCard label="Total Pengeluaran" value={rupiah(cash.expense)} icon={TrendingDown} tone="red" />
      </div>

      <Card className="mb-5">
        <CardHeader title={`Rekap Bulanan ${year}`} action={
          <form method="get" className="flex gap-2">
            <label htmlFor="year" className="sr-only">Tahun</label>
            <select id="year" name="year" defaultValue={String(year)} className="input h-9 py-0">{years.map((x) => <option key={x}>{x}</option>)}</select>
            <button className="h-9 rounded-lg border px-3 text-sm hover:bg-slate-50">Tampilkan</button>
          </form>} />
        <div className="overflow-x-auto">
          <table className="table-base min-w-[640px]">
            <thead><tr><th>Bulan</th><th className="text-right">Pemasukan IPL</th><th className="text-right">Pemasukan Non-IPL</th><th className="text-right">Pengeluaran</th><th className="text-right">Selisih</th></tr></thead>
            <tbody>
              {recap.months.map((m) => {
                const net = m.incomeIpl + m.incomeOther - m.expense;
                return (
                  <tr key={m.month}>
                    <td>{MONTHS_ID[m.month - 1]}</td>
                    <td className="text-right">{rupiah(m.incomeIpl)}</td>
                    <td className="text-right">{rupiah(m.incomeOther)}</td>
                    <td className="text-right">{rupiah(m.expense)}</td>
                    <td className={`text-right font-medium ${net < 0 ? "text-red-700" : ""}`}>{rupiah(net)}</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-semibold">
                <td>Total {year}</td>
                <td className="text-right">{rupiah(recap.totals.incomeIpl)}</td>
                <td className="text-right">{rupiah(recap.totals.incomeOther)}</td>
                <td className="text-right">{rupiah(recap.totals.expense)}</td>
                <td className="text-right">{rupiah(recap.totals.incomeIpl + recap.totals.incomeOther - recap.totals.expense)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Per Kategori ${year}`} description="Asal pemasukan dan penggunaan dana." />
          <ul className="divide-y divide-slate-100 text-sm">
            {recap.categories.length === 0 && <li className="px-5 py-4 text-slate-500">Belum ada transaksi tahun ini.</li>}
            {recap.categories.map((c, i) => (
              <li key={i} className="flex justify-between gap-2 px-5 py-2.5">
                <span>{c.type === "INCOME" ? <HandCoins className="mr-1 inline h-4 w-4 text-brand-600" /> : <TrendingDown className="mr-1 inline h-4 w-4 text-red-600" />}{c.name}</span>
                <span className="font-medium">{rupiah(c.total)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Saldo Awal" description={can(ctx, "finance.opening_balance") ? "Hanya Super Admin. Setiap perubahan tercatat di audit log." : "Diatur oleh Super Admin."} />
          <CardBody>
            {can(ctx, "finance.opening_balance") && <div className="mb-5"><OpeningBalanceForm /></div>}
            <ul className="space-y-2 text-sm">
              {openings.length === 0 && <li className="text-slate-500">Belum ada saldo awal.</li>}
              {openings.map((o, i) => (
                <li key={o.id} className={i === 0 ? "font-medium" : "text-slate-500"}>
                  {rupiah(o.amount)} per {formatDateOnly(o.effectiveDate)} — {o.note} <span className="text-xs">({formatDateTime(o.createdAt)}{i === 0 ? ", berlaku" : ""})</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
