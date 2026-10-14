import { Check, Minus } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { roleMatrix } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ROLE_KEYS } from "@/server/rbac/permissions";

export const metadata = { title: "Role dan Permission" };

export default async function RolesPage() {
  const ctx = await requirePage("roles.view");
  const { roles, permissions } = await roleMatrix(ctx);
  const ordered = ROLE_KEYS.map((k) => roles.find((r) => r.key === k)!).filter(Boolean);
  return (
    <>
      <PageHeader title="Role dan Permission" description="Matriks hak akses yang ditegakkan di backend. Pemberian role dilakukan di menu Akun Pengguna."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Role dan Permission" }]} />
      <Card>
        <div className="overflow-x-auto">
          <table className="table-base min-w-[640px]">
            <thead>
              <tr><th>Permission</th>{ordered.map((r) => <th key={r.id} className="text-center">{r.name}<br /><span className="font-normal normal-case text-slate-400">{r._count.users} akun</span></th>)}</tr>
            </thead>
            <tbody>
              {permissions.map((p) => (
                <tr key={p.id}>
                  <td><span className="font-mono text-xs">{p.key}</span><br /><span className="text-xs text-slate-500">{p.description}</span></td>
                  {ordered.map((r) => {
                    const has = r.permissions.some((x) => x.permissionId === p.id);
                    return <td key={r.id} className="text-center">{has ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Ya" /> : <Minus className="mx-auto h-4 w-4 text-slate-300" aria-label="Tidak" />}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
