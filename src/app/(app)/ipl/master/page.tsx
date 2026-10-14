import { requirePage } from "@/server/auth/session";
import { listIplTypes } from "@/server/services/ipl";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { rupiah } from "@/lib/format";
import { IplTypeButton } from "./type-form";

export const metadata = { title: "Master IPL" };

export default async function IplMasterPage() {
  const ctx = await requirePage("ipl.manage");
  const types = await listIplTypes(ctx);
  return (
    <>
      <PageHeader title="Master IPL" description="Jenis iuran, nominal, dan tanggal jatuh tempo." crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Master IPL" }]}
        actions={<IplTypeButton />} />
      <Card>
        <DataTable rows={types} rowKey={(t) => t.id} mobileTitle={(t) => t.name}
          empty={{ title: "Belum ada jenis iuran", description: "Tambahkan jenis iuran (mis. IPL Bulanan, Kebersihan, Keamanan) sebelum menerbitkan tagihan.", action: <IplTypeButton /> }}
          columns={[
            { header: "Nama", hideOnMobile: true, cell: (t) => <span className="font-medium">{t.name}</span> },
            { header: "Nominal", cell: (t) => rupiah(t.amount) },
            { header: "Periode", cell: () => "Bulanan" },
            { header: "Jatuh Tempo", cell: (t) => `Tanggal ${t.dueDay}` },
            { header: "Status", cell: (t) => (t.isActive ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>) },
            { header: "Keterangan", cell: (t) => t.description ?? "-" },
            { header: "Aksi", cell: (t) => <IplTypeButton id={t.id} initial={{ name: t.name, amount: t.amount, dueDay: t.dueDay, isActive: t.isActive, description: t.description ?? "" }} /> },
          ]} />
      </Card>
    </>
  );
}
