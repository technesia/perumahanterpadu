import Link from "next/link";
import { CalendarDays, MapPin, User } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { listActivities } from "@/server/services/community";
import { ACTIVITY_CATEGORIES } from "@/server/master-data";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { ActivityForm } from "@/components/community/forms";
import { sp } from "@/components/ui/filter-bar";
import { formatDateTime } from "@/lib/format";
import { jakartaTime, toLocalInput } from "@/lib/dates";
import { ACTIVITY_STATUS } from "@/lib/labels";
import { cn } from "@/components/ui/cn";

export const metadata = { title: "Kegiatan" };

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage(["activities.view", "activities.manage"]);
  const s = await searchParams;
  const tab = sp(s.tab) === "past" ? "past" : "upcoming";
  const page = parsePage(s.page);
  const { items, total } = await listActivities(ctx, tab, page);
  const manage = can(ctx, "activities.manage");
  return (
    <>
      <PageHeader title="Kegiatan Lingkungan" crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Kegiatan" }]}
        actions={manage && <ActivityForm categories={ACTIVITY_CATEGORIES} />} />
      <div className="mb-4 flex gap-2" role="tablist">
        {(["upcoming", "past"] as const).map((t) => (
          <Link key={t} role="tab" aria-selected={tab === t} href={`/kegiatan?tab=${t}`}
            className={cn("rounded-lg px-4 py-2 text-sm font-medium", tab === t ? "bg-brand-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>
            {t === "upcoming" ? "Agenda Mendatang" : "Riwayat Kegiatan"}
          </Link>
        ))}
      </div>
      {items.length === 0 ? <Card><EmptyState title={tab === "upcoming" ? "Belum ada agenda mendatang" : "Belum ada riwayat kegiatan"} /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => (
            <Card key={a.id} className="flex flex-col overflow-hidden">
              {a.attachmentFileId && (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={`/api/files/${a.attachmentFileId}`} target="_blank" rel="noopener noreferrer"><img src={`/api/files/${a.attachmentFileId}`} alt={`Poster ${a.name}`} loading="lazy" className="h-40 w-full bg-slate-100 object-cover" /></a>
              )}
              <div className="flex flex-1 flex-col gap-1.5 p-4 text-sm">
                <div className="flex flex-wrap gap-1.5"><Badge>{a.category}</Badge><Badge tone={a.status === "DONE" ? "green" : a.status === "CANCELLED" ? "red" : "blue"}>{ACTIVITY_STATUS[a.status]}</Badge></div>
                <h2 className="font-semibold text-slate-900">{a.name}</h2>
                <p className="flex items-center gap-1.5 text-slate-600"><CalendarDays className="h-4 w-4 shrink-0" />{formatDateTime(a.startAt)}{a.endAt ? ` – ${jakartaTime(a.endAt)}` : ""}</p>
                <p className="flex items-center gap-1.5 text-slate-600"><MapPin className="h-4 w-4 shrink-0" />{a.location}</p>
                {a.personInCharge && <p className="flex items-center gap-1.5 text-slate-600"><User className="h-4 w-4 shrink-0" />{a.personInCharge}</p>}
                {a.description && <p className="whitespace-pre-line text-slate-600">{a.description}</p>}
                {manage && <div className="mt-auto pt-2"><ActivityForm categories={ACTIVITY_CATEGORIES} initial={{ id: a.id, name: a.name, description: a.description, category: a.category, startAt: toLocalInput(a.startAt), endAt: toLocalInput(a.endAt), location: a.location, personInCharge: a.personInCharge, status: a.status }} /></div>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={12} total={total} baseHref="/kegiatan" params={{ tab }} />
    </>
  );
}
