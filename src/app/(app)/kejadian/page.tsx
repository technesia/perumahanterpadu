import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { listIncidents } from "@/server/services/security";
import { INCIDENT_TYPES } from "@/server/master-data";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { INCIDENT_TONE } from "./tone";
import { LinkButton } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import { INCIDENT_STATUS } from "@/lib/labels";

export const metadata = { title: "Laporan Kejadian" };

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage(["security.incidents.manage", "security.incidents.review"]);
  const s = await searchParams;
  const f = { q: sp(s.q), status: sp(s.status), type: sp(s.type), page: parsePage(s.page) };
  const { items, total } = await listIncidents(ctx, f);
  return (
    <>
      <PageHeader title="Laporan Kejadian" description={`${total} laporan`} crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Laporan Kejadian" }]}
        actions={can(ctx, "security.incidents.manage") && <LinkButton href="/kejadian/baru"><Plus className="h-4 w-4" /> Buat Laporan</LinkButton>} />
      <Card>
        <FilterBar action="/kejadian" q={f.q} placeholder="Nomor, lokasi, atau isi laporan" resetHref="/kejadian">
          <FilterSelect name="status" label="Status" value={f.status} options={Object.entries(INCIDENT_STATUS).map(([value, label]) => ({ value, label }))} />
          <FilterSelect name="type" label="Jenis" value={f.type} options={INCIDENT_TYPES.map((t) => ({ value: t, label: t }))} />
        </FilterBar>
        <DataTable rows={items} rowKey={(i) => i.id} mobileTitle={(i) => <Link href={`/kejadian/${i.id}`} className="link">{i.type}</Link>}
          empty={{ title: "Belum ada laporan kejadian" }}
          columns={[
            { header: "Nomor", cell: (i) => <Link href={`/kejadian/${i.id}`} className="link">{i.number}</Link> },
            { header: "Jenis", hideOnMobile: true, cell: (i) => i.type },
            { header: "Waktu", cell: (i) => formatDateTime(i.occurredAt) },
            { header: "Lokasi", cell: (i) => i.location },
            { header: "Pelapor", cell: (i) => i.reporterName },
            { header: "Status", cell: (i) => <Badge tone={INCIDENT_TONE[i.status]}>{INCIDENT_STATUS[i.status]}</Badge> },
          ]} />
        <Pagination page={f.page} pageSize={20} total={total} baseHref="/kejadian" params={{ q: f.q, status: f.status, type: f.type }} />
      </Card>
    </>
  );
}
