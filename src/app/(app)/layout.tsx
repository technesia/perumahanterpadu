import { requirePage } from "@/server/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { ROLE_LABELS } from "@/server/rbac/permissions";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage();
  return (
    <AppShell
      user={{ name: ctx.name, role: ctx.primaryRole, roleLabel: ROLE_LABELS[ctx.primaryRole] }}
      permissions={[...ctx.permissions]}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
