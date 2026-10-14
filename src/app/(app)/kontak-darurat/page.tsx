import { requirePage } from "@/server/auth/session";
import { emergencyContacts } from "@/server/emergency";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { EmergencyContacts } from "@/components/domain/emergency-contacts";

export const metadata = { title: "Kontak Darurat" };

export default async function EmergencyPage() {
  await requirePage();
  const em = emergencyContacts();
  return (
    <>
      <PageHeader title="Kontak Darurat" description="Di ponsel, tekan Telepon Sekarang untuk langsung menelepon. Di komputer, salin nomornya."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Kontak Darurat" }]} />
      <Card><CardBody><EmergencyContacts contacts={em.contacts} verified={em.verified} /></CardBody></Card>
    </>
  );
}
