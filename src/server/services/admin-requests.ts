import { z } from "zod";
import type { AdminRequestStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { assertCan, assertCanAny, can, type AuthContext } from "../auth/context";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { writeAudit } from "../audit";
import { nextNumber } from "../counters";
import { storeFile, type UploadInput } from "../storage";
import { optionalText, pageParams, phoneSchema, requiredText } from "../validation";
import { notifyPermissionHolders, notifyUser } from "./notifications";
import { residentUnits } from "./ipl";
import { ADMIN_REQUEST_STATUS } from "@/lib/labels";

export const submitRequestSchema = z.object({
  typeId: z.string().min(1, "Jenis pengajuan wajib dipilih.").max(40),
  purpose: requiredText("Tujuan / keterangan", 1000),
  contactPhone: phoneSchema,
  applicantNotes: optionalText(1000),
});

const MAX_DOCS = 5;

export async function listRequestTypes(ctx: AuthContext, includeInactive = false) {
  assertCanAny(ctx, ["administration.submit", "administration.view"]);
  return prisma.administrativeRequestType.findMany({
    where: { organizationId: ctx.organizationId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
  });
}

export async function submitRequest(ctx: AuthContext, input: z.input<typeof submitRequestSchema>, docs: UploadInput[]) {
  assertCan(ctx, "administration.submit");
  const data = submitRequestSchema.parse(input);
  if (!ctx.residentId) throw new AppError("Akun Anda belum terhubung dengan data warga. Hubungi pengurus.");
  if (docs.length > MAX_DOCS) throw new AppError(`Maksimal ${MAX_DOCS} dokumen pendukung.`, "VALIDATION", { documents: `Maksimal ${MAX_DOCS} berkas.` });
  const type = await prisma.administrativeRequestType.findFirst({ where: { id: data.typeId, organizationId: ctx.organizationId, isActive: true } });
  if (!type) throw new AppError("Jenis pengajuan tidak valid.", "VALIDATION", { typeId: "Tidak valid." });
  const resident = await prisma.resident.findUniqueOrThrow({ where: { id: ctx.residentId } });
  const units = await residentUnits(ctx.organizationId, ctx.residentId);
  return prisma.$transaction(async (tx) => {
    const req = await tx.administrativeRequest.create({
      data: {
        organizationId: ctx.organizationId, number: await nextNumber(tx, ctx.organizationId, "SRT"),
        typeId: type.id, residentId: resident.id, unitId: units[0]?.id ?? null, requesterUserId: ctx.userId,
        purpose: data.purpose, contactPhone: data.contactPhone ?? resident.phone, applicantNotes: data.applicantNotes,
        histories: { create: { toStatus: "SUBMITTED", actorId: ctx.userId, note: "Pengajuan dibuat" } },
      },
    });
    for (const d of docs) {
      const f = await storeFile(tx, ctx.organizationId, d, "admin-request", ctx.userId);
      await tx.administrativeRequestDocument.create({ data: { requestId: req.id, fileId: f.id } });
    }
    await writeAudit(ctx, {
      action: "ADMIN_REQUEST_SUBMITTED", module: "administration", entityType: "AdministrativeRequest", entityId: req.id,
      summary: `Pengajuan ${type.name} ${req.number} oleh ${resident.fullName}`,
    }, tx);
    await notifyPermissionHolders(tx, ctx.organizationId, "administration.process", {
      type: "ADMIN_REQUEST_NEW", title: "Pengajuan surat baru", body: `${type.name} — ${resident.fullName}`, link: `/surat/${req.id}`,
    }, ctx.userId);
    return req;
  });
}

const TRANSITIONS: Record<AdminRequestStatus, AdminRequestStatus[]> = {
  SUBMITTED: ["PROCESSING", "APPROVED", "REJECTED"],
  PROCESSING: ["APPROVED", "REJECTED"],
  APPROVED: [], REJECTED: [], CANCELLED: [],
};

export const processRequestSchema = z.object({
  status: z.enum(["PROCESSING", "APPROVED", "REJECTED"]),
  note: optionalText(1000),
  internalNotes: optionalText(2000),
});

export async function processRequest(ctx: AuthContext, id: string, input: z.input<typeof processRequestSchema>) {
  assertCan(ctx, "administration.process");
  const data = processRequestSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM administrative_requests WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    if (!locked.length) throw new NotFoundError("Pengajuan tidak ditemukan.");
    const r = await tx.administrativeRequest.findUniqueOrThrow({ where: { id }, include: { type: true } });
    if (r.requesterUserId === ctx.userId) throw new ForbiddenError("Anda tidak dapat memproses pengajuan milik sendiri.");
    if (!TRANSITIONS[r.status].includes(data.status)) {
      throw new ConflictError(`Status ${ADMIN_REQUEST_STATUS[r.status]} tidak dapat diubah menjadi ${ADMIN_REQUEST_STATUS[data.status]}.`);
    }
    if (data.status === "REJECTED" && !data.note) throw new AppError("Alasan penolakan wajib diisi.", "VALIDATION", { note: "Alasan wajib diisi." });
    const final = data.status !== "PROCESSING";
    await tx.administrativeRequest.update({
      where: { id },
      data: {
        status: data.status,
        internalNotes: data.internalNotes ?? r.internalNotes,
        ...(final ? { decidedAt: new Date(), decidedById: ctx.userId } : {}),
        histories: { create: { fromStatus: r.status, toStatus: data.status, note: data.note, actorId: ctx.userId } },
      },
    });
    await writeAudit(ctx, {
      action: `ADMIN_REQUEST_${data.status}`, module: "administration", entityType: "AdministrativeRequest", entityId: id,
      summary: `Pengajuan ${r.number} (${r.type.name}): ${ADMIN_REQUEST_STATUS[r.status]} → ${ADMIN_REQUEST_STATUS[data.status]}`,
    }, tx);
    await notifyUser(tx, ctx.organizationId, r.requesterUserId, {
      type: "ADMIN_REQUEST_STATUS", title: `Pengajuan ${ADMIN_REQUEST_STATUS[data.status].toLowerCase()}`,
      body: `${r.type.name} (${r.number})${data.note ? `: ${data.note}` : ""}`, link: `/pengajuan/${id}`,
    });
  });
}

