import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { getVisitor } from "@/server/services/security";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { CheckOutButton } from "../checkout-button";

export const metadata = { title: "Detail Kunjungan" };

export default async function VisitorDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["security.visitors.view", "security.visitors.manage"]);
  const v = await getVisitor(ctx, (await params).id);
  const row = (k: string, val: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm"><dt className="text-slate-500">{k}</dt><dd className="col-span-2 font-medium text-slate-800">{val || "-"}</dd></div>
  );
  return (
    <>
      <PageHeader title={v.visitorName} description={v.number} crumbs={[{ label: "Buku Tamu", href: "/buku-tamu" }, { label: v.number }]}
        actions={!v.checkOutAt && can(ctx, "security.visitors.manage") && <CheckOutButton id={v.id} name={v.visitorName} />} />
      <Card><CardBody>
        <dl className="divide-y divide-slate-100">
          {row("Status", v.checkOutAt ? <Badge tone="green">Sudah keluar</Badge> : <Badge tone="yellow">Masih di dalam</Badge>)}
          {row("Tujuan Kunjungan", v.purpose)}
          {row("Rumah", v.unit ? `${v.unit.houseNumber} — ${v.unit.address}` : null)}
          {row("Penghuni Dikunjungi", v.hostName)}
          {row("Nomor Kendaraan", v.vehiclePlate)}
          {row("Nomor HP", v.phone)}
          {row("Nomor Identitas", v.idNumber)}
          {row("Masuk", `${formatDateTime(v.checkInAt)} · dicatat ${v.officers[v.checkInById] ?? "-"}`)}
          {row("Keluar", v.checkOutAt ? `${formatDateTime(v.checkOutAt)} · dicatat ${v.checkOutById ? v.officers[v.checkOutById] ?? "-" : "-"}` : null)}
          {row("Catatan", v.notes)}
        </dl>
      </CardBody></Card>
    </>
  );
}
