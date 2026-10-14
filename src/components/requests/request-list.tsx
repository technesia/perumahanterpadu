import Link from "next/link";
import { DataTable } from "@/components/ui/data-table";
import { Badge, type Tone } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { ADMIN_REQUEST_STATUS } from "@/lib/labels";
import type { listRequests } from "@/server/services/admin-requests";

type Row = Awaited<ReturnType<typeof listRequests>>["items"][number];
export const REQUEST_TONE: Record<keyof typeof ADMIN_REQUEST_STATUS, Tone> = { SUBMITTED: "blue", PROCESSING: "yellow", APPROVED: "green", REJECTED: "red", CANCELLED: "gray" };

export function RequestStatusBadge({ status }: { status: keyof typeof ADMIN_REQUEST_STATUS }) {
  return <Badge tone={REQUEST_TONE[status]}>{ADMIN_REQUEST_STATUS[status]}</Badge>;
}

export function RequestList({ rows, base, staff, emptyAction }: { rows: Row[]; base: string; staff: boolean; emptyAction?: React.ReactNode }) {
  return (
    <DataTable rows={rows} rowKey={(r) => r.id}
      mobileTitle={(r) => <Link href={`${base}/${r.id}`} className="link">{r.type.name}</Link>}
      empty={{ title: "Belum ada pengajuan", action: emptyAction }}
      columns={[
        { header: "Nomor", cell: (r) => <Link href={`${base}/${r.id}`} className="link">{r.number}</Link> },
        { header: "Jenis", hideOnMobile: true, cell: (r) => r.type.name },
        ...(staff ? [{ header: "Pemohon", cell: (r: Row) => `${r.resident.fullName}${r.unit ? ` (${r.unit.houseNumber})` : ""}` }] : []),
        { header: "Diajukan", cell: (r) => formatDateTime(r.createdAt) },
        { header: "Status", cell: (r) => <RequestStatusBadge status={r.status} /> },
      ]} />
  );
}
