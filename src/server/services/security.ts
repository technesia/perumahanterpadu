import { z } from "zod";
import type { CameraStatus, IncidentStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { assertCan, assertCanAny, can, type AuthContext } from "../auth/context";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { writeAudit } from "../audit";
import { nextNumber } from "../counters";
import { storeFile, type UploadInput } from "../storage";
import { encryptField, decryptField } from "../crypto";
import { optionalText, pageParams, phoneSchema, requiredText } from "../validation";
import { notifyPermissionHolders, notifyUser } from "./notifications";
import { dateOnly, jakartaDateTime } from "@/lib/dates";
import { INCIDENT_TYPES } from "../master-data";
import { INCIDENT_STATUS } from "@/lib/labels";

// ───────────────────────── Buku tamu ─────────────────────────

export const checkInSchema = z.object({
  visitorName: requiredText("Nama tamu", 120),
  idNumber: z.string().trim().max(30).regex(/^[0-9A-Za-z-]*$/, "Nomor identitas tidak valid.").optional().transform((v) => v || null),
  phone: phoneSchema,
  purpose: requiredText("Tujuan kunjungan", 200),
  unitId: z.string().max(40).optional().transform((v) => v || null),
  hostName: optionalText(120),
  vehiclePlate: z.string().trim().max(15).optional().transform((v) => (v ? v.toUpperCase() : null)),
  notes: optionalText(500),
});

export async function checkIn(ctx: AuthContext, input: z.input<typeof checkInSchema>) {
  assertCan(ctx, "security.visitors.manage");
  const data = checkInSchema.parse(input);
  if (!data.unitId && !data.hostName) throw new AppError("Isi rumah yang dituju atau nama penghuni yang dikunjungi.", "VALIDATION", { unitId: "Rumah atau penghuni wajib diisi." });
  const unit = data.unitId ? await prisma.residentialUnit.findFirst({ where: { id: data.unitId, organizationId: ctx.organizationId } }) : null;
  if (data.unitId && !unit) throw new AppError("Rumah tidak ditemukan.", "VALIDATION", { unitId: "Tidak valid." });
  return prisma.$transaction(async (tx) => {
    const v = await tx.visitorLog.create({
      data: {
        organizationId: ctx.organizationId, number: await nextNumber(tx, ctx.organizationId, "TMU"),
        visitorName: data.visitorName, idNumber: encryptField(data.idNumber), phone: data.phone, purpose: data.purpose,
        unitId: data.unitId, hostName: data.hostName, vehiclePlate: data.vehiclePlate, notes: data.notes, checkInById: ctx.userId,
      },
    });
    await writeAudit(ctx, { action: "VISITOR_CHECK_IN", module: "security", entityType: "VisitorLog", entityId: v.id, summary: `Tamu masuk: ${v.visitorName} → ${unit?.houseNumber ?? data.hostName}` }, tx);
    return v;
  });
}

export async function checkOut(ctx: AuthContext, id: string) {
  assertCan(ctx, "security.visitors.manage");
  return prisma.$transaction(async (tx) => {
    const v = await tx.visitorLog.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!v) throw new NotFoundError("Data kunjungan tidak ditemukan.");
    // Update bersyarat: mencegah check-out ganda dari dua petugas bersamaan.
    const r = await tx.visitorLog.updateMany({ where: { id, checkOutAt: null }, data: { checkOutAt: new Date(), checkOutById: ctx.userId } });
    if (r.count === 0) throw new ConflictError("Tamu sudah tercatat keluar.");
    await writeAudit(ctx, { action: "VISITOR_CHECK_OUT", module: "security", entityType: "VisitorLog", entityId: id, summary: `Tamu keluar: ${v.visitorName}` }, tx);
  });
}

export interface VisitorFilter { q?: string; status?: string; date?: string; page: number }

