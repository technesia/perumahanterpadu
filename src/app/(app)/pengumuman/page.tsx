import Link from "next/link";
import { Paperclip } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listAnnouncements } from "@/server/services/community";
import { ANNOUNCEMENT_CATEGORIES } from "@/server/master-data";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { AnnouncementForm } from "@/components/community/forms";
import { formatDateTime } from "@/lib/format";
import { AUDIENCE, PUBLISH_STATUS } from "@/lib/labels";

export const metadata = { title: "Pengumuman" };

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage(["announcements.view", "announcements.manage"]);
  const s = await searchParams;
  const f = { q: sp(s.q), status: sp(s.status), category: sp(s.category), page: parsePage(s.page) };
  const { items, total, manage } = await listAnnouncements(ctx, f);
  const title = ctx.primaryRole === "SECURITY" ? "Pengumuman Keamanan" : "Pengumuman";
  return (
    <>
      <PageHeader title={title} crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: title }]}
        actions={manage && <AnnouncementForm categories={ANNOUNCEMENT_CATEGORIES} />} />
      <Card>
        <FilterBar action="/pengumuman" q={f.q} placeholder="Cari pengumuman" resetHref="/pengumuman">
          <FilterSelect name="category" label="Kategori" value={f.category} options={ANNOUNCEMENT_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          {manage && <FilterSelect name="status" label="Status" value={f.status} options={Object.entries(PUBLISH_STATUS).map(([value, label]) => ({ value, label }))} />}
        </FilterBar>
        {items.length === 0 ? <EmptyState title="Belum ada pengumuman" /> : (
          <ul className="divide-y divide-slate-100">
            {items.map((a) => (
              <li key={a.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  {a.isPriority && <Badge tone="red">Penting</Badge>}
                  <Badge>{a.category}</Badge>
                  {manage && <Badge tone={a.status === "PUBLISHED" ? "green" : a.status === "DRAFT" ? "yellow" : "gray"}>{PUBLISH_STATUS[a.status]}</Badge>}
                  {manage && <Badge tone="blue">{AUDIENCE[a.audience]}</Badge>}
                  {a.attachmentFileId && <Paperclip className="h-4 w-4 text-slate-400" aria-label="Ada lampiran" />}
                </div>
                <Link href={`/pengumuman/${a.id}`} className="mt-1 block font-semibold text-slate-900 hover:text-brand-700">{a.title}</Link>
                <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{a.body}</p>
                <p className="mt-1 text-xs text-slate-400">{a.publishedAt ? formatDateTime(a.publishedAt) : "Belum diterbitkan"}</p>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={f.page} pageSize={15} total={total} baseHref="/pengumuman" params={{ q: f.q, status: f.status, category: f.category }} />
      </Card>
    </>
  );
}
