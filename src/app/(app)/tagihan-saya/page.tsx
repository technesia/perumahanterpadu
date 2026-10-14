import { HandCoins } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { myBills } from "@/server/services/ipl";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { BillStatusBadge } from "@/components/domain/status-badges";
import { formatDateOnly, periodLabel, rupiah } from "@/lib/format";
import { Clock, Wallet } from "lucide-react";

export const metadata = { title: "Tagihan IPL Saya" };

export default async function MyBillsPage() {
  const ctx = await requirePage("ipl.self_view");
  const { units, items, summary } = await myBills(ctx);
  const rows = [...items].reverse();
  return (
    <>
      <PageHeader title="Tagihan IPL" description={units.length ? `Rumah ${units.map((u) => u.houseNumber).join(", ")}` : undefined}
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tagihan IPL" }]}
        actions={summary.payable.length > 0 && <LinkButton href="/ipl/pembayaran/baru"><HandCoins className="h-4 w-4" /> Bayar IPL</LinkButton>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total Tunggakan" value={rupiah(summary.arrearsAmount)} hint={`${summary.arrearsCount} bulan`} icon={Wallet} tone={summary.arrearsCount ? "red" : "brand"} />
        <StatCard label="Menunggu Verifikasi" value={summary.pendingCount} hint="periode" icon={Clock} tone="blue" />
      </div>
      <Card>
        <CardHeader title="Daftar Tagihan" description="Hanya tagihan rumah Anda yang ditampilkan." />
        <DataTable rows={rows} rowKey={(b) => b.id} mobileTitle={(b) => periodLabel(b.periodYear, b.periodMonth)}
          empty={{ title: ctx.residentId ? "Belum ada tagihan" : "Akun belum terhubung dengan data warga" }}
          columns={[
            { header: "Periode", hideOnMobile: true, cell: (b) => periodLabel(b.periodYear, b.periodMonth) },
            { header: "Rumah", cell: (b) => b.unit.houseNumber },
            { header: "Jenis", cell: (b) => b.typeName },
            { header: "Nominal", cell: (b) => rupiah(b.amount) },
            { header: "Sisa", cell: (b) => rupiah(b.outstanding) },
            { header: "Jatuh Tempo", cell: (b) => formatDateOnly(b.dueDate) },
            { header: "Status", cell: (b) => <BillStatusBadge status={b.displayStatus} /> },
          ]} />
      </Card>
    </>
  );
}
