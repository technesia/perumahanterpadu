import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { listPayments } from "@/server/services/ipl-payments";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { PAYMENT_STATUS } from "@/lib/labels";
import { PaymentList } from "./payment-list";

export const metadata = { title: "Pembayaran IPL" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function PaymentsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage(["ipl.view", "ipl.payment_submit"]);
  if (!can(ctx, "ipl.view")) redirect("/ipl/pembayaran/baru");
  const s = await searchParams;
  const f = { q: sp(s.q), status: sp(s.status), page: parsePage(s.page) };
  const { items, total } = await listPayments(ctx, f);
  return (
    <>
      <PageHeader title="Pembayaran IPL" description="Pengajuan pembayaran dan verifikasi." crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Pembayaran IPL" }]}
        actions={can(ctx, "ipl.payment_record") && <LinkButton href="/ipl/pembayaran/baru"><Plus className="h-4 w-4" /> Catat Pembayaran</LinkButton>} />
      <Card>
        <FilterBar action="/ipl/pembayaran" q={f.q} placeholder="Nomor, nama warga, atau nomor rumah" resetHref="/ipl/pembayaran">
          <FilterSelect name="status" label="Status" value={f.status} options={Object.entries(PAYMENT_STATUS).map(([value, label]) => ({ value, label }))} />
        </FilterBar>
        <PaymentList rows={items} showResident />
        <Pagination page={f.page} pageSize={20} total={total} baseHref="/ipl/pembayaran" params={{ q: f.q, status: f.status }} />
      </Card>
    </>
  );
}
