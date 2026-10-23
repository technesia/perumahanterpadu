import { HandCoins, Landmark, Wallet } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { currentPeriod, listIplTypes } from "@/server/services/ipl";
import { listOpeningBills, openingSummary } from "@/server/services/ipl-opening";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { periodLabel, rupiah } from "@/lib/format";
import { BILL_STATUS } from "@/lib/labels";
import { AddOpeningButton, OpeningImport, OpeningRowActions } from "./opening-dialogs";

export const metadata = { title: "Tunggakan Awal IPL" };
type SP = Promise<Record<string, string | string[] | undefined>>;

const STATUS_TONE = { UNPAID: "red", PARTIAL: "gold", PAID: "green", VOID: "gray" } as const;

export default async function OpeningArrearsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage("ipl.view");
  const s = await searchParams;
  const f = { q: sp(s.q), kind: sp(s.kind), status: sp(s.status), page: parsePage(s.page) };
  const [summary, { items, total }, types] = await Promise.all([openingSummary(ctx), listOpeningBills(ctx, f, 30), listIplTypes(ctx)]);
  const manage = can(ctx, "ipl.opening_manage");
  const active = types.filter((t) => t.isActive);
  const now = currentPeriod();
  return (
    <>
      <PageHeader title="Tunggakan Awal IPL"
        description="Tunggakan sebelum aplikasi digunakan. Dihitung sebagai piutang warga, bukan pemasukan kas — kas hanya bertambah saat pembayaran dikonfirmasi."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tunggakan Awal" }]}
        actions={manage && <AddOpeningButton types={active} currentYear={now.year} currentMonth={now.month} />} />

      <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Tunggakan Awal" value={rupiah(summary.openingTotal)} hint={`${summary.records} data · ${summary.units} rumah${summary.lumpRecords ? ` · ${summary.lumpRecords} tanpa rincian periode` : ""}`} icon={Landmark} tone="gold" />
        <StatCard label="Pembayaran atas Tunggakan" value={rupiah(summary.paidViaApp)} hint="Dikonfirmasi lewat aplikasi (tercatat di kas)" icon={HandCoins} tone="brand" />
        <StatCard label="Sisa Piutang" value={rupiah(summary.remaining)} hint="Belum dibayar" icon={Wallet} tone="red" href="/ipl/belum-bayar" />
      </div>

      {manage && (
        <Card>
          <CardHeader title="Impor dari Excel" description="Unduh template, isi riwayat tunggakan, unggah, periksa pratinjau, lalu konfirmasi. Data tidak disimpan sebelum dikonfirmasi." />
          <CardBody><OpeningImport types={active} /></CardBody>
        </Card>
      )}

      <Card>
        <FilterBar action="/ipl/tunggakan-awal" q={f.q} placeholder="Nomor rumah atau nama warga" resetHref="/ipl/tunggakan-awal">
          <FilterSelect name="kind" label="Jenis" value={f.kind} options={[{ value: "OPENING_PERIOD", label: "Per periode" }, { value: "OPENING_LUMP", label: "Tanpa rincian periode" }]} />
          <FilterSelect name="status" label="Status" value={f.status} options={[{ value: "OPEN", label: "Belum lunas" }, { value: "PAID", label: "Lunas" }, { value: "VOID", label: "Dibatalkan" }]} />
        </FilterBar>
        <DataTable rows={items} rowKey={(b) => b.id}
          mobileTitle={(b) => `${b.houseNumber} · ${b.residentName ?? "-"}`}
          empty={{ title: "Belum ada tunggakan awal", description: manage ? "Gunakan Input Tunggakan Manual atau Impor dari Excel." : undefined }}
          columns={[
            { header: "Rumah / Warga", hideOnMobile: true, cell: (b) => <><span className="font-medium">{b.houseNumber}</span><span className="block text-xs text-slate-500">{b.residentName ?? "-"}</span></> },
            { header: "Periode", cell: (b) => <span className="block min-w-28">{periodLabel(b.periodYear, b.periodMonth)}<span className="block text-xs text-slate-500">{b.typeName}</span></span> },
            { header: "Nominal", cell: (b) => <span className="whitespace-nowrap">{rupiah(b.amount)}</span> },
            { header: "Terbayar", cell: (b) => (b.initialPaidAmount || b.paidViaApp) ? <span className="whitespace-nowrap text-xs">
              {b.initialPaidAmount > 0 && <span className="block">Sebelum aplikasi: {rupiah(b.initialPaidAmount)}</span>}
              {b.paidViaApp > 0 && <span className="block">Via aplikasi: {rupiah(b.paidViaApp)}</span>}
            </span> : "-" },
            { header: "Sisa", cell: (b) => <strong className="whitespace-nowrap">{rupiah(b.status === "VOID" ? 0 : b.outstanding)}</strong> },
            { header: "Status", cell: (b) => <>
              <Badge tone={b.pending ? "blue" : STATUS_TONE[b.status]}>{b.pending ? BILL_STATUS.PENDING : BILL_STATUS[b.status]}</Badge>
              {b.corrections > 0 && <span className="mt-0.5 block text-xs text-slate-500">{b.corrections}× dikoreksi</span>}
            </> },
            ...(manage ? [{ header: "Aksi", cell: (b: (typeof items)[number]) => (
              <OpeningRowActions item={{
                id: b.id, label: `${b.houseNumber} ${periodLabel(b.periodYear, b.periodMonth)}`, status: b.status, amount: b.amount,
                initialPaidAmount: b.initialPaidAmount, paidViaApp: b.paidViaApp, outstanding: b.outstanding, lump: b.kind === "OPENING_LUMP", pending: b.pending,
              }} />
            ) }] : []),
          ]} />
        <Pagination page={f.page} pageSize={30} total={total} baseHref="/ipl/tunggakan-awal" params={{ q: f.q, kind: f.kind, status: f.status }} />
      </Card>
      </div>
    </>
  );
}
