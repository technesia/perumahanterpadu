import { requirePage } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  const ctx = await requirePage("settings.manage");
  const org = await getSettings(ctx);
  return (
    <>
      <PageHeader title="Pengaturan" description={`${org.name} — RT ${org.rt} RW ${org.rw}, ${org.village}, ${org.regency}`}
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Pengaturan" }]} />
      <Card>
        <CardHeader title="Kebijakan Operasional" description="Hanya Super Admin. Setiap perubahan tercatat di Activity Log." />
        <CardBody><SettingsForm initial={org} /></CardBody>
      </Card>
    </>
  );
}
