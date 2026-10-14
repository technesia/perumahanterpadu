import Link from "next/link";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { getResident } from "@/server/services/residents";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OccupancyBadge, ResidentStatusBadge } from "@/components/domain/status-badges";
import { formatDate, formatDateOnly, formatDateTime } from "@/lib/format";
import { MEMBERSHIP_RELATION } from "@/lib/labels";
import { ArchiveButton } from "./archive-button";

export const metadata = { title: "Detail Warga" };

const HISTORY_LABEL: Record<string, string> = { CREATED: "Ditambahkan", UPDATED: "Diubah", ARCHIVED: "Diarsipkan", RESTORED: "Dipulihkan" };
const FIELD_LABEL: Record<string, string> = {
  fullName: "Nama", nik: "NIK", phone: "HP", email: "Email", status: "Status warga", occupancyStatus: "Status hunian",
  moveInDate: "Mulai tinggal", deathDate: "Tanggal meninggal", internalNotes: "Catatan internal",
};

export default async function ResidentDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("residents.view");
  const { id } = await params;
  const r = await getResident(ctx, id);
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm"><dt className="text-slate-500">{k}</dt><dd className="col-span-2 break-words font-medium text-slate-800">{v || "-"}</dd></div>
  );
  return (
    <>
      <PageHeader title={r.fullName} description={r.code}
        crumbs={[{ label: "Data Warga", href: "/warga" }, { label: r.fullName }]}
        actions={<>
          {can(ctx, "residents.update") && !r.archivedAt && <LinkButton href={`/warga/${id}/edit`} variant="secondary">Ubah Data</LinkButton>}
          {can(ctx, "residents.deactivate") && <ArchiveButton id={id} archived={!!r.archivedAt} name={r.fullName} />}
        </>} />
      {r.archivedAt && <p className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600">Warga ini diarsipkan pada {formatDateTime(r.archivedAt)}.</p>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Data Warga" />
          <CardBody>
            <dl className="divide-y divide-slate-100">
              {row("Status Warga", <ResidentStatusBadge status={r.status} />)}
              {row("Status Hunian", <OccupancyBadge status={r.occupancyStatus} />)}
              {row("NIK", r.nik ?? r.nikMasked)}
              {row("Nomor HP", r.phone)}
              {row("Email", r.email)}
              {row("Mulai Tinggal", formatDateOnly(r.moveInDate))}
              {row("Tanggal Pencatatan", formatDate(r.recordedAt))}
              {r.status === "DECEASED" && row("Tanggal Meninggal", `${formatDateOnly(r.deathDate)} (dicatat ${formatDateTime(r.deathRecordedAt)})`)}
              {r.internalNotes !== null && row("Catatan Internal", <span className="whitespace-pre-line font-normal">{r.internalNotes}</span>)}
            </dl>
          </CardBody>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Akun Pengguna" />
            <CardBody className="text-sm">
              {r.user ? (
                <div className="space-y-1">
                  <p className="font-medium">{r.user.username}</p>
                  <p className="text-slate-500">{r.user.email ?? "-"}</p>
                  <p>{r.user.roles.map((x) => <Badge key={x.role.key} tone="green" className="mr-1">{x.role.name}</Badge>)}
                    {!r.user.isActive && <Badge tone="red">Nonaktif</Badge>}</p>
                </div>
              ) : (
                <p className="text-slate-500">Belum memiliki akun. {can(ctx, "users.manage") && <Link href={`/pengguna?residentId=${id}`} className="link">Buat akun</Link>}</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Rumah" />
            <ul className="divide-y divide-slate-100 text-sm">
              {r.memberships.length === 0 && <li className="px-5 py-3 text-slate-500">Belum terhubung dengan rumah.</li>}
              {r.memberships.map((m) => (
                <li key={m.id} className="px-5 py-3">
                  <Link href={`/rumah/${m.unitId}`} className="link">{m.unit.houseNumber}</Link> · {MEMBERSHIP_RELATION[m.relation]}
                  <p className="text-xs text-slate-500">{formatDateOnly(m.startDate)} – {m.endDate ? formatDateOnly(m.endDate) : "sekarang"}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      <Card className="mt-5">
        <CardHeader title="Histori Perubahan" />
        <ul className="divide-y divide-slate-100 text-sm">
          {r.histories.map((h) => {
            const changes = h.changes as Record<string, { from: unknown; to: unknown }>;
            return (
              <li key={h.id} className="px-5 py-3">
                <p><span className="font-medium">{HISTORY_LABEL[h.action] ?? h.action}</span> · <span className="text-slate-500">{formatDateTime(h.createdAt)} oleh {h.actorId ? r.actorNames[h.actorId] ?? "-" : "-"}</span></p>
                {h.action === "UPDATED" && (
                  <p className="text-xs text-slate-600">{Object.entries(changes).map(([k, v]) => `${FIELD_LABEL[k] ?? k}: ${String(v.from ?? "-")} → ${String(v.to ?? "-")}`).join(" · ")}</p>
                )}
                {h.note && <p className="text-xs text-slate-500">Catatan: {h.note}</p>}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
