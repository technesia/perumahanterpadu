import Link from "next/link";
import { requirePage } from "@/server/auth/session";
import { listUsers } from "@/server/services/users";
import { residentOptionsWithoutAccount } from "@/server/services/residents";
import { assignableRoles, ROLE_KEYS, ROLE_LABELS, type RoleKey } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { CreateUserButton, UserRowActions } from "./user-dialogs";

export const metadata = { title: "Akun Pengguna" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage("users.manage");
  const s = await searchParams;
  const f = { q: sp(s.q), role: sp(s.role), page: parsePage(s.page) };
  const [{ items, total }, residents] = await Promise.all([listUsers(ctx, f), residentOptionsWithoutAccount(ctx)]);
  const assignable = assignableRoles(ctx.permissions);
  const roleOpts = assignable.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  // Baris yang boleh dikelola: bukan diri sendiri, dan semua role target dapat diberikan aktor.
  const manageable = (roles: RoleKey[], id: string) => id !== ctx.userId && roles.every((r) => assignable.includes(r));
  return (
    <>
      <PageHeader title="Akun Pengguna" description={`${total} akun`} crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Akun Pengguna" }]}
        actions={<CreateUserButton roles={roleOpts} residents={residents} presetResidentId={sp(s.residentId)} />} />
      <Card>
        <FilterBar action="/pengguna" q={f.q} placeholder="Nama, username, atau email" resetHref="/pengguna">
          <FilterSelect name="role" label="Role" value={f.role} options={ROLE_KEYS.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
        </FilterBar>
        <DataTable rows={items} rowKey={(r) => r.id} mobileTitle={(r) => r.name}
          empty={{ title: "Tidak ada akun" }}
          columns={[
            { header: "Nama", hideOnMobile: true, cell: (r) => r.name },
            { header: "Username", cell: (r) => <span className="font-mono text-xs">{r.username}</span> },
            { header: "Role", cell: (r) => r.roleKeys.map((k) => <Badge key={k} tone={k === "SUPER_ADMIN" ? "gold" : "green"} className="mr-1">{ROLE_LABELS[k]}</Badge>) },
            { header: "Warga", cell: (r) => (r.resident ? <Link href={`/warga/${r.resident.id}`} className="link">{r.resident.code}</Link> : "-") },
            { header: "Status", cell: (r) => (r.isActive ? (r.lockedUntil && r.lockedUntil > new Date() ? <Badge tone="yellow">Terkunci</Badge> : <Badge tone="green">Aktif</Badge>) : <Badge tone="red">Nonaktif</Badge>) },
            { header: "Login Terakhir", cell: (r) => formatDateTime(r.lastLoginAt) },
            { header: "Aksi", cell: (r) => (
              <UserRowActions userId={r.id} username={r.username} active={r.isActive} currentRole={r.roleKeys[0] ?? "MEMBER"}
                roles={roleOpts} canManage={manageable(r.roleKeys, r.id)} />
            ) },
          ]} />
        <Pagination page={f.page} pageSize={20} total={total} baseHref="/pengguna" params={{ q: f.q, role: f.role }} />
      </Card>
    </>
  );
}