export async function listVisitors(ctx: AuthContext, f: VisitorFilter, pageSize = 25) {
  assertCanAny(ctx, ["security.visitors.view", "security.visitors.manage"]);
  const where: Prisma.VisitorLogWhereInput = { organizationId: ctx.organizationId };
  if (f.status === "inside") where.checkOutAt = null;
  if (f.status === "out") where.checkOutAt = { not: null };
  if (f.date) {
    try {
      dateOnly(f.date);
      const from = jakartaDateTime(f.date, "00:00");
      where.checkInAt = { gte: from, lt: new Date(from.getTime() + 86_400_000) };
    } catch { /* abaikan tanggal tidak valid */ }
  }
  if (f.q) {
    const q = f.q.trim().slice(0, 60);
    where.OR = [
      { visitorName: { contains: q, mode: "insensitive" } },
      { hostName: { contains: q, mode: "insensitive" } },
      { vehiclePlate: { contains: q, mode: "insensitive" } },
      { number: { contains: q, mode: "insensitive" } },
      { unit: { houseNumber: { contains: q, mode: "insensitive" } } },
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.visitorLog.findMany({ where, orderBy: { checkInAt: "desc" }, ...pageParams(f.page, pageSize), include: { unit: { select: { houseNumber: true } } } }),
    prisma.visitorLog.count({ where }),
  ]);
  // Nomor identitas tidak pernah dikirim ke daftar; hanya ditampilkan tersamar di detail.
  return { items: rows.map(({ idNumber, ...r }) => ({ ...r, hasIdNumber: !!idNumber })), total };
}

export async function getVisitor(ctx: AuthContext, id: string) {
  assertCanAny(ctx, ["security.visitors.view", "security.visitors.manage"]);
  const v = await prisma.visitorLog.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { unit: { select: { houseNumber: true, address: true } } } });
  if (!v) throw new NotFoundError("Data kunjungan tidak ditemukan.");
  const users = await prisma.user.findMany({ where: { id: { in: [v.checkInById, v.checkOutById].filter(Boolean) as string[] } }, select: { id: true, name: true } });
  const plain = decryptField(v.idNumber);
  return {
    ...v,
    idNumber: plain ? `${"*".repeat(Math.max(0, plain.length - 4))}${plain.slice(-4)}` : null,
    officers: Object.fromEntries(users.map((u) => [u.id, u.name])),
  };
}

// ───────────────────────── Laporan kejadian ─────────────────────────

export const incidentSchema = z.object({
  type: z.enum(INCIDENT_TYPES, { errorMap: () => ({ message: "Jenis kejadian wajib dipilih." }) }),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Waktu kejadian tidak valid."),
  location: requiredText("Lokasi", 200),
  description: requiredText("Deskripsi", 5000),
});

export async function createIncident(ctx: AuthContext, input: z.input<typeof incidentSchema>, files: UploadInput[]) {
  assertCan(ctx, "security.incidents.manage");
  const data = incidentSchema.parse(input);
  const occurredAt = jakartaDateTime(data.occurredAt.slice(0, 10), data.occurredAt.slice(11, 16));
  if (occurredAt > new Date(Date.now() + 5 * 60_000)) throw new AppError("Waktu kejadian tidak boleh di masa depan.", "VALIDATION", { occurredAt: "Tidak boleh di masa depan." });
  if (files.length > 5) throw new AppError("Maksimal 5 lampiran.", "VALIDATION", { attachments: "Maksimal 5 berkas." });
  return prisma.$transaction(async (tx) => {
    const inc = await tx.securityIncident.create({
      data: { organizationId: ctx.organizationId, number: await nextNumber(tx, ctx.organizationId, "LAP"), type: data.type, occurredAt, location: data.location, description: data.description, reporterId: ctx.userId },
    });
    for (const f of files) {
      const s = await storeFile(tx, ctx.organizationId, f, "incident", ctx.userId);
      await tx.securityIncidentAttachment.create({ data: { incidentId: inc.id, fileId: s.id } });
    }
    await writeAudit(ctx, { action: "INCIDENT_REPORTED", module: "security", entityType: "SecurityIncident", entityId: inc.id, summary: `Laporan kejadian ${inc.number}: ${data.type} di ${data.location}` }, tx);
    await notifyPermissionHolders(tx, ctx.organizationId, "security.incidents.review", {
      type: "INCIDENT_NEW", title: `Laporan kejadian: ${data.type}`, body: data.location, link: `/kejadian/${inc.id}`,
    }, ctx.userId);
    return inc;
  });
}

