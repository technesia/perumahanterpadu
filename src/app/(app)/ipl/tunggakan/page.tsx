import Link from "next/link";
import { requirePage } from "@/server/auth/session";
import { arrearsByPeriod } from "@/server/services/ipl";
import { openingSummary } from "@/server/services/ipl-opening";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { periodLabel, rupiah } from "@/lib/format";

export const metadata = { title: "Tunggakan" };

export default async function ArrearsPage() {
  const ctx = await requirePage("ipl.view");
  const [{ window, rows }, opening] = await Promise.all([arrearsByPeriod(ctx), openingSummary(ctx)]);
  const href = (r: { year: number; month: number }) => r.year === 0
    ? "/ipl/tunggakan-awal?kind=OPENING_LUMP&status=OPEN" : `/ipl/belum-bayar?year=${r.year}&month=${r.month}`;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <PageHeader title="Tunggakan per Periode" crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tunggakan" }]}
        description={`Jendela pelacakan ${periodLabel(window.start.year, window.start.month)} – ${periodLabel(window.end.year, window.end.month)} (dapat diatur Super Admin). Tunggakan awal selalu dihitung berapa pun umurnya.`} />
      <Card>
        <CardHeader title={`Total tunggakan ${rupiah(total)}`}
          description={<>Klik periode untuk melihat rumah yang belum membayar. Sisa piutang tunggakan awal: {rupiah(opening.remaining)} (tunggakan awal {rupiah(opening.openingTotal)}, sudah dibayar {rupiah(opening.paidViaApp)}) — <Link className="link" href="/ipl/tunggakan-awal">rincian tunggakan awal</Link>.</>} />
        <DataTable rows={rows} rowKey={(r) => `${r.year}-${r.month}`} mobileTitle={(r) => periodLabel(r.year, r.month)}
          empty={{ title: "Tidak ada tunggakan dalam jendela pelacakan" }}
          columns={[
            { header: "Periode", hideOnMobile: true, cell: (r) => <Link className="link" href={href(r)}>{periodLabel(r.year, r.month)}</Link> },
            { header: "Tagihan Tertunggak", cell: (r) => r.units },
            { header: "Nominal", cell: (r) => rupiah(r.amount) },
            { header: "Detail", cell: (r) => <Link className="link" href={href(r)}>Lihat rumah</Link> },
          ]} />
      </Card>
    </>
  );
}
