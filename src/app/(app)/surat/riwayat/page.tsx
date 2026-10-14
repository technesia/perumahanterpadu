import { requirePage } from "@/server/auth/session";
import { listRequests, listRequestTypes } from "@/server/services/admin-requests";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { RequestList } from "@/components/requests/request-list";
import { ADMIN_REQUEST_STATUS } from "@/lib/labels";

export const metadata = { title: "Riwayat Pengajuan" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function RequestHistoryPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage("administration.view");
  const s = await searchParams;
  const f = { q: sp(s.q), status: sp(s.status), typeId: sp(s.typeId), page: parsePage(s.page) };
  const [{ items, total }, types] = await Promise.all([listRequests(ctx, f), listRequestTypes(ctx, true)]);
  return (
    <>
      <PageHeader title="Riwayat Pengajuan" description={`${total} pengajuan`} crumbs={[{ label: "Pengajuan Surat", href: "/surat" }, { label: "Riwayat" }]} />
      <Card>
        <FilterBar action="/surat/riwayat" q={f.q} placeholder="Nomor, nama pemohon, atau rumah" resetHref="/surat/riwayat">
          <FilterSelect name="status" label="Status" value={f.status} options={Object.entries(ADMIN_REQUEST_STATUS).map(([value, label]) => ({ value, label }))} />
          <FilterSelect name="typeId" label="Jenis" value={f.typeId} options={types.map((t) => ({ value: t.id, label: t.name }))} />
        </FilterBar>
        <RequestList rows={items} base="/surat" staff />
        <Pagination page={f.page} pageSize={20} total={total} baseHref="/surat/riwayat" params={{ q: f.q, status: f.status, typeId: f.typeId }} />
      </Card>
    </>
  );
}
