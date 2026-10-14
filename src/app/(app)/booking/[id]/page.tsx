import { requirePage } from "@/server/auth/session";
import { getBooking } from "@/server/services/facilities";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { jakartaTime } from "@/lib/dates";
import { BOOKING_STATUS } from "@/lib/labels";
import { BookingStatusBadge } from "../booking-list";
import { BookingActions } from "./booking-actions";

export const metadata = { title: "Detail Booking" };

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["facilities.book", "facilities.manage"]);
  const b = await getBooking(ctx, (await params).id);
  const upcoming = b.endAt > new Date();
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm"><dt className="text-slate-500">{k}</dt><dd className="col-span-2 whitespace-pre-line font-medium text-slate-800">{v ?? "-"}</dd></div>
  );
  return (
    <>
      <PageHeader title={`Booking ${b.number}`} crumbs={[{ label: b.canManage ? "Booking Gedung" : "Booking Saya", href: b.canManage ? "/booking" : "/booking-saya" }, { label: b.number }]}
        actions={<BookingActions id={b.id} canReview={b.canManage && b.status === "PENDING"} ownerCancel={b.isOwner}
          canCancel={upcoming && (b.status === "PENDING" || b.status === "APPROVED") && (b.isOwner || b.canManage)} />} />
      {b.status === "PENDING" && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">Menunggu review dari Admin.</p>}
      {b.status === "REJECTED" && b.adminNotes && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">Ditolak: {b.adminNotes}</p>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={b.facility.name} action={<BookingStatusBadge status={b.status} />} />
          <CardBody>
            <dl className="divide-y divide-slate-100">
              {row("Waktu", `${formatDateTime(b.startAt)} – ${jakartaTime(b.endAt)} WIB`)}
              {row("Pemohon", b.resident.fullName)}
              {row("Rumah", b.resident.memberships.map((m) => `${m.unit.houseNumber} — ${m.unit.address}`).join("\n") || null)}
              {row("Nomor HP", b.resident.phone)}
              {row("Tujuan Acara", b.purpose)}
              {row("Jumlah Peserta", b.participants)}
              {row("Catatan", b.notes)}
              {row("Catatan Admin", b.adminNotes)}
              {row("Diajukan", formatDateTime(b.createdAt))}
              {b.decidedAt && row("Diputuskan", `${formatDateTime(b.decidedAt)}${b.decidedById ? ` oleh ${b.actorNames[b.decidedById] ?? "-"}` : ""}`)}
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Histori" />
          <ol className="space-y-3 px-5 py-4 text-sm">
            {b.histories.map((h) => (
              <li key={h.id} className="border-l-2 border-brand-200 pl-3">
                <p className="font-medium">{BOOKING_STATUS[h.toStatus]}</p>
                <p className="text-xs text-slate-500">{formatDateTime(h.createdAt)}{h.actorId ? ` · ${b.actorNames[h.actorId] ?? ""}` : ""}</p>
                {h.note && <p className="text-xs text-slate-600">{h.note}</p>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
