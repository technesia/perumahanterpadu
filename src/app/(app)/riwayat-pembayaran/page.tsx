import { Plus } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listPayments } from "@/server/services/ipl-payments";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { PaymentList } from "../ipl/pembayaran/payment-list";

export const metadata = { title: "Riwayat Pembayaran" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function MyPaymentsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage("ipl.self_view");
  const page = parsePage((await searchParams).page);
  const { items, total } = await listPayments(ctx, { page, ownOnly: true });
  return (
    <>
      <PageHeader title="Riwayat Pembayaran" crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Riwayat Pembayaran" }]}
        actions={ctx.permissions.has("ipl.payment_submit") && <LinkButton href="/ipl/pembayaran/baru"><Plus className="h-4 w-4" /> Ajukan Pembayaran</LinkButton>} />
      <Card>
        <PaymentList rows={items} showResident={false} />
        <Pagination page={page} pageSize={20} total={total} baseHref="/riwayat-pembayaran" />
      </Card>
    </>
  );
}
