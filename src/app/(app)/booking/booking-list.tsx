import Link from "next/link";
import { DataTable } from "@/components/ui/data-table";
import { Badge, type Tone } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { jakartaTime } from "@/lib/dates";
import { BOOKING_STATUS } from "@/lib/labels";
import type { listBookings } from "@/server/services/facilities";

type Row = Awaited<ReturnType<typeof listBookings>>["items"][number];
const TONE: Record<keyof typeof BOOKING_STATUS, Tone> = { PENDING: "yellow", APPROVED: "green", REJECTED: "red", CANCELLED: "gray" };
export function BookingStatusBadge({ status }: { status: keyof typeof BOOKING_STATUS }) {
  return <Badge tone={TONE[status]}>{BOOKING_STATUS[status]}</Badge>;
}

export function BookingList({ rows, staff }: { rows: Row[]; staff: boolean }) {
  return (
    <DataTable rows={rows} rowKey={(b) => b.id}
      mobileTitle={(b) => <Link href={`/booking/${b.id}`} className="link">{b.facility.name}</Link>}
      empty={{ title: "Belum ada booking" }}
      columns={[
        { header: "Nomor", cell: (b) => <Link href={`/booking/${b.id}`} className="link">{b.number}</Link> },
        { header: "Gedung", hideOnMobile: true, cell: (b) => b.facility.name },
        { header: "Waktu", cell: (b) => `${formatDateTime(b.startAt)} – ${jakartaTime(b.endAt)}` },
        ...(staff ? [{ header: "Pemohon", cell: (b: Row) => b.resident.fullName }] : []),
        { header: "Tujuan", cell: (b) => b.purpose },
        { header: "Status", cell: (b) => <BookingStatusBadge status={b.status} /> },
      ]} />
  );
}
