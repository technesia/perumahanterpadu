import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { listResidents } from "@/server/services/residents";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { OccupancyBadge, ResidentStatusBadge } from "@/components/domain/status-badges";
import { OCCUPANCY_STATUS, RESIDENT_STATUS } from "@/lib/labels";

export const metadata = { title: "Data Warga" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ResidentsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage("residents.view");
  const s = await searchParams;
  const f = { q: sp(s.q), status: sp(s.status), occupancy: sp(s.occupancy), unit: sp(s.unit), archived: sp(s.archived) === "1", sort: sp(s.sort), page: parsePage(s.page) };
  const { items, total } = await listResidents(ctx, f);
  return (
    <>
      <PageHeader title="Data Warga" description={`${total} warga ${f.archived ? "diarsipkan" : "terdaftar"}`}
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Data Warga" }]}
        actions={can(ctx, "residents.create") && <LinkButton href="/warga/baru"><Plus className="h-4 w-4" /> Tambah Warga</LinkButton>} />
      <Card>
        <FilterBar action="/warga" q={f.q} placeholder="Nama, ID warga, nomor rumah, atau HP" resetHref="/warga">
          <FilterSelect name="status" label="Status" value={f.status} options={Object.entries(RESIDENT_STATUS).map(([value, label]) => ({ value, label }))} />
          <FilterSelect name="occupancy" label="Hunian" value={f.occupancy} options={Object.entries(OCCUPANCY_STATUS).map(([value, label]) => ({ value, label }))} />
          <div><label htmlFor="f-unit" className="sr-only">Nomor rumah</label><input id="f-unit" name="unit" defaultValue={f.unit} placeholder="No. rumah" className="input h-10 sm:w-28" /></div>
          <FilterSelect name="sort" label="Urutkan" value={f.sort} options={[{ value: "name", label: "Nama" }, { value: "code", label: "ID Warga" }, { value: "newest", label: "Terbaru" }]} />
          <label className="flex h-10 items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="archived" value="1" defaultChecked={f.archived} className="accent-brand-700" /> Arsip</label>
        </FilterBar>
        <DataTable rows={items} rowKey={(r) => r.id}
          mobileTitle={(r) => <Link href={`/warga/${r.id}`} className="link">{r.fullName}</Link>}
          empty={{ title: "Tidak ada warga yang cocok", description: "Ubah filter pencarian atau tambahkan warga baru." }}
          columns={[
            { header: "Nama", hideOnMobile: true, cell: (r) => <Link href={`/warga/${r.id}`} className="link">{r.fullName}</Link> },
            { header: "ID Warga", cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
            { header: "Rumah", cell: (r) => r.memberships.map((m) => m.unit.houseNumber).join(", ") || "-" },
            { header: "Nomor HP", cell: (r) => r.phone ?? "-" },
            { header: "Status", cell: (r) => <ResidentStatusBadge status={r.status} /> },
            { header: "Hunian", cell: (r) => <OccupancyBadge status={r.occupancyStatus} /> },
            { header: "Akun", cell: (r) => (r.userId ? <Badge tone="green">Ada</Badge> : <Badge>Belum</Badge>) },
          ]} />
        <Pagination page={f.page} pageSize={20} total={total} baseHref="/warga"
          params={{ q: f.q, status: f.status, occupancy: f.occupancy, unit: f.unit, sort: f.sort, archived: f.archived ? "1" : undefined }} />
      </Card>
    </>
  );
}