export const reviewIncidentSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  managementNotes: optionalText(5000),
});

export async function reviewIncident(ctx: AuthContext, id: string, input: z.input<typeof reviewIncidentSchema>) {
  assertCan(ctx, "security.incidents.review");
  const data = reviewIncidentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const inc = await tx.securityIncident.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!inc) throw new NotFoundError("Laporan tidak ditemukan.");
    await tx.securityIncident.update({ where: { id }, data: { status: data.status, managementNotes: data.managementNotes } });
    await writeAudit(ctx, {
      action: "INCIDENT_REVIEWED", module: "security", entityType: "SecurityIncident", entityId: id,
      summary: `Tindak lanjut ${inc.number}: ${INCIDENT_STATUS[inc.status]} → ${INCIDENT_STATUS[data.status]}`,
    }, tx);
    if (inc.reporterId !== ctx.userId) {
      await notifyUser(tx, ctx.organizationId, inc.reporterId, { type: "INCIDENT_UPDATED", title: `Laporan ${inc.number}: ${INCIDENT_STATUS[data.status]}`, link: `/kejadian/${id}` });
    }
  });
}

export async function listIncidents(ctx: AuthContext, f: { q?: string; status?: string; type?: string; page: number }, pageSize = 20) {
  assertCanAny(ctx, ["security.incidents.manage", "security.incidents.review"]);
  const where: Prisma.SecurityIncidentWhereInput = { organizationId: ctx.organizationId };
  if (f.status && f.status in INCIDENT_STATUS) where.status = f.status as IncidentStatus;
  if (f.type) where.type = f.type;
  if (f.q) where.OR = [{ number: { contains: f.q.slice(0, 60), mode: "insensitive" } }, { location: { contains: f.q.slice(0, 60), mode: "insensitive" } }, { description: { contains: f.q.slice(0, 60), mode: "insensitive" } }];
  const [items, total] = await Promise.all([
    prisma.securityIncident.findMany({ where, orderBy: { occurredAt: "desc" }, ...pageParams(f.page, pageSize), select: { id: true, number: true, type: true, occurredAt: true, location: true, status: true, reporterId: true } }),
    prisma.securityIncident.count({ where }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(items.map((i) => i.reporterId))] } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return { items: items.map((i) => ({ ...i, reporterName: names.get(i.reporterId) ?? "-" })), total };
}

export async function getIncident(ctx: AuthContext, id: string) {
  assertCanAny(ctx, ["security.incidents.manage", "security.incidents.review"]);
  const inc = await prisma.securityIncident.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { attachments: { include: { file: { select: { id: true, originalName: true, mimeType: true } } } } },
  });
  if (!inc) throw new NotFoundError("Laporan tidak ditemukan.");
  const reporter = await prisma.user.findUnique({ where: { id: inc.reporterId }, select: { name: true } });
  return { ...inc, reporterName: reporter?.name ?? "-", canReview: can(ctx, "security.incidents.review") };
}

// ───────────────────────── CCTV ─────────────────────────

