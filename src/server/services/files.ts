import { prisma } from "../db";
import { can, type AuthContext } from "../auth/context";
import { readStoredFile } from "../storage";

/**
 * Otorisasi akses berkas privat berdasarkan entitas pemiliknya.
 * Mengembalikan null (→ 404) bila tidak berhak, agar keberadaan berkas tidak bocor.
 */
export async function authorizeFile(ctx: AuthContext, fileId: string) {
  const file = await prisma.storedFile.findFirst({
    where: { id: fileId, organizationId: ctx.organizationId },
    include: {
      iplProofs: { select: { payment: { select: { residentId: true, submittedById: true } } } },
      requestDocs: { select: { request: { select: { requesterUserId: true, residentId: true } } } },
      incidentDocs: { select: { incident: { select: { reporterId: true } } } },
    },
  });
  if (!file) return null;
  const ok =
    file.iplProofs.some((p) => can(ctx, "ipl.view") || p.payment.submittedById === ctx.userId || (ctx.residentId && p.payment.residentId === ctx.residentId)) ||
    file.requestDocs.some((d) => can(ctx, "administration.view") || d.request.requesterUserId === ctx.userId) ||
    file.incidentDocs.some((d) => can(ctx, "security.incidents.review") || d.incident.reporterId === ctx.userId) ||
    (await financeOrPublicFile(ctx, file.id));
  if (!ok) return null;
  return readStoredFile(file.id, ctx.organizationId);
}

/** Lampiran keuangan (nota) & lampiran publik (pengumuman, poster, logo UMKM, foto fasilitas). */
async function financeOrPublicFile(ctx: AuthContext, fileId: string) {
  const org = ctx.organizationId;
  const [fin, ann, act, biz, fac] = await Promise.all([
    prisma.financeTransaction.count({ where: { organizationId: org, attachmentFileId: fileId } }),
    prisma.announcement.findFirst({ where: { organizationId: org, attachmentFileId: fileId }, select: { status: true, audience: true } }),
    prisma.activity.count({ where: { organizationId: org, attachmentFileId: fileId } }),
    prisma.residentBusiness.findFirst({ where: { organizationId: org, logoFileId: fileId }, select: { status: true } }),
    prisma.facility.count({ where: { organizationId: org, photoFileId: fileId } }),
  ]);
  if (fin) return can(ctx, "finance.view");
  if (ann) return can(ctx, "announcements.manage") || (ann.status === "PUBLISHED" && ann.audience !== "INTERNAL");
  if (biz) return can(ctx, "businesses.manage") || biz.status === "PUBLISHED";
  return act > 0 || fac > 0;
}
