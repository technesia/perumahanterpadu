import { Building2 } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listFacilities } from "@/server/services/facilities";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { rupiah } from "@/lib/format";
import { FacilityButton } from "./facility-form";

export const metadata = { title: "Fasilitas" };

export default async function FacilitiesPage() {
  const ctx = await requirePage("facilities.manage");
  const items = await listFacilities(ctx, true);
  return (
    <>
      <PageHeader title="Fasilitas" description="Gedung dan fasilitas yang dapat dipesan warga." crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Fasilitas" }]}
        actions={<FacilityButton />} />
      {items.length === 0 ? <Card><EmptyState title="Belum ada fasilitas" description="Tambahkan gedung agar warga dapat mengajukan booking." action={<FacilityButton />} /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((f) => (
            <Card key={f.id} className="overflow-hidden">
              {f.photoFileId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${f.photoFileId}`} alt={f.name} loading="lazy" className="h-40 w-full object-cover" />
              ) : <div className="flex h-24 items-center justify-center bg-brand-50"><Building2 className="h-10 w-10 text-brand-300" /></div>}
              <div className="space-y-1 p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-slate-900">{f.name}</h2>
                  {f.isActive ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>}
                </div>
                {f.location && <p className="text-slate-500">{f.location}</p>}
                <p>Jam {f.openTime}–{f.closeTime} · slot {f.slotMinutes} menit</p>
                <p>Kapasitas {f.capacity ?? "-"} · {f.fee ? rupiah(f.fee) : "Gratis"}</p>
                {f.description && <p className="line-clamp-2 text-slate-600">{f.description}</p>}
                <div className="pt-2">
                  <FacilityButton id={f.id} initial={{ name: f.name, description: f.description ?? "", location: f.location ?? "", capacity: f.capacity ? String(f.capacity) : "", rules: f.rules ?? "", fee: f.fee, openTime: f.openTime, closeTime: f.closeTime, slotMinutes: f.slotMinutes, isActive: f.isActive }} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
