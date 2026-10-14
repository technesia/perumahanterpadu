import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { listRequests, listRequestTypes } from "@/server/services/admin-requests";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { RequestList } from "@/components/requests/request-list";
import { RequestTypesButton } from "@/components/requests/request-forms";

export const metadata = { title: "Pengajuan Surat" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function RequestsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage("administration.view");
  const s = await searchParams;
  const f = { q: sp(s.q), typeId: sp(s.typeId), page: parsePage(s.page), active: true };
  const [{ items, total }, types] = await Promise.all([listRequests(ctx, f), listRequestTypes(ctx, true)]);
  return (
    <>
      <PageHeader title="Pengajuan Surat" description={`${total} pengajuan menunggu tindak lanjut (terlama di atas)`}
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Pengajuan Surat" }]}
        actions={can(ctx, "administration.process") && <RequestTypesButton types={types} />} />
      <Card>
        <FilterBar action="/surat" q={f.q} placeholder="Nomor, nama pemohon, atau rumah" resetHref="/surat">
          <FilterSelect name="typeId" label="Jenis" value={f.typeId} options={types.map((t) => ({ value: t.id, label: t.name }))} />
        </FilterBar>
        <RequestList rows={items} base="/surat" staff />
        <Pagination page={f.page} pageSize={20} total={total} baseHref="/surat" params={{ q: f.q, typeId: f.typeId }} />
      </Card>
    </>
  );
}
