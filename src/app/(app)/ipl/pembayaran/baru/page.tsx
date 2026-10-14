import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { prisma } from "@/server/db";
import { getOrganization } from "@/server/organization";
import { getQrisProvider } from "@/server/payments/qris";
import { maxUploadBytes } from "@/server/storage";
import { residentUnits } from "@/server/services/ipl";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { PaymentForm, type ResidentInfo } from "./payment-form";

export const metadata = { title: "Pembayaran IPL" };

export default async function NewPaymentPage() {
  const ctx = await requirePage(["ipl.payment_submit", "ipl.payment_record"]);
  const staff = can(ctx, "ipl.payment_record");
  let self: ResidentInfo | null = null;
  if (!staff && ctx.residentId) {
    const r = await prisma.resident.findUniqueOrThrow({ where: { id: ctx.residentId }, select: { id: true, fullName: true, phone: true, occupancyStatus: true } });
    self = { ...r, units: await residentUnits(ctx.organizationId, ctx.residentId) };
  }
  const org = await getOrganization();
  return (
    <>
      <PageHeader title="Pembayaran IPL" description={staff ? "Catat pembayaran atas nama warga." : "Ajukan pembayaran IPL dan unggah bukti transfer."}
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Pembayaran IPL", href: staff ? "/ipl/pembayaran" : "/riwayat-pembayaran" }, { label: "Ajukan" }]} />
      <Card><CardBody>
        <PaymentForm staff={staff} self={self} qrisEnabled={!!getQrisProvider()} allowPartial={org.allowPartialPayment} maxUploadMb={maxUploadBytes() / 1024 / 1024} />
      </CardBody></Card>
    </>
  );
}
