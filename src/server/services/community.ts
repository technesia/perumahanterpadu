import { z } from "zod";
import type { ActivityStatus, AnnouncementAudience, Prisma, PublishStatus } from "@prisma/client";
import { prisma } from "../db";
import { assertCan, assertCanAny, can, type AuthContext } from "../auth/context";
import { AppError, NotFoundError } from "../errors";
import { writeAudit } from "../audit";
import { storeFile, type UploadInput } from "../storage";
import { optionalText, pageParams, requiredText } from "../validation";
import { jakartaDateTime } from "@/lib/dates";
import { ACTIVITY_CATEGORIES, ANNOUNCEMENT_CATEGORIES } from "../master-data";

const dateTimeLocal = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, `${label} tidak valid.`);
const optionalDateTimeLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Waktu tidak valid.").or(z.literal("")).optional().transform((v) => v || null);
const fromLocal = (v: string) => jakartaDateTime(v.slice(0, 10), v.slice(11, 16));

// ───────────────────────── Pengumuman ─────────────────────────

export const announcementSchema = z.object({
  title: requiredText("Judul", 200),
  body: requiredText("Isi pengumuman", 20000),
  category: z.enum(ANNOUNCEMENT_CATEGORIES, { errorMap: () => ({ message: "Kategori wajib dipilih." }) }),
  audience: z.enum(["ALL", "RESIDENTS", "SECURITY", "INTERNAL"]),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  isPriority: z.boolean().default(false),
});

/** Audiens yang boleh dilihat role non-pengurus. */
function visibleAudiences(ctx: AuthContext): AnnouncementAudience[] {
  if (can(ctx, "announcements.manage")) return ["ALL", "RESIDENTS", "SECURITY", "INTERNAL"];
  const out: AnnouncementAudience[] = ["ALL"];
  if (ctx.roles.includes("MEMBER")) out.push("RESIDENTS");
  if (ctx.roles.includes("SECURITY")) out.push("SECURITY");
  return out;
}

export async function saveAnnouncement(ctx: AuthContext, id: string | null, input: z.input<typeof announcementSchema>, attachment: UploadInput | null) {
  assertCan(ctx, "announcements.manage");
  const data = announcementSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = id ? await tx.announcement.findFirst({ where: { id, organizationId: ctx.organizationId } }) : null;
    if (id && !existing) throw new NotFoundError("Pengumuman tidak ditemukan.");
    const file = attachment ? await storeFile(tx, ctx.organizationId, attachment, "announcement", ctx.userId) : null;
    const publishedAt = data.status === "PUBLISHED" ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null;
    const payload = { ...data, publishedAt, updatedById: ctx.userId, ...(file ? { attachmentFileId: file.id } : {}) };
    const row = existing
      ? await tx.announcement.update({ where: { id: existing.id }, data: payload })
      : await tx.announcement.create({ data: { ...payload, organizationId: ctx.organizationId, createdById: ctx.userId } });
    await writeAudit(ctx, {
      action: existing ? "ANNOUNCEMENT_UPDATED" : "ANNOUNCEMENT_CREATED", module: "announcements", entityType: "Announcement", entityId: row.id,
      summary: `${existing ? "Mengubah" : "Membuat"} pengumuman "${row.title}" (${row.status})`,
    }, tx);
    return row;
  });
}

