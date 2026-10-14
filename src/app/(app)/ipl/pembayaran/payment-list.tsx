import Link from "next/link";
import { DataTable } from "@/components/ui/data-table";
import { PaymentStatusBadge } from "@/components/domain/status-badges";
import { formatDateTime, periodLabel, rupiah } from "@/lib/format";
import { PAYMENT_METHOD } from "@/lib/labels";
import type { listPayments } from "@/server/services/ipl-payments";

type Row = Awaited<ReturnType<typeof listPayments>>["items"][number];

export function PaymentList({ rows, showResident }: { rows: Row[]; showResident: boolean }) {
  return (
    <DataTable rows={rows} rowKey={(p) => p.id}
      mobileTitle={(p) => <Link href={`/ipl/pembayaran/${p.id}`} className="link">{p.number}</Link>}
      empty={{ title: "Belum ada pembayaran" }}
      columns={[
        { header: "Nomor", hideOnMobile: true, cell: (p) => <Link href={`/ipl/pembayaran/${p.id}`} className="link">{p.number}</Link> },
        ...(showResident ? [{ header: "Warga", cell: (p: Row) => `${p.resident.fullName} (${p.unit.houseNumber})` }] : []),
        { header: "Periode", cell: (p) => p.allocations.map((a) => periodLabel(a.bill.periodYear, a.bill.periodMonth)).join(", ") },
        { header: "Total", cell: (p) => <span className="font-medium">{rupiah(p.totalAmount)}</span> },
        { header: "Metode", cell: (p) => PAYMENT_METHOD[p.method] },
        { header: "Diajukan", cell: (p) => formatDateTime(p.createdAt) },
        { header: "Status", cell: (p) => <PaymentStatusBadge status={p.status} /> },
      ]} />
  );
}
