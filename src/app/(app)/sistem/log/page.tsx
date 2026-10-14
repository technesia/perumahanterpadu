import { requirePage } from "@/server/auth/session";
import { listAuditLogs } from "@/server/services/audit-logs";
import { ROLE_LABELS, type RoleKey } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import { LiveFeed } from "./live-feed";

export const metadata = { title: "Activity Log" };
export const dynamic = "force-dynamic";

const MODULE_LABEL: Record<string, string> = {
  auth: "Autentikasi", residents: "Warga", units: "Rumah", users: "Akun", ipl: "IPL", finance: "Keuangan",
  administration: "Administrasi", announcements: "Pengumuman", activities: "Kegiatan", facilities: "Fasilitas",
  businesses: "UMKM", posyandu: "Posyandu", security: "Keamanan", settings: "Pengaturan",
};

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage("audit_logs.view");
  const s = await searchParams;
  const f = { q: sp(s.q), module: sp(s.module), from: sp(s.from), to: sp(s.to), page: parsePage(s.page) };
  const { items, total, modules } = await listAuditLogs(ctx, f);
  const live = f.page === 1 && !f.from && !f.to;
  return (
    <>
      <PageHeader title="Activity Log" description="Catatan aktivitas dari backend. Hanya dapat dibaca — tidak dapat diubah atau dihapus."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Activity Log" }]} />
      <Card>
        <FilterBar action="/sistem/log" q={f.q} placeholder="Ringkasan, nama pengguna, aksi, atau ID record" resetHref="/sistem/log">
          <FilterSelect name="module" label="Modul" value={f.module} options={modules.map((m) => ({ value: m, label: MODULE_LABEL[m] ?? m }))} />
          <div><label htmlFor="from" className="sr-only">Dari</label><input id="from" name="from" type="date" defaultValue={f.from} className="input h-10 py-0" /></div>
          <div><label htmlFor="to" className="sr-only">Sampai</label><input id="to" name="to" type="date" defaultValue={f.to} className="input h-10 py-0" /></div>
        </FilterBar>
        {live && <LiveFeed since={(items[0]?.createdAt ?? new Date()).toISOString()} module={f.module} q={f.q} />}
        <DataTable rows={items} rowKey={(l) => l.id} mobileTitle={(l) => l.summary}
          empty={{ title: "Belum ada aktivitas" }}
          columns={[
            { header: "Waktu", cell: (l) => <span className="whitespace-nowrap">{formatDateTime(l.createdAt)}</span> },
            { header: "Pengguna", cell: (l) => <>{l.userName ?? "Sistem"}<span className="block text-xs text-slate-500">{l.userRole ? ROLE_LABELS[l.userRole as RoleKey] ?? l.userRole : "-"}</span></> },
            { header: "Aktivitas", hideOnMobile: true, cell: (l) => l.summary },
            { header: "Modul", cell: (l) => <Badge>{MODULE_LABEL[l.module] ?? l.module}</Badge> },
            { header: "Jenis", cell: (l) => <span className="font-mono text-xs">{l.action}</span> },
            { header: "Entitas", cell: (l) => (l.entityType ? <span className="text-xs">{l.entityType}<br /><span className="font-mono text-slate-400">{l.entityId}</span></span> : "-") },
            { header: "Status", cell: (l) => <Badge tone={l.status === "SUCCESS" ? "green" : "red"}>{l.status === "SUCCESS" ? "Berhasil" : "Gagal"}</Badge> },
          ]} />
        <Pagination page={f.page} pageSize={30} total={total} baseHref="/sistem/log" params={{ q: f.q, module: f.module, from: f.from, to: f.to }} />
      </Card>
    </>
  );
}
