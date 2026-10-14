import { requirePage } from "@/server/auth/session";
import { unitOptions } from "@/server/services/units";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { CheckInForm } from "./checkin-form";

export const metadata = { title: "Catat Tamu Masuk" };

export default async function CheckInPage() {
  const ctx = await requirePage("security.visitors.manage");
  const units = await unitOptions(ctx);
  return (
    <>
      <PageHeader title="Catat Tamu Masuk" crumbs={[{ label: "Buku Tamu", href: "/buku-tamu" }, { label: "Tamu Masuk" }]} />
      <Card><CardBody><CheckInForm units={units} /></CardBody></Card>
    </>
  );
}