export async function cancelOwnRequest(ctx: AuthContext, id: string) {
  return prisma.$transaction(async (tx) => {
    const r = await tx.administrativeRequest.findFirst({ where: { id, organizationId: ctx.organizationId, requesterUserId: ctx.userId } });
    if (!r) throw new NotFoundError("Pengajuan tidak ditemukan.");
    if (r.status !== "SUBMITTED") throw new ConflictError("Hanya pengajuan berstatus Diajukan yang dapat dibatalkan.");
    await tx.administrativeRequest.update({
      where: { id },
      data: { status: "CANCELLED", histories: { create: { fromStatus: r.status, toStatus: "CANCELLED", note: "Dibatalkan pemohon", actorId: ctx.userId } } },
    });
    await writeAudit(ctx, { action: "ADMIN_REQUEST_CANCELLED", module: "administration", entityType: "AdministrativeRequest", entityId: id, summary: `Pemohon membatalkan pengajuan ${r.number}` }, tx);
  });
}

export interface RequestFilter { q?: string; status?: string; typeId?: string; page: number; active?: boolean; own?: boolean }

export async function listRequests(ctx: AuthContext, f: RequestFilter, pageSize = 20) {
  const where: Prisma.AdministrativeRequestWhereInput = { organizationId: ctx.organizationId };
  if (f.own || !can(ctx, "administration.view")) {
    assertCan(ctx, "administration.submit");
    where.requesterUserId = ctx.userId;
  }
  if (f.active) where.status = { in: ["SUBMITTED", "PROCESSING"] };
  else if (f.status && f.status in ADMIN_REQUEST_STATUS) where.status = f.status as AdminRequestStatus;
  if (f.typeId) where.typeId = f.typeId;
  if (f.q && !where.requesterUserId) {
    const q = f.q.trim().slice(0, 60);
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { resident: { fullName: { contains: q, mode: "insensitive" } } },
      { unit: { houseNumber: { contains: q, mode: "insensitive" } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.administrativeRequest.findMany({
      where, orderBy: { createdAt: f.active ? "asc" : "desc" }, ...pageParams(f.page, pageSize),
      include: { type: { select: { name: true } }, resident: { select: { fullName: true } }, unit: { select: { houseNumber: true } } },
    }),
    prisma.administrativeRequest.count({ where }),
  ]);
  return { items, total };
}

export async function getRequest(ctx: AuthContext, id: string) {
  const staff = can(ctx, "administration.view");
  const r = await prisma.administrativeRequest.findFirst({
    where: { id, organizationId: ctx.organizationId, ...(staff ? {} : { requesterUserId: ctx.userId }) },
    include: {
      type: true, resident: { select: { id: true, fullName: true, phone: true } }, unit: { select: { houseNumber: true, address: true } },
      documents: { include: { file: { select: { id: true, originalName: true, mimeType: true, size: true } } } },
      histories: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!r) throw new NotFoundError("Pengajuan tidak ditemukan.");
  const ids = [...new Set(r.histories.map((h) => h.actorId).filter(Boolean))] as string[];
  const actors = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return {
    ...r,
    // Catatan internal pengurus tidak pernah dikirim ke pemohon.
    internalNotes: staff ? r.internalNotes : null,
    actorNames: Object.fromEntries(actors.map((a) => [a.id, a.name])),
    canProcess: can(ctx, "administration.process") && r.requesterUserId !== ctx.userId,
    isOwner: r.requesterUserId === ctx.userId,
  };
}

export const requestTypeSchema = z.object({ name: requiredText("Nama jenis pengajuan", 100), isActive: z.boolean().default(true) });

export async function saveRequestType(ctx: AuthContext, id: string | null, input: z.input<typeof requestTypeSchema>) {
  assertCan(ctx, "administration.process");
  const data = requestTypeSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const row = id
      ? await tx.administrativeRequestType.update({ where: { id, organizationId: ctx.organizationId }, data })
      : await tx.administrativeRequestType.create({ data: { ...data, organizationId: ctx.organizationId, code: `CUSTOM_${Date.now().toString(36).toUpperCase()}` } });
    await writeAudit(ctx, { action: id ? "ADMIN_REQUEST_TYPE_UPDATED" : "ADMIN_REQUEST_TYPE_CREATED", module: "administration", entityType: "AdministrativeRequestType", entityId: row.id, summary: `${id ? "Mengubah" : "Menambah"} jenis pengajuan ${row.name}` }, tx);
    return row;
  });
}
