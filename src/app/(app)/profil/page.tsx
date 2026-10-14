import { requirePage } from "@/server/auth/session";
import { getProfile } from "@/server/services/profile";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/server/rbac/permissions";
import { MEMBERSHIP_RELATION, OCCUPANCY_STATUS, RESIDENT_STATUS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Profil Saya" };

export default async function ProfilePage() {
  const ctx = await requirePage();
  const p = await getProfile(ctx);
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm"><dt className="text-slate-500">{k}</dt><dd className="col-span-2 font-medium text-slate-800">{v || "-"}</dd></div>
  );
  return (
    <>
      <PageHeader title="Profil Saya" crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Profil Saya" }]} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Akun" />
          <CardBody>
            <dl className="divide-y divide-slate-100">
              {row("Nama", p.name)}
              {row("Username", p.username)}
              {row("Email", p.email)}
              {row("Role", ctx.roles.map((r) => <Badge key={r} tone="green" className="mr-1">{ROLE_LABELS[r]}</Badge>))}
              {row("Login terakhir", formatDateTime(p.lastLoginAt))}
            </dl>
          </CardBody>
        </Card>
        {p.resident && (
          <Card>
            <CardHeader title="Data Warga" description="Perubahan data warga dilakukan oleh pengurus." />
            <CardBody>
              <dl className="divide-y divide-slate-100">
                {row("ID Warga", p.resident.code)}
                {row("Nama Lengkap", p.resident.fullName)}
                {row("Nomor HP", p.resident.phone)}
                {row("Status Warga", RESIDENT_STATUS[p.resident.status])}
                {row("Status Hunian", OCCUPANCY_STATUS[p.resident.occupancyStatus])}
                {row("Rumah", p.resident.memberships.map((m, i) => (
                  <div key={i}>{m.unit.houseNumber} — {m.unit.address} <span className="text-slate-500">({MEMBERSHIP_RELATION[m.relation]})</span></div>
                )))}
              </dl>
            </CardBody>
          </Card>
        )}
        <Card className="lg:col-span-2">
          <CardHeader title="Ganti Password" />
          <CardBody><PasswordForm /></CardBody>
        </Card>
      </div>
    </>
  );
}
