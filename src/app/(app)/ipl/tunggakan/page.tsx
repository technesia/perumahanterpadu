import Link from "next/link";
import { requirePage } from "@/server/auth/session";
import { arrearsByPeriod } from "@/server/services/ipl";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { periodLabel, rupiah } from "@/lib/format";

export const metadata = { title: "Tunggakan" };

export default async function ArrearsPage() {
  const ctx = await requirePage("ipl.view");
  const { window, rows } = await arrearsByPeriod(ctx);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <PageHeader title="Tunggakan per Periode" crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tunggakan" }]}
        description={`Jendela pelacakan ${periodLabel(window.start.year, window.start.month)} – ${periodLabel(window.end.year, window.end.month)} (dapat diatur Super Admin).`} />
      <Card>
        <CardHeader title={`Total tunggakan ${rupiah(total)}`} description="Klik periode untuk melihat rumah yang belum membayar." />
        <DataTable rows={rows} rowKey={(r) => `${r.year}-${r.month}`} mobileTitle={(r) => periodLabel(r.year, r.month)}
          empty={{ title: "Tidak ada tunggakan dalam jendela pelacakan" }}
          columns={[
            { header: "Periode", hideOnMobile: true, cell: (r) => <Link className="link" href={`/ipl/belum-bayar?year=${r.year}&month=${r.month}`}>{periodLabel(r.year, r.month)}</Link> },
            { header: "Tagihan Tertunggak", cell: (r) => r.units },
            { header: "Nominal", cell: (r) => rupiah(r.amount) },
            { header: "Detail", cell: (r) => <Link className="link" href={`/ipl/belum-bayar?year=${r.year}&month=${r.month}`}>Lihat rumah</Link> },
          ]} />
      </Card>
    </>
  );
}
