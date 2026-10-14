import { FileText } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { ADMIN_REQUEST_STATUS } from "@/lib/labels";
import type { getRequest } from "@/server/services/admin-requests";
import { RequestStatusBadge } from "./request-list";
import { CancelRequestButton, ProcessRequest } from "./request-forms";

export function RequestDetail({ r }: { r: Awaited<ReturnType<typeof getRequest>> }) {
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm"><dt className="text-slate-500">{k}</dt><dd className="col-span-2 whitespace-pre-line font-medium text-slate-800">{v || "-"}</dd></div>
  );
  const open = r.status === "SUBMITTED" || r.status === "PROCESSING";
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title={r.type.name} action={<RequestStatusBadge status={r.status} />} />
        <CardBody>
          <dl className="divide-y divide-slate-100">
            {row("Nomor Pengajuan", r.number)}
            {row("Pemohon", r.resident.fullName)}
            {row("Rumah", r.unit ? `${r.unit.houseNumber} — ${r.unit.address}` : null)}
            {row("Kontak", r.contactPhone)}
            {row("Tujuan / Keterangan", r.purpose)}
            {row("Catatan Pemohon", r.applicantNotes)}
            {row("Tanggal Pengajuan", formatDateTime(r.createdAt))}
            {r.internalNotes !== null && row("Catatan Internal", r.internalNotes)}
          </dl>
          <h3 className="mb-2 mt-5 text-sm font-semibold">Dokumen Pendukung</h3>
          {r.documents.length === 0 ? <p className="text-sm text-slate-500">Tidak ada dokumen.</p> : (
            <ul className="space-y-1 text-sm">
              {r.documents.map((d) => (
                <li key={d.id}><a className="link inline-flex items-center gap-1" href={`/api/files/${d.file.id}`} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4" />{d.file.originalName}</a></li>
              ))}
            </ul>
          )}
          {r.isOwner && r.status === "SUBMITTED" && <div className="mt-5"><CancelRequestButton id={r.id} /></div>}
        </CardBody>
      </Card>
      <div className="space-y-5">
        {r.canProcess && open && (
          <Card>
            <CardHeader title="Proses Pengajuan" />
            <CardBody><ProcessRequest id={r.id} status={r.status} internalNotes={r.internalNotes ?? ""} /></CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Riwayat Status" />
          <ol className="space-y-3 px-5 py-4 text-sm">
            {r.histories.map((h) => (
              <li key={h.id} className="border-l-2 border-brand-200 pl-3">
                <p className="font-medium">{ADMIN_REQUEST_STATUS[h.toStatus]}</p>
                <p className="text-xs text-slate-500">{formatDateTime(h.createdAt)}{h.actorId ? ` · ${r.actorNames[h.actorId] ?? ""}` : ""}</p>
                {h.note && <p className="text-xs text-slate-600">{h.note}</p>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
