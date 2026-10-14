import Link from "next/link";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { listUnits } from "@/server/services/units";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { OccupancyBadge } from "@/components/domain/status-badges";
import { OCCUPANCY_STATUS } from "@/lib/labels";
import { UnitFormButton } from "./unit-form";

export const metadata = { title: "Data Rumah" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function UnitsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage("units.view");
  const s = await searchParams;
  const f = { q: sp(s.q), occupancy: sp(s.occupancy), page: parsePage(s.page) };
  const { items, total } = await listUnits(ctx, f);
  const owners = can(ctx, "units.manage")
    ? await prisma.resident.findMany({ where: { organizationId: ctx.organizationId, archivedAt: null }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 1000 })
    : [];
  return (
    <>
      <PageHeader title="Data Rumah" description={`${total} unit hunian`} crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Data Rumah" }]}
        actions={can(ctx, "units.manage") && <UnitFormButton owners={owners} label="Tambah Rumah" />} />
      <Card>
        <FilterBar action="/rumah" q={f.q} placeholder="Nomor rumah, alamat, atau nama penghuni" resetHref="/rumah">
          <FilterSelect name="occupancy" label="Hunian" value={f.occupancy} options={Object.entries(OCCUPANCY_STATUS).map(([value, label]) => ({ value, label }))} />
        </FilterBar>
        <DataTable rows={items} rowKey={(r) => r.id}
          mobileTitle={(r) => <Link href={`/rumah/${r.id}`} className="link">{r.houseNumber}</Link>}
          empty={{ title: "Belum ada data rumah", description: "Tambahkan rumah terlebih dahulu sebelum menerbitkan tagihan IPL." }}
          columns={[
            { header: "No. Rumah", hideOnMobile: true, cell: (r) => <Link href={`/rumah/${r.id}`} className="link">{r.houseNumber}</Link> },
            { header: "Alamat", cell: (r) => r.address },
            { header: "Penghuni Aktif", cell: (r) => r.memberships.map((m) => m.resident.fullName).join(", ") || "-" },
            { header: "Pemilik", cell: (r) => r.owner?.fullName ?? "-" },
            { header: "Hunian", cell: (r) => <OccupancyBadge status={r.occupancyStatus} /> },
            { header: "Status", cell: (r) => (r.isActive ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>) },
          ]} />
        <Pagination page={f.page} pageSize={20} total={total} baseHref="/rumah" params={{ q: f.q, occupancy: f.occupancy }} />
      </Card>
    </>
  );
}
