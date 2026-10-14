import Link from "next/link";
import { LogIn } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { listVisitors } from "@/server/services/security";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import { CheckOutButton } from "./checkout-button";

export const metadata = { title: "Buku Tamu" };

export default async function GuestBookPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage(["security.visitors.view", "security.visitors.manage"]);
  const s = await searchParams;
  const f = { q: sp(s.q), status: sp(s.status), date: sp(s.date), page: parsePage(s.page) };
  const { items, total } = await listVisitors(ctx, f);
  const manage = can(ctx, "security.visitors.manage");
  return (
    <>
      <PageHeader title="Buku Tamu" description={f.status === "inside" ? `${total} tamu masih berada di perumahan` : `${total} kunjungan`}
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Buku Tamu" }]}
        actions={manage && <LinkButton href="/buku-tamu/masuk"><LogIn className="h-4 w-4" /> Catat Tamu Masuk</LinkButton>} />
      <Card>
        <FilterBar action="/buku-tamu" q={f.q} placeholder="Nama tamu, rumah, penghuni, atau plat nomor" resetHref="/buku-tamu">
          <FilterSelect name="status" label="Status" value={f.status} options={[{ value: "inside", label: "Masih di dalam" }, { value: "out", label: "Sudah keluar" }]} />
          <div><label htmlFor="date" className="sr-only">Tanggal</label><input id="date" name="date" type="date" defaultValue={f.date} className="input h-10 py-0" /></div>
        </FilterBar>
        <DataTable rows={items} rowKey={(v) => v.id} mobileTitle={(v) => <Link href={`/buku-tamu/${v.id}`} className="link">{v.visitorName}</Link>}
          empty={{ title: f.status === "inside" ? "Tidak ada tamu di dalam" : "Belum ada kunjungan" }}
          columns={[
            { header: "Tamu", hideOnMobile: true, cell: (v) => <Link href={`/buku-tamu/${v.id}`} className="link">{v.visitorName}</Link> },
            { header: "Tujuan", cell: (v) => <>{v.unit?.houseNumber ?? "-"}{v.hostName ? ` · ${v.hostName}` : ""}<span className="block text-xs text-slate-500">{v.purpose}</span></> },
            { header: "Kendaraan", cell: (v) => v.vehiclePlate ?? "-" },
            { header: "Masuk", cell: (v) => formatDateTime(v.checkInAt) },
            { header: "Keluar", cell: (v) => (v.checkOutAt ? formatDateTime(v.checkOutAt) : <Badge tone="yellow">Di dalam</Badge>) },
            ...(manage ? [{ header: "Aksi", cell: (v: (typeof items)[number]) => (!v.checkOutAt ? <CheckOutButton id={v.id} name={v.visitorName} /> : null) }] : []),
          ]} />
        <Pagination page={f.page} pageSize={25} total={total} baseHref="/buku-tamu" params={{ q: f.q, status: f.status, date: f.date }} />
      </Card>
    </>
  );
}
