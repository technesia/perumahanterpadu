import Link from "next/link";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { getUnit } from "@/server/services/units";
import { unitBills } from "@/server/services/ipl";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OccupancyBadge, ResidentStatusBadge } from "@/components/domain/status-badges";
import { formatDateOnly, rupiah } from "@/lib/format";
import { MEMBERSHIP_RELATION } from "@/lib/labels";
import { UnitFormButton } from "../unit-form";
import { AddMemberButton, EndMemberButton } from "./members";

export const metadata = { title: "Detail Rumah" };

export default async function UnitDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("units.view");
  const { id } = await params;
  const unit = await getUnit(ctx, id);
  const manage = can(ctx, "units.manage");
  const [residents, bills] = await Promise.all([
    manage ? prisma.resident.findMany({ where: { organizationId: ctx.organizationId, archivedAt: null }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" }, take: 1000 }) : [],
    can(ctx, "ipl.view") ? unitBills(ctx, id) : null,
  ]);
  return (
    <>
      <PageHeader title={`Rumah ${unit.houseNumber}`} description={unit.address}
        crumbs={[{ label: "Data Rumah", href: "/rumah" }, { label: unit.houseNumber }]}
        actions={manage && <UnitFormButton id={id} owners={residents} label="Ubah Data"
          initial={{ houseNumber: unit.houseNumber, block: unit.block ?? "", address: unit.address, occupancyStatus: unit.occupancyStatus, ownerResidentId: unit.ownerResidentId ?? "", notes: unit.notes ?? "", isActive: unit.isActive }} />} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Informasi" />
          <CardBody className="space-y-2 text-sm">
            <p>Status hunian: <OccupancyBadge status={unit.occupancyStatus} /></p>
            <p>Blok: {unit.block ?? "-"}</p>
            <p>Pemilik: {unit.owner ? <Link className="link" href={`/warga/${unit.owner.id}`}>{unit.owner.fullName}</Link> : "-"}</p>
            <p>Status: {unit.isActive ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>}</p>
            {unit.notes && <p className="whitespace-pre-line text-slate-600">{unit.notes}</p>}
            {bills && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Tunggakan IPL</p>
                <p className="font-semibold">{bills.summary.arrearsCount} periode · {rupiah(bills.summary.arrearsAmount)}</p>
                <Link href={`/ipl/tagihan?q=${encodeURIComponent(unit.houseNumber)}`} className="link text-xs">Lihat tagihan</Link>
              </div>
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Penghuni & Histori" action={manage && <AddMemberButton unitId={id} residents={residents} />} />
          <ul className="divide-y divide-slate-100 text-sm">
            {unit.memberships.length === 0 && <li className="px-5 py-4 text-slate-500">Belum ada penghuni tercatat.</li>}
            {unit.memberships.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <Link href={`/warga/${m.resident.id}`} className="link">{m.resident.fullName}</Link>{" "}
                  <span className="text-slate-500">· {MEMBERSHIP_RELATION[m.relation]}</span> <ResidentStatusBadge status={m.resident.status} />
                  <p className="text-xs text-slate-500">{formatDateOnly(m.startDate)} – {m.endDate ? formatDateOnly(m.endDate) : "sekarang"}</p>
                </div>
                {manage && !m.endDate && <EndMemberButton id={m.id} name={m.resident.fullName} />}
                {m.endDate && <Badge>Riwayat</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
