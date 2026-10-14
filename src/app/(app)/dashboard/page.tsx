import { requirePage } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { ROLE_LABELS } from "@/server/rbac/permissions";

export const metadata = { title: "Dashboard" };

// Fondasi (Phase 1). Statistik per role diisi pada Phase 2.
export default async function DashboardPage() {
  const ctx = await requirePage();
  return <PageHeader title={`Selamat datang, ${ctx.name}`} description={`Anda masuk sebagai ${ROLE_LABELS[ctx.primaryRole]}.`} />;
}
