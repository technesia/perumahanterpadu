import { FileText } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { getIncident } from "@/server/services/security";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { INCIDENT_STATUS } from "@/lib/labels";
import { INCIDENT_TONE } from "../tone";
import { ReviewIncidentForm } from "../forms";

export const metadata = { title: "Detail Laporan" };

export default async function IncidentDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["security.incidents.manage", "security.incidents.review"]);
  const i = await getIncident(ctx, (await params).id);
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm"><dt className="text-slate-500">{k}</dt><dd className="col-span-2 whitespace-pre-line font-medium text-slate-800">{v || "-"}</dd></div>
  );
  return (
    <>
      <PageHeader title={`${i.type} — ${i.number}`} crumbs={[{ label: "Laporan Kejadian", href: "/kejadian" }, { label: i.number }]} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Rincian Laporan" action={<Badge tone={INCIDENT_TONE[i.status]}>{INCIDENT_STATUS[i.status]}</Badge>} />
          <CardBody>
            <dl className="divide-y divide-slate-100">
              {row("Waktu Kejadian", formatDateTime(i.occurredAt))}
              {row("Lokasi", i.location)}
              {row("Petugas Pelapor", i.reporterName)}
              {row("Dilaporkan", formatDateTime(i.createdAt))}
              {row("Deskripsi", i.description)}
              {row("Catatan Pengurus", i.managementNotes)}
            </dl>
            <h3 className="mb-2 mt-5 text-sm font-semibold">Lampiran Bukti</h3>
            {i.attachments.length === 0 ? <p className="text-sm text-slate-500">Tidak ada lampiran.</p> : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {i.attachments.map((a) => a.file.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={a.id} href={`/api/files/${a.file.id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/files/${a.file.id}`} alt={a.file.originalName} className="h-32 w-full rounded-lg border object-cover" /></a>
                ) : (
                  <a key={a.id} href={`/api/files/${a.file.id}`} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-sm"><FileText className="h-4 w-4" />{a.file.originalName}</a>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
        {i.canReview && (
          <Card>
            <CardHeader title="Tindak Lanjut" />
            <CardBody><ReviewIncidentForm id={i.id} status={i.status} notes={i.managementNotes ?? ""} /></CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
