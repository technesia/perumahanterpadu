import { requirePage } from "@/server/auth/session";
import { INCIDENT_TYPES } from "@/server/master-data";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { IncidentForm } from "../forms";

export const metadata = { title: "Buat Laporan Kejadian" };

export default async function NewIncidentPage() {
  await requirePage("security.incidents.manage");
  return (
    <>
      <PageHeader title="Buat Laporan Kejadian" crumbs={[{ label: "Laporan Kejadian", href: "/kejadian" }, { label: "Baru" }]} />
      <Card><CardBody><IncidentForm types={INCIDENT_TYPES} /></CardBody></Card>
    </>
  );
}
