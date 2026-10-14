import { requirePage } from "@/server/auth/session";
import { getAccessControls } from "@/server/services/access-control";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { AccessToggles } from "./toggles";

export const metadata = { title: "Kontrol Akses" };

export default async function AccessControlPage() {
  const ctx = await requirePage("system.access_control");
  const s = await getAccessControls(ctx);
  return (
    <>
      <PageHeader title="Kontrol Akses" description="Kontrol darurat khusus Super Admin. Setiap perubahan tercatat di Activity Log."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Kontrol Akses" }]} />
      <Card>
        <CardHeader title="Kontrol Darurat" description="Berlaku untuk semua pengguna selain Super Admin." />
        <AccessToggles initial={{ accountsLocked: s.accountsLocked, readOnlyMode: s.readOnlyMode }} affected={s.affected} />
      </Card>
    </>
  );
}
