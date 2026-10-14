import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { currentPeriod, listBills, listIplTypes } from "@/server/services/ipl";
import { getOrganization } from "@/server/organization";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar, FilterSelect, sp, spInt } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { BillStatusBadge } from "@/components/domain/status-badges";
import { formatDateOnly, MONTHS_ID, periodLabel, rupiah } from "@/lib/format";
import { BILL_STATUS } from "@/lib/labels";
import { arrearsWindow } from "@/lib/ipl";
import { GenerateBillsButton, VoidBillButton } from "./bill-dialogs";

export const metadata = { title: "Tagihan IPL" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function BillsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage("ipl.view");
  const s = await searchParams;
  const f = { q: sp(s.q), status: sp(s.status), year: spInt(s.year), month: spInt(s.month), page: parsePage(s.page) };
  const [{ items, total }, types, org] = await Promise.all([listBills(ctx, f, 30), listIplTypes(ctx), getOrganization()]);
  const now = currentPeriod();
  const win = arrearsWindow(now, org.arrearsWindowMonths);
  const manage = can(ctx, "ipl.manage");
  const years = Array.from({ length: now.year + 2 - win.start.year }, (_, i) => String(win.start.year + i));
  return (
    <>
      <PageHeader title="Tagihan IPL" description={`${total} tagihan`} crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tagihan IPL" }]}
        actions={manage && <GenerateBillsButton types={types.filter((t) => t.isActive)} defaultYear={now.year} defaultMonth={now.month} minYear={win.start.year} />} />
      <Card>
        <FilterBar action="/ipl/tagihan" q={f.q} placeholder="Nomor rumah atau nama penanggung jawab" resetHref="/ipl/tagihan">
          <FilterSelect name="status" label="Status" value={f.status} options={(["UNPAID", "PENDING", "PARTIAL", "NOT_DUE", "PAID", "VOID"] as const).map((v) => ({ value: v, label: BILL_STATUS[v] }))} />
          <FilterSelect name="month" label="Bulan" value={f.month ? String(f.month) : undefined} options={MONTHS_ID.map((m, i) => ({ value: String(i + 1), label: m }))} />
          <FilterSelect name="year" label="Tahun" value={f.year ? String(f.year) : undefined} options={years.map((y) => ({ value: y, label: y }))} />
        </FilterBar>
        <DataTable rows={items} rowKey={(b) => b.id}
          mobileTitle={(b) => `${b.unit.houseNumber} · ${periodLabel(b.periodYear, b.periodMonth)}`}
          empty={{ title: "Belum ada tagihan", description: manage ? "Atur Master IPL lalu gunakan tombol Terbitkan Tagihan." : undefined }}
          columns={[
            { header: "Rumah", hideOnMobile: true, cell: (b) => b.unit.houseNumber },
            { header: "Periode", hideOnMobile: true, cell: (b) => periodLabel(b.periodYear, b.periodMonth) },
            { header: "Penanggung Jawab", cell: (b) => b.residentName ?? "-" },
            { header: "Jenis", cell: (b) => b.typeName },
            { header: "Nominal", cell: (b) => rupiah(b.amount) },
            { header: "Terbayar", cell: (b) => rupiah(b.paidAmount) },
            { header: "Jatuh Tempo", cell: (b) => formatDateOnly(b.dueDate) },
            { header: "Status", cell: (b) => <BillStatusBadge status={b.displayStatus} /> },
            ...(manage ? [{ header: "Aksi", cell: (b: (typeof items)[number]) => (b.displayStatus === "UNPAID" || b.displayStatus === "NOT_DUE")
              ? <VoidBillButton id={b.id} label={`${b.unit.houseNumber} ${periodLabel(b.periodYear, b.periodMonth)}`} /> : null }] : []),
          ]} />
        <Pagination page={f.page} pageSize={30} total={total} baseHref="/ipl/tagihan"
          params={{ q: f.q, status: f.status, year: f.year ? String(f.year) : undefined, month: f.month ? String(f.month) : undefined }} />
      </Card>
    </>
  );
}
