import { Clock, MapPin, MessageCircle, Store } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { listBusinesses } from "@/server/services/community";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { BusinessForm } from "@/components/community/forms";
import { PUBLISH_STATUS } from "@/lib/labels";
import { waNumber } from "@/lib/format";

export const metadata = { title: "UMKM Warga" };

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage(["businesses.view", "businesses.manage"]);
  const s = await searchParams;
  const f = { q: sp(s.q), category: sp(s.category), status: sp(s.status), page: parsePage(s.page) };
  const { items, total, manage, categories } = await listBusinesses(ctx, f);
  const residents = manage ? await prisma.resident.findMany({ where: { organizationId: ctx.organizationId, archivedAt: null }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 1000 }) : [];
  return (
    <>
      <PageHeader title={manage ? "Direktori UMKM" : "UMKM Warga"} description="Usaha milik warga Taman Pesona Rajeg Mulya."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "UMKM" }]} actions={manage && <BusinessForm residents={residents} />} />
      <Card className="mb-4">
        <FilterBar action="/umkm" q={f.q} placeholder="Nama usaha atau produk" resetHref="/umkm">
          <FilterSelect name="category" label="Kategori" value={f.category} options={categories.map((c) => ({ value: c, label: c }))} />
          {manage && <FilterSelect name="status" label="Status" value={f.status} options={Object.entries(PUBLISH_STATUS).map(([value, label]) => ({ value, label }))} />}
        </FilterBar>
      </Card>
      {items.length === 0 ? <Card><EmptyState title="Belum ada usaha terdaftar" description={manage ? "Tambahkan usaha warga setelah mendapat persetujuan pemilik." : undefined} /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((b) => {
            const wa = waNumber(b.contact);
            return (
              <Card key={b.id} className="flex flex-col p-4 text-sm">
                <div className="flex gap-3">
                  {b.logoFileId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${b.logoFileId}`} alt={`Logo ${b.name}`} loading="lazy" className="h-16 w-16 shrink-0 rounded-lg border object-cover" />
                  ) : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gold-50"><Store className="h-7 w-7 text-gold-500" /></div>}
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-900">{b.name}</h2>
                    <p className="text-slate-500">{b.ownerName}</p>
                    <div className="mt-1 flex flex-wrap gap-1"><Badge tone="gold">{b.category}</Badge>{manage && <Badge tone={b.status === "PUBLISHED" ? "green" : "gray"}>{b.status === "ARCHIVED" ? "Nonaktif" : PUBLISH_STATUS[b.status]}</Badge>}</div>
                  </div>
                </div>
                {b.description && <p className="mt-3 text-slate-600">{b.description}</p>}
                <div className="mt-3 space-y-1 text-slate-600">
                  {b.openingHours && <p className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{b.openingHours}</p>}
                  {b.address && <p className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{b.address}{manage && !b.showAddress && <span className="text-xs text-slate-400">(tidak ditampilkan ke warga)</span>}</p>}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-700"><MessageCircle className="h-4 w-4" /> Hubungi</a>}
                  {manage && <BusinessForm residents={residents} initial={{ id: b.id, name: b.name, ownerResidentId: b.ownerResidentId, ownerName: b.ownerName, category: b.category, description: b.description, contact: b.contact, address: b.address, showAddress: b.showAddress, ownerConsent: b.ownerConsent, openingHours: b.openingHours, status: b.status }} />}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Pagination page={f.page} pageSize={18} total={total} baseHref="/umkm" params={{ q: f.q, category: f.category, status: f.status }} />
    </>
  );
}