export async function listAnnouncements(ctx: AuthContext, f: { q?: string; status?: string; category?: string; page: number }, pageSize = 15) {
  assertCanAny(ctx, ["announcements.view", "announcements.manage"]);
  const manage = can(ctx, "announcements.manage");
  const where: Prisma.AnnouncementWhereInput = { organizationId: ctx.organizationId, audience: { in: visibleAudiences(ctx) } };
  if (!manage) where.status = "PUBLISHED";
  else if (f.status && ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(f.status)) where.status = f.status as PublishStatus;
  if (f.category) where.category = f.category;
  if (f.q) where.OR = [{ title: { contains: f.q.slice(0, 80), mode: "insensitive" } }, { body: { contains: f.q.slice(0, 80), mode: "insensitive" } }];
  const [items, total] = await Promise.all([
    prisma.announcement.findMany({ where, orderBy: [{ isPriority: "desc" }, { publishedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], ...pageParams(f.page, pageSize) }),
    prisma.announcement.count({ where }),
  ]);
  return { items, total, manage };
}

export async function getAnnouncement(ctx: AuthContext, id: string) {
  assertCanAny(ctx, ["announcements.view", "announcements.manage"]);
  const a = await prisma.announcement.findFirst({
    where: { id, organizationId: ctx.organizationId, audience: { in: visibleAudiences(ctx) }, ...(can(ctx, "announcements.manage") ? {} : { status: "PUBLISHED" }) },
  });
  if (!a) throw new NotFoundError("Pengumuman tidak ditemukan.");
  const file = a.attachmentFileId ? await prisma.storedFile.findUnique({ where: { id: a.attachmentFileId }, select: { id: true, originalName: true, mimeType: true } }) : null;
  return { ...a, attachment: file };
}

// ───────────────────────── Kegiatan ─────────────────────────

export const activitySchema = z.object({
  name: requiredText("Nama kegiatan", 150),
  description: optionalText(5000),
  category: z.enum(ACTIVITY_CATEGORIES, { errorMap: () => ({ message: "Kategori wajib dipilih." }) }),
  startAt: dateTimeLocal("Waktu mulai"),
  endAt: optionalDateTimeLocal,
  location: requiredText("Lokasi", 200),
  personInCharge: optionalText(120),
  status: z.enum(["PLANNED", "ONGOING", "DONE", "CANCELLED"]),
});

export async function saveActivity(ctx: AuthContext, id: string | null, input: z.input<typeof activitySchema>, poster: UploadInput | null) {
  assertCan(ctx, "activities.manage");
  const data = activitySchema.parse(input);
  const startAt = fromLocal(data.startAt);
  const endAt = data.endAt ? fromLocal(data.endAt) : null;
  if (endAt && endAt <= startAt) throw new AppError("Waktu selesai harus setelah waktu mulai.", "VALIDATION", { endAt: "Harus setelah waktu mulai." });
  return prisma.$transaction(async (tx) => {
    if (id && !(await tx.activity.findFirst({ where: { id, organizationId: ctx.organizationId } }))) throw new NotFoundError("Kegiatan tidak ditemukan.");
    const file = poster ? await storeFile(tx, ctx.organizationId, poster, "activity", ctx.userId) : null;
    const payload = { ...data, startAt, endAt, updatedById: ctx.userId, ...(file ? { attachmentFileId: file.id } : {}) };
    const row = id
      ? await tx.activity.update({ where: { id }, data: payload })
      : await tx.activity.create({ data: { ...payload, organizationId: ctx.organizationId, createdById: ctx.userId } });
    await writeAudit(ctx, { action: id ? "ACTIVITY_UPDATED" : "ACTIVITY_CREATED", module: "activities", entityType: "Activity", entityId: row.id, summary: `${id ? "Mengubah" : "Menambah"} kegiatan ${row.name}` }, tx);
    return row;
  });
}

export async function listActivities(ctx: AuthContext, when: "upcoming" | "past", page: number, pageSize = 12) {
  assertCanAny(ctx, ["activities.view", "activities.manage"]);
  const now = new Date();
  const where: Prisma.ActivityWhereInput = when === "upcoming"
    ? { organizationId: ctx.organizationId, status: { in: ["PLANNED", "ONGOING"] as ActivityStatus[] }, OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: new Date(now.getTime() - 12 * 3600_000) } }] }
    : { organizationId: ctx.organizationId, NOT: { status: { in: ["PLANNED", "ONGOING"] as ActivityStatus[] }, OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: new Date(now.getTime() - 12 * 3600_000) } }] } };
  const [items, total] = await Promise.all([
    prisma.activity.findMany({ where, orderBy: { startAt: when === "upcoming" ? "asc" : "desc" }, ...pageParams(page, pageSize) }),
    prisma.activity.count({ where }),
  ]);
  return { items, total };
}

// ───────────────────────── UMKM ─────────────────────────

export const businessSchema = z.object({
  name: requiredText("Nama usaha", 120),
  ownerResidentId: z.string().max(40).optional().transform((v) => v || null),
  ownerName: requiredText("Nama pemilik", 120),
  category: requiredText("Kategori", 60),
  description: optionalText(2000),
  contact: optionalText(60),
  address: optionalText(200),
  showAddress: z.boolean().default(false),
  ownerConsent: z.boolean().default(false),
  openingHours: optionalText(120),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});

export async function saveBusiness(ctx: AuthContext, id: string | null, input: z.input<typeof businessSchema>, logo: UploadInput | null) {
  assertCan(ctx, "businesses.manage");
  const data = businessSchema.parse(input);
  if (data.status === "PUBLISHED" && !data.ownerConsent) {
    throw new AppError("Listing hanya dapat diterbitkan setelah pemilik menyetujui publikasi data usahanya.", "VALIDATION", { ownerConsent: "Persetujuan pemilik wajib." });
  }
  if (data.ownerResidentId && !(await prisma.resident.findFirst({ where: { id: data.ownerResidentId, organizationId: ctx.organizationId } }))) {
    throw new AppError("Pemilik tidak valid.", "VALIDATION", { ownerResidentId: "Warga tidak ditemukan." });
  }
  return prisma.$transaction(async (tx) => {
    if (id && !(await tx.residentBusiness.findFirst({ where: { id, organizationId: ctx.organizationId } }))) throw new NotFoundError("Usaha tidak ditemukan.");
    const file = logo ? await storeFile(tx, ctx.organizationId, logo, "business", ctx.userId) : null;
    if (file && !file.mimeType.startsWith("image/")) throw new AppError("Logo harus JPG atau PNG.", "VALIDATION", { logo: "Harus gambar." });
    const payload = { ...data, ...(file ? { logoFileId: file.id } : {}) };
    const row = id
      ? await tx.residentBusiness.update({ where: { id }, data: payload })
      : await tx.residentBusiness.create({ data: { ...payload, organizationId: ctx.organizationId, createdById: ctx.userId } });
    await writeAudit(ctx, { action: id ? "BUSINESS_UPDATED" : "BUSINESS_CREATED", module: "businesses", entityType: "ResidentBusiness", entityId: row.id, summary: `${id ? "Mengubah" : "Menambah"} UMKM ${row.name} (${row.status})` }, tx);
    return row;
  });
}

