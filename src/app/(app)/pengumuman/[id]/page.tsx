import { FileText } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { getAnnouncement } from "@/server/services/community";
import { ANNOUNCEMENT_CATEGORIES } from "@/server/master-data";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnnouncementForm } from "@/components/community/forms";
import { formatDateTime } from "@/lib/format";
import { AUDIENCE, PUBLISH_STATUS } from "@/lib/labels";

export const metadata = { title: "Pengumuman" };

export default async function AnnouncementDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["announcements.view", "announcements.manage"]);
  const a = await getAnnouncement(ctx, (await params).id);
  const manage = can(ctx, "announcements.manage");
  return (
    <>
      <PageHeader title={a.title} crumbs={[{ label: "Pengumuman", href: "/pengumuman" }, { label: a.title }]}
        actions={manage && <AnnouncementForm categories={ANNOUNCEMENT_CATEGORIES} initial={{ id: a.id, title: a.title, body: a.body, category: a.category, audience: a.audience, status: a.status, isPriority: a.isPriority }} />} />
      <Card>
        <CardBody>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {a.isPriority && <Badge tone="red">Penting</Badge>}
            <Badge>{a.category}</Badge>
            {manage && <><Badge tone="blue">{AUDIENCE[a.audience]}</Badge><Badge>{PUBLISH_STATUS[a.status]}</Badge></>}
            <span>{a.publishedAt ? `Diterbitkan ${formatDateTime(a.publishedAt)}` : "Belum diterbitkan"}</span>
          </div>
          <div className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{a.body}</div>
          {a.attachment && (
            <div className="mt-5 border-t pt-4">
              {a.attachment.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${a.attachment.id}`} alt="Lampiran pengumuman" className="max-h-[480px] rounded-lg border" />
              ) : <a className="link inline-flex items-center gap-1 text-sm" href={`/api/files/${a.attachment.id}`} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4" />{a.attachment.originalName}</a>}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
