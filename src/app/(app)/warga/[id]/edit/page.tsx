import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { getResident } from "@/server/services/residents";
import { getOrganization } from "@/server/organization";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { toIsoDate } from "@/lib/dates";
import { ResidentForm } from "../../resident-form";

export const metadata = { title: "Ubah Warga" };

export default async function EditResidentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("residents.update");
  const { id } = await params;
  const [r, org] = await Promise.all([getResident(ctx, id), getOrganization()]);
  return (
    <>
      <PageHeader title={`Ubah Data: ${r.fullName}`} crumbs={[{ label: "Data Warga", href: "/warga" }, { label: r.fullName, href: `/warga/${id}` }, { label: "Ubah" }]} />
      <Card><CardBody>
        <ResidentForm mode="edit" id={id} units={[]} roles={[]} canCreateAccount={false}
          canBackdate={can(ctx, "residents.death_backdate")} maxYears={org.deathRecordMaxYears}
          initial={{
            fullName: r.fullName, nik: "", phone: r.phone ?? "", email: r.email ?? "", status: r.status, occupancyStatus: r.occupancyStatus,
            moveInDate: r.moveInDate ? toIsoDate(r.moveInDate) : "", deathDate: r.deathDate ? toIsoDate(r.deathDate) : "",
            internalNotes: r.internalNotes ?? "",
          }} />
      </CardBody></Card>
    </>
  );
}
