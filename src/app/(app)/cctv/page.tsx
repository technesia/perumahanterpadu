import { Camera, ExternalLink } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { listCameras } from "@/server/services/security";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CAMERA_STATUS } from "@/lib/labels";
import { CameraButton } from "./camera-form";

export const metadata = { title: "CCTV" };

export default async function CctvPage() {
  const ctx = await requirePage("cctv.view");
  const cams = await listCameras(ctx);
  const manage = can(ctx, "cctv.manage");
  return (
    <>
      <PageHeader title="Direktori CCTV" description="Live streaming belum terintegrasi; kamera dibuka melalui tautan yang dikonfigurasi pengurus. Setiap akses tercatat."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "CCTV" }]} actions={manage && <CameraButton />} />
      {cams.length === 0 ? <Card><EmptyState title="Belum ada kamera terdaftar" description={manage ? "Tambahkan kamera beserta tautan akses NVR/aplikasi kamera." : undefined} /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cams.map((c) => (
            <Card key={c.id} className="flex flex-col p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Camera className="h-5 w-5 text-slate-400" />{c.name}</h2>
                <Badge tone={c.status === "ONLINE" ? "green" : c.status === "OFFLINE" ? "red" : c.status === "MAINTENANCE" ? "yellow" : "gray"}>{CAMERA_STATUS[c.status]}</Badge>
              </div>
              <p className="mt-1 text-slate-600">{c.location}</p>
              {c.description && <p className="mt-1 text-slate-500">{c.description}</p>}
              {c.internalNotes && <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">Catatan internal: {c.internalNotes}</p>}
              {!c.isActive && <Badge className="mt-2 self-start">Nonaktif</Badge>}
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                {c.hasLink && c.isActive ? (
                  <a href={`/api/cctv/${c.id}/open`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-brand-700 px-3 py-2 font-medium text-white hover:bg-brand-800">
                    <ExternalLink className="h-4 w-4" /> Buka Kamera
                  </a>
                ) : <span className="text-xs text-slate-400">Tautan belum dikonfigurasi</span>}
                {manage && <CameraButton id={c.id} initial={{ name: c.name, location: c.location, description: c.description ?? "", status: c.status, internalNotes: c.internalNotes ?? "", isActive: c.isActive, hasLink: c.hasLink }} />}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
