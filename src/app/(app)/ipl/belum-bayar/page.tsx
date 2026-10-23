import Link from "next/link";
import { BadgeDollarSign, Clock, Home, Phone, Wallet } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { unpaidList, unpaidSummary } from "@/server/services/ipl";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { FilterBar, FilterSelect, sp, spInt } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { BillStatusBadge, OccupancyBadge } from "@/components/domain/status-badges";
import { MONTHS_ID, periodLabel, rupiah, waNumber } from "@/lib/format";
import { OCCUPANCY_STATUS } from "@/lib/labels";

export const metadata = { title: "IPL Belum Bayar" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function UnpaidPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage("ipl.view");
  const s = await searchParams;
  const f = { q: sp(s.q), occupancy: sp(s.occupancy), year: spInt(s.year), month: spInt(s.month), minMonths: spInt(s.min), page: parsePage(s.page) };
  const [sum, list] = await Promise.all([unpaidSummary(ctx), unpaidList(ctx, f)]);
  const years = Array.from({ length: list.window.end.year - list.window.start.year + 1 }, (_, i) => String(list.window.start.year + i));
  return (
    <>
      <PageHeader title="IPL Belum Bayar" crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "IPL Belum Bayar" }]}
        description={`Tagihan lewat jatuh tempo periode ${periodLabel(sum.window.start.year, sum.window.start.month)} – ${periodLabel(sum.window.end.year, sum.window.end.month)}. Pembayaran yang menunggu verifikasi tidak dihitung.`} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Rumah Menunggak" value={sum.unitsInArrears} icon={Home} tone="red" />
        <StatCard label="Total Periode Tertunggak" value={sum.periods} icon={BadgeDollarSign} tone="red" />
        <StatCard label="Total Nominal Tunggakan" value={rupiah(sum.amount)} icon={Wallet} tone="red" />
        <StatCard label="Menunggu Verifikasi" value={sum.pendingPayments} icon={Clock} tone="blue" href="/ipl/pembayaran?status=PENDING_VERIFICATION" />
      </div>
      <Card>
        <FilterBar action="/ipl/belum-bayar" q={f.q} placeholder="Nomor rumah atau nama warga" resetHref="/ipl/belum-bayar">
          <FilterSelect name="occupancy" label="Hunian" value={f.occupancy} options={Object.entries(OCCUPANCY_STATUS).map(([value, label]) => ({ value, label }))} />
          <FilterSelect name="month" label="Bulan" value={f.month ? String(f.month) : undefined} options={MONTHS_ID.map((m, i) => ({ value: String(i + 1), label: m }))} />
          <FilterSelect name="year" label="Tahun" value={f.year ? String(f.year) : undefined} options={years.map((y) => ({ value: y, label: y }))} />
          <FilterSelect name="min" label="Min. tunggakan" value={f.minMonths ? String(f.minMonths) : undefined}
            options={[2, 3, 6, 12, 24].map((n) => ({ value: String(n), label: `≥ ${n} bulan` }))} />
        </FilterBar>
        {list.items.length === 0 ? (
          <EmptyState title="Tidak ada tunggakan" description="Semua tagihan yang sudah jatuh tempo telah lunas atau sedang diverifikasi." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.items.map((it) => {
              const wa = waNumber(it.resident?.phone);
              return (
                <li key={it.unit.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{it.resident?.fullName ?? "(tanpa penghuni)"} <span className="font-normal text-slate-500">· Rumah {it.unit.houseNumber}</span></p>
                      <p className="text-sm text-slate-500">{it.unit.address}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        <span>HP: {it.resident?.phone ?? "-"}</span>
                        <OccupancyBadge status={it.resident?.occupancyStatus ?? it.unit.occupancyStatus} />
                        {it.pendingPayments > 0 && <Badge tone="blue">{it.pendingPayments} pembayaran menunggu verifikasi</Badge>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-700">{rupiah(it.amount)}</p>
                      <p className="text-xs text-slate-500">{it.months} bulan</p>
                    </div>
                  </div>
                  <ul className="mt-3 divide-y divide-slate-100 rounded-lg border text-sm sm:hidden">
                    {it.bills.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span>{periodLabel(b.periodYear, b.periodMonth)}<br /><span className="text-xs text-slate-500">{b.typeName}</span></span>
                        <span className="text-right font-medium">{rupiah(b.outstanding)}<br /><BillStatusBadge status={b.displayStatus} /></span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 hidden sm:block">
                    <table className="table-base rounded-lg border">
                      <thead><tr><th>Bulan</th><th>Tahun</th><th>Jenis</th><th className="text-right">Nominal</th><th>Status</th></tr></thead>
                      <tbody>
                        {it.bills.map((b) => (
                          <tr key={b.id}><td>{b.periodMonth ? MONTHS_ID[b.periodMonth - 1] : "Tanpa rincian"}</td><td>{b.periodYear || "-"}</td><td>{b.typeName}</td><td className="text-right">{rupiah(b.outstanding)}</td><td><BillStatusBadge status={b.displayStatus} /></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/rumah/${it.unit.id}`} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">Lihat Detail</Link>
                    {wa && (
                      <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Yth. ${it.resident?.fullName}, mengingatkan tagihan IPL rumah ${it.unit.houseNumber} sebanyak ${it.months} bulan (${rupiah(it.amount)}). Terima kasih. — Pengurus Taman Pesona Rajeg Mulya`)}`}
                        target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                        <Phone className="h-4 w-4" /> Hubungi Warga
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={f.page} pageSize={20} total={list.total} baseHref="/ipl/belum-bayar"
          params={{ q: f.q, occupancy: f.occupancy, year: f.year ? String(f.year) : undefined, month: f.month ? String(f.month) : undefined, min: f.minMonths ? String(f.minMonths) : undefined }} />
      </Card>
    </>
  );
}