const safeUrl = z.string().trim().max(500).url("URL tidak valid.").refine((u) => /^https?:\/\//i.test(u), "Hanya tautan http(s) yang diizinkan.")
  .refine((u) => !/\/\/[^/]*@/.test(u), "Jangan menyertakan username/password di URL. Gunakan login pada aplikasi kamera.")
  .or(z.literal("")).optional().transform((v) => v || null);

export const cameraSchema = z.object({
  name: requiredText("Nama kamera", 100),
  location: requiredText("Lokasi", 200),
  description: optionalText(1000),
  status: z.enum(["ONLINE", "OFFLINE", "MAINTENANCE", "UNKNOWN"]),
  accessUrl: safeUrl,
  internalNotes: optionalText(1000),
  isActive: z.boolean().default(true),
});

export async function saveCamera(ctx: AuthContext, id: string | null, input: z.input<typeof cameraSchema>) {
  assertCan(ctx, "cctv.manage");
  const data = cameraSchema.parse(input);
  const clash = await prisma.cctvCamera.findFirst({ where: { organizationId: ctx.organizationId, name: data.name, id: id ? { not: id } : undefined } });
  if (clash) throw new AppError("Nama kamera sudah ada.", "VALIDATION", { name: "Nama sudah dipakai." });
  return prisma.$transaction(async (tx) => {
    const existing = id ? await tx.cctvCamera.findFirst({ where: { id, organizationId: ctx.organizationId } }) : null;
    if (id && !existing) throw new NotFoundError("Kamera tidak ditemukan.");
    // URL kosong saat edit = pertahankan URL tersimpan (URL tidak pernah dikirim ke browser).
    const payload = { ...data, accessUrl: data.accessUrl ?? existing?.accessUrl ?? null };
    const row = existing ? await tx.cctvCamera.update({ where: { id: existing.id }, data: payload }) : await tx.cctvCamera.create({ data: { ...payload, organizationId: ctx.organizationId } });
    await writeAudit(ctx, { action: existing ? "CCTV_UPDATED" : "CCTV_CREATED", module: "security", entityType: "CctvCamera", entityId: row.id, summary: `${existing ? "Mengubah" : "Menambah"} kamera ${row.name}` }, tx);
    return row;
  });
}

export async function clearCameraUrl(ctx: AuthContext, id: string) {
  assertCan(ctx, "cctv.manage");
  const c = await prisma.cctvCamera.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c) throw new NotFoundError("Kamera tidak ditemukan.");
  await prisma.$transaction(async (tx) => {
    await tx.cctvCamera.update({ where: { id }, data: { accessUrl: null } });
    await writeAudit(ctx, { action: "CCTV_URL_CLEARED", module: "security", entityType: "CctvCamera", entityId: id, summary: `Menghapus tautan akses kamera ${c.name}` }, tx);
  });
}

/** Daftar kamera TANPA accessUrl; catatan internal hanya untuk pengelola. */
export async function listCameras(ctx: AuthContext) {
  assertCan(ctx, "cctv.view");
  const manage = can(ctx, "cctv.manage");
  const rows = await prisma.cctvCamera.findMany({ where: { organizationId: ctx.organizationId, ...(manage ? {} : { isActive: true }) }, orderBy: { name: "asc" } });
  return rows.map(({ accessUrl, internalNotes, ...c }) => ({ ...c, hasLink: !!accessUrl, internalNotes: manage ? internalNotes : null }));
}

/** URL akses hanya dibuka lewat redirect server setelah pemeriksaan izin; setiap akses tercatat. */
export async function cameraAccessUrl(ctx: AuthContext, id: string) {
  assertCan(ctx, "cctv.view");
  const c = await prisma.cctvCamera.findFirst({ where: { id, organizationId: ctx.organizationId, isActive: true } });
  if (!c?.accessUrl) throw new NotFoundError("Tautan kamera belum dikonfigurasi.");
  await writeAudit(ctx, { action: "CCTV_ACCESSED", module: "security", entityType: "CctvCamera", entityId: id, summary: `Membuka tautan kamera ${c.name}` });
  return c.accessUrl;
}

export type CameraStatusKey = CameraStatus;
