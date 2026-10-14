import { requirePage } from "@/server/auth/session";
import { getRequest } from "@/server/services/admin-requests";
import { PageHeader } from "@/components/ui/page-header";
import { RequestDetail } from "@/components/requests/request-detail";

export const metadata = { title: "Detail Pengajuan" };

export default async function MyRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["administration.submit", "administration.view"]);
  const r = await getRequest(ctx, (await params).id);
  return (
    <>
      <PageHeader title={`Pengajuan ${r.number}`} crumbs={[{ label: "Pengajuan Administrasi", href: "/pengajuan" }, { label: r.number }]} />
      <RequestDetail r={r} />
    </>
  );
}
