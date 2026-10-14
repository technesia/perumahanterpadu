import Link from "next/link";
import { CalendarDays, HeartPulse, MapPin, User } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { listPosyandu } from "@/server/services/community";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { PosyanduForm } from "@/components/community/forms";
import { sp } from "@/components/ui/filter-bar";
import { cn } from "@/components/ui/cn";
import { formatDateTime } from "@/lib/format";
import { jakartaTime, toLocalInput } from "@/lib/dates";

export const metadata = { title: "Posyandu" };

export default async function PosyanduPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage(["posyandu.view", "posyandu.manage"]);
  const s = await searchParams;
  const tab = sp(s.tab) === "past" ? "past" : "upcoming";
  const page = parsePage(s.page);
  const { items, total } = await listPosyandu(ctx, tab, page);
  const manage = can(ctx, "posyandu.manage");
  return (
    <>
      <PageHeader title={manage ? "Posyandu" : "Informasi Posyandu"} description="Jadwal dan informasi kegiatan Posyandu. Aplikasi ini tidak menyimpan rekam medis."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Posyandu" }]} actions={manage && <PosyanduForm />} />
      <div className="mb-4 flex gap-2" role="tablist">
        {(["upcoming", "past"] as const).map((t) => (
          <Link key={t} role="tab" aria-selected={tab === t} href={`/posyandu?tab=${t}`}
            className={cn("rounded-lg px-4 py-2 text-sm font-medium", tab === t ? "bg-brand-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>
            {t === "upcoming" ? "Jadwal Mendatang" : "Kegiatan Sebelumnya"}
          </Link>
        ))}
      </div>
      {items.length === 0 ? <Card><EmptyState title={tab === "upcoming" ? "Belum ada jadwal Posyandu" : "Belum ada riwayat"} /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((p) => (
            <Card key={p.id} className="space-y-1.5 p-4 text-sm">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900"><HeartPulse className="h-5 w-5 text-rose-500" />{p.name}</h2>
              <p className="flex items-center gap-1.5 text-slate-600"><CalendarDays className="h-4 w-4" />{formatDateTime(p.startAt)}{p.endAt ? ` – ${jakartaTime(p.endAt)}` : ""}</p>
              <p className="flex items-center gap-1.5 text-slate-600"><MapPin className="h-4 w-4" />{p.location}</p>
              {p.officer && <p className="flex items-center gap-1.5 text-slate-600"><User className="h-4 w-4" />{p.officer}</p>}
              {p.description && <p className="whitespace-pre-line text-slate-700">{p.description}</p>}
              {p.notes && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-2 text-slate-600">{p.notes}</p>}
              {manage && <div className="pt-1"><PosyanduForm initial={{ id: p.id, name: p.name, startAt: toLocalInput(p.startAt), endAt: toLocalInput(p.endAt), location: p.location, officer: p.officer, description: p.description, notes: p.notes }} /></div>}
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={12} total={total} baseHref="/posyandu" params={{ tab }} />
    </>
  );
}
