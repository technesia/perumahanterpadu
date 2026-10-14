import { requirePage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { listRequests, listRequestTypes } from "@/server/services/admin-requests";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { RequestList } from "@/components/requests/request-list";
import { NewRequestForm } from "@/components/requests/request-forms";

export const metadata = { title: "Pengajuan Administrasi" };

export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage("administration.submit");
  const page = parsePage((await searchParams).page);
  const [{ items, total }, types, resident] = await Promise.all([
    listRequests(ctx, { page, own: true }),
    listRequestTypes(ctx),
    ctx.residentId ? prisma.resident.findUnique({ where: { id: ctx.residentId }, select: { phone: true } }) : null,
  ]);
  return (
    <>
      <PageHeader title="Pengajuan Administrasi" description="Ajukan surat keterangan dan pantau statusnya." crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Pengajuan Administrasi" }]} />
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Pengajuan Baru" />
          <CardBody>
            {ctx.residentId ? <NewRequestForm types={types.map((t) => ({ id: t.id, name: t.name }))} phone={resident?.phone ?? ""} />
              : <p className="text-sm text-slate-500">Akun Anda belum terhubung dengan data warga. Hubungi pengurus.</p>}
          </CardBody>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Pengajuan Saya" />
          <RequestList rows={items} base="/pengajuan" staff={false} />
          <Pagination page={page} pageSize={20} total={total} baseHref="/pengajuan" />
        </Card>
      </div>
    </>
  );
}