export async function listBusinesses(ctx: AuthContext, f: { q?: string; category?: string; status?: string; page: number }, pageSize = 18) {
  assertCanAny(ctx, ["businesses.view", "businesses.manage"]);
  const manage = can(ctx, "businesses.manage");
  const where: Prisma.ResidentBusinessWhereInput = { organizationId: ctx.organizationId };
  if (!manage) where.status = "PUBLISHED";
  else if (f.status && ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(f.status)) where.status = f.status as PublishStatus;
  if (f.category) where.category = f.category;
  if (f.q) where.OR = [{ name: { contains: f.q.slice(0, 60), mode: "insensitive" } }, { description: { contains: f.q.slice(0, 60), mode: "insensitive" } }, { category: { contains: f.q.slice(0, 60), mode: "insensitive" } }];
  const [rows, total, cats] = await Promise.all([
    prisma.residentBusiness.findMany({ where, orderBy: { name: "asc" }, ...pageParams(f.page, pageSize) }),
    prisma.residentBusiness.count({ where }),
    prisma.residentBusiness.findMany({ where: { organizationId: ctx.organizationId, ...(manage ? {} : { status: "PUBLISHED" }) }, distinct: ["category"], select: { category: true } }),
  ]);
  // Alamat hanya dikirim bila pemilik mengizinkan (atau pengurus).
  const items = rows.map((r) => ({ ...r, address: manage || r.showAddress ? r.address : null }));
  return { items, total, manage, categories: cats.map((c) => c.category).sort() };
}

// ───────────────────────── Posyandu ─────────────────────────

export const posyanduSchema = z.object({
  name: requiredText("Nama kegiatan", 150),
  startAt: dateTimeLocal("Waktu mulai"),
  endAt: optionalDateTimeLocal,
  location: requiredText("Lokasi", 200),
  officer: optionalText(120),
  description: optionalText(3000),
  notes: optionalText(3000),
});

export async function savePosyandu(ctx: AuthContext, id: string | null, input: z.input<typeof posyanduSchema>) {
  assertCan(ctx, "posyandu.manage");
  const data = posyanduSchema.parse(input);
  const startAt = fromLocal(data.startAt);
  const endAt = data.endAt ? fromLocal(data.endAt) : null;
  if (endAt && endAt <= startAt) throw new AppError("Waktu selesai harus setelah waktu mulai.", "VALIDATION", { endAt: "Harus setelah waktu mulai." });
  return prisma.$transaction(async (tx) => {
    if (id && !(await tx.posyanduActivity.findFirst({ where: { id, organizationId: ctx.organizationId } }))) throw new NotFoundError("Jadwal tidak ditemukan.");
    const payload = { ...data, startAt, endAt };
    const row = id
      ? await tx.posyanduActivity.update({ where: { id }, data: payload })
      : await tx.posyanduActivity.create({ data: { ...payload, organizationId: ctx.organizationId, createdById: ctx.userId } });
    await writeAudit(ctx, { action: id ? "POSYANDU_UPDATED" : "POSYANDU_CREATED", module: "posyandu", entityType: "PosyanduActivity", entityId: row.id, summary: `${id ? "Mengubah" : "Menambah"} jadwal Posyandu ${row.name}` }, tx);
    return row;
  });
}

export async function listPosyandu(ctx: AuthContext, when: "upcoming" | "past", page: number, pageSize = 12) {
  assertCanAny(ctx, ["posyandu.view", "posyandu.manage"]);
  const cutoff = new Date(Date.now() - 6 * 3600_000);
  const where: Prisma.PosyanduActivityWhereInput = { organizationId: ctx.organizationId, startAt: when === "upcoming" ? { gte: cutoff } : { lt: cutoff } };
  const [items, total] = await Promise.all([
    prisma.posyanduActivity.findMany({ where, orderBy: { startAt: when === "upcoming" ? "asc" : "desc" }, ...pageParams(page, pageSize) }),
    prisma.posyanduActivity.count({ where }),
  ]);
  return { items, total };
}
