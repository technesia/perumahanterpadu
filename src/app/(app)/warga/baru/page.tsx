import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { unitOptions } from "@/server/services/units";
import { getOrganization } from "@/server/organization";
import { assignableRoles, ROLE_LABELS } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ResidentForm } from "../resident-form";

export const metadata = { title: "Tambah Warga" };

export default async function NewResidentPage() {
  const ctx = await requirePage("residents.create");
  const [units, org] = await Promise.all([unitOptions(ctx), getOrganization()]);
  return (
    <>
      <PageHeader title="Tambah Warga" crumbs={[{ label: "Data Warga", href: "/warga" }, { label: "Tambah" }]} />
      <Card><CardBody>
        <ResidentForm mode="create" units={units} maxYears={org.deathRecordMaxYears}
          canCreateAccount={can(ctx, "users.manage")} canBackdate={can(ctx, "residents.death_backdate")}
          roles={assignableRoles(ctx.permissions).map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
      </CardBody></Card>
    </>
  );
}
