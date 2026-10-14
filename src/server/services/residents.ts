import { z } from "zod";
import type { Prisma, ResidentStatus, OccupancyStatus } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { assertCan, assertCanAny, can, type AuthContext } from "../auth/context";
import { AppError, NotFoundError } from "../errors";
import { writeAudit } from "../audit";
import { nextNumber } from "../counters";
import { encryptField, decryptField } from "../crypto";
import { emailSchema, optionalIsoDate, optionalText, pageParams, phoneSchema, requiredText } from "../validation";
import { addYears, dateOnly, todayDate, toIsoDate } from "@/lib/dates";
import { RESIDENT_STATUS, OCCUPANCY_STATUS } from "@/lib/labels";
import { createAccountForResident, accountInputSchema } from "./users";

export const RESIDENT_STATUSES = ["ACTIVE", "NEWCOMER", "MOVED", "DECEASED"] as const;
export const OCCUPANCY_STATUSES = ["PERMANENT", "TEMPORARY", "VACANT"] as const;

const baseSchema = z.object({
  fullName: requiredText("Nama lengkap", 120),
  nik: z.string().trim().regex(/^\d{16}$/, "NIK harus 16 digit angka.").or(z.literal("")).optional().transform((v) => v || null),
  phone: phoneSchema,
  email: emailSchema,
  status: z.enum(RESIDENT_STATUSES, { errorMap: () => ({ message: "Status warga wajib dipilih." }) }),
  occupancyStatus: z.enum(OCCUPANCY_STATUSES, { errorMap: () => ({ message: "Status hunian wajib dipilih." }) }),
  moveInDate: optionalIsoDate,
  deathDate: optionalIsoDate,
  deathCorrectionNote: optionalText(500),
  internalNotes: optionalText(2000),
});

export const createResidentSchema = baseSchema.extend({
  unitId: z.string().max(40).optional().transform((v) => v || null),
  relation: z.enum(["HEAD", "FAMILY", "TENANT"]).optional().default("HEAD"),
  account: accountInputSchema.optional(),
});
export const updateResidentSchema = baseSchema;

export type CreateResidentInput = z.input<typeof createResidentSchema>;

/** Validasi aturan tanggal meninggal (maks. 10 tahun ke belakang pada input normal). */
export async function validateDeathDate(
  ctx: AuthContext,
  status: ResidentStatus,
  deathDate: string | null,
  correctionNote: string | null,
  maxYears: number,
  today = todayDate(),
) {
  if (status !== "DECEASED") {
    if (deathDate) throw new AppError("Tanggal meninggal hanya diisi untuk status Meninggal.", "VALIDATION", { deathDate: "Kosongkan tanggal meninggal." });
    return null;
  }
  if (!deathDate) throw new AppError("Tanggal meninggal wajib diisi.", "VALIDATION", { deathDate: "Tanggal meninggal wajib diisi." });
  const d = dateOnly(deathDate);
  if (d > today) throw new AppError("Tanggal meninggal tidak boleh melebihi hari ini.", "VALIDATION", { deathDate: "Tidak boleh melebihi hari ini." });
  const limit = addYears(today, -maxYears);
  if (d < limit) {
    if (!can(ctx, "residents.death_backdate")) {
      throw new AppError(
        `Tanggal meninggal maksimal ${maxYears} tahun ke belakang (${toIsoDate(limit)}). Hubungi Super Admin untuk koreksi khusus.`,
        "VALIDATION",
        { deathDate: `Maksimal ${maxYears} tahun ke belakang.` },
      );
    }
    if (!correctionNote) {
      throw new AppError("Koreksi tanggal lama wajib menyertakan alasan.", "VALIDATION", { deathCorrectionNote: "Alasan koreksi wajib diisi." });
    }
  }
  return d;
}

function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    const a = before[k] instanceof Date ? toIsoDate(before[k] as Date) : before[k];
    const b = after[k] instanceof Date ? toIsoDate(after[k] as Date) : after[k];
    if ((a ?? null) !== (b ?? null)) out[k] = { from: a ?? null, to: b ?? null };
  }
  return out;
}

export async function createResident(ctx: AuthContext, input: CreateResidentInput) {
  assertCan(ctx, "residents.create");
  const data = createResidentSchema.parse(input);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
  const deathDate = await validateDeathDate(ctx, data.status, data.deathDate, data.deathCorrectionNote, org.deathRecordMaxYears);
  if (data.account) assertCan(ctx, "users.manage");

  return prisma.$transaction(async (tx) => {
    if (data.unitId) {
      const unit = await tx.residentialUnit.findFirst({ where: { id: data.unitId, organizationId: ctx.organizationId, isActive: true } });
      if (!unit) throw new AppError("Rumah tidak ditemukan.", "VALIDATION", { unitId: "Rumah tidak valid." });
    }
    const code = await nextNumber(tx, ctx.organizationId, "W");
    const resident = await tx.resident.create({
      data: {
        organizationId: ctx.organizationId,
        code,
        fullName: data.fullName,
        nik: encryptField(data.nik),
        phone: data.phone,
        email: data.email,
        status: data.status,
        occupancyStatus: data.occupancyStatus,
        moveInDate: data.moveInDate ? dateOnly(data.moveInDate) : null,
        deathDate,
        deathRecordedAt: deathDate ? new Date() : null,
        deathRecordedById: deathDate ? ctx.userId : null,
        internalNotes: data.internalNotes,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
    });
    if (data.unitId) {
      await tx.residentUnitMembership.create({
        data: {
          organizationId: ctx.organizationId,
          residentId: resident.id,
          unitId: data.unitId,
          relation: data.relation,
          startDate: data.moveInDate ? dateOnly(data.moveInDate) : todayDate(),
          createdById: ctx.userId,
        },
      });
    }
    await tx.residentHistory.create({
      data: { residentId: resident.id, action: "CREATED", changes: { status: data.status, occupancyStatus: data.occupancyStatus }, actorId: ctx.userId },
    });
    await writeAudit(ctx, {
      action: "RESIDENT_CREATED", module: "residents", entityType: "Resident", entityId: resident.id,
      summary: `Menambah warga ${resident.fullName} (${code})`,
    }, tx);
    if (data.account) await createAccountForResident(ctx, tx, resident.id, data.account);
    return resident;
  });
}

export async function updateResident(ctx: AuthContext, id: string, input: z.input<typeof updateResidentSchema>) {
  assertCan(ctx, "residents.update");
  const data = updateResidentSchema.parse(input);
  const existing = await prisma.resident.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Warga tidak ditemukan.");
  if (existing.archivedAt) throw new AppError("Warga sudah diarsipkan. Pulihkan terlebih dahulu.");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });

  // Tanggal meninggal yang sudah tercatat dan tidak berubah tidak perlu divalidasi ulang terhadap batas.
  const unchangedDeath = existing.status === "DECEASED" && data.status === "DECEASED" && existing.deathDate && data.deathDate === toIsoDate(existing.deathDate);
  const deathDate = unchangedDeath
    ? existing.deathDate
    : await validateDeathDate(ctx, data.status, data.deathDate, data.deathCorrectionNote, org.deathRecordMaxYears);

  const next = {
    fullName: data.fullName,
    nik: data.nik ? encryptField(data.nik) : existing.nik,
    phone: data.phone,
    email: data.email,
    status: data.status,
    occupancyStatus: data.occupancyStatus,
    moveInDate: data.moveInDate ? dateOnly(data.moveInDate) : null,
    deathDate,
    internalNotes: data.internalNotes,
  };
  const changes = diff(
    { ...existing, nik: decryptField(existing.nik) },
    { ...next, nik: data.nik ?? decryptField(existing.nik) },
  );
  if (changes.nik) changes.nik = { from: "[disamarkan]", to: "[disamarkan]" };
  if (Object.keys(changes).length === 0) return existing;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.resident.update({
      where: { id },
      data: {
        ...next,
        updatedById: ctx.userId,
        ...(changes.deathDate || (changes.status && data.status === "DECEASED")
          ? { deathRecordedAt: new Date(), deathRecordedById: ctx.userId } : {}),
        ...(data.status !== "DECEASED" ? { deathRecordedAt: null, deathRecordedById: null } : {}),
      },
    });
    await tx.residentHistory.create({
      data: { residentId: id, action: "UPDATED", changes: changes as Prisma.InputJsonValue, note: data.deathCorrectionNote, actorId: ctx.userId },
    });
    const summaryParts: string[] = [];
    if (changes.status) summaryParts.push(`status ${RESIDENT_STATUS[existing.status]} → ${RESIDENT_STATUS[data.status]}`);
    if (changes.occupancyStatus) summaryParts.push(`hunian ${OCCUPANCY_STATUS[existing.occupancyStatus]} → ${OCCUPANCY_STATUS[data.occupancyStatus]}`);
    await writeAudit(ctx, {
      action: changes.status && data.status === "DECEASED" ? "RESIDENT_DECEASED" : changes.occupancyStatus ? "RESIDENT_OCCUPANCY_CHANGED" : "RESIDENT_UPDATED",
      module: "residents", entityType: "Resident", entityId: id,
      summary: `Mengubah data warga ${updated.fullName}${summaryParts.length ? ` (${summaryParts.join(", ")})` : ""}`,
      metadata: { fields: Object.keys(changes), note: data.deathCorrectionNote },
    }, tx);
    return updated;
  });
}

export async function setResidentArchived(ctx: AuthContext, id: string, archived: boolean, reason: string) {
  assertCan(ctx, "residents.deactivate");
  const r = await prisma.resident.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!r) throw new NotFoundError("Warga tidak ditemukan.");
  if (archived && !reason.trim()) throw new AppError("Alasan pengarsipan wajib diisi.", "VALIDATION", { reason: "Alasan wajib diisi." });
  return prisma.$transaction(async (tx) => {
    await tx.resident.update({
      where: { id },
      data: archived ? { archivedAt: new Date(), archivedById: ctx.userId } : { archivedAt: null, archivedById: null },
    });
    await tx.residentHistory.create({ data: { residentId: id, action: archived ? "ARCHIVED" : "RESTORED", changes: {}, note: reason || null, actorId: ctx.userId } });
    await writeAudit(ctx, {
      action: archived ? "RESIDENT_ARCHIVED" : "RESIDENT_RESTORED", module: "residents", entityType: "Resident", entityId: id,
      summary: `${archived ? "Mengarsipkan" : "Memulihkan"} warga ${r.fullName}`, metadata: { reason },
    }, tx);
  });
}

export interface ResidentFilter {
  q?: string;
  status?: string;
  occupancy?: string;
  unit?: string;
  archived?: boolean;
  sort?: string;
  page: number;
}

export async function listResidents(ctx: AuthContext, f: ResidentFilter, pageSize = 20) {
  assertCan(ctx, "residents.view");
  const where: Prisma.ResidentWhereInput = {
    organizationId: ctx.organizationId,
    archivedAt: f.archived ? { not: null } : null,
  };
  if (f.status && (RESIDENT_STATUSES as readonly string[]).includes(f.status)) where.status = f.status as ResidentStatus;
  if (f.occupancy && (OCCUPANCY_STATUSES as readonly string[]).includes(f.occupancy)) where.occupancyStatus = f.occupancy as OccupancyStatus;
  if (f.unit) where.memberships = { some: { endDate: null, unit: { houseNumber: { contains: f.unit, mode: "insensitive" } } } };
  if (f.q) {
    const q = f.q.trim().slice(0, 80);
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { memberships: { some: { endDate: null, unit: { houseNumber: { contains: q, mode: "insensitive" } } } } },
    ];
  }
  const orderBy: Prisma.ResidentOrderByWithRelationInput =
    f.sort === "newest" ? { createdAt: "desc" } : f.sort === "code" ? { code: "asc" } : { fullName: "asc" };
  const [items, total] = await Promise.all([
    prisma.resident.findMany({
      where, orderBy, ...pageParams(f.page, pageSize),
      select: {
        id: true, code: true, fullName: true, phone: true, status: true, occupancyStatus: true, userId: true, archivedAt: true,
        memberships: { where: { endDate: null }, select: { unit: { select: { id: true, houseNumber: true } } } },
      },
    }),
    prisma.resident.count({ where }),
  ]);
  return { items, total };
}

export async function getResident(ctx: AuthContext, id: string) {
  assertCan(ctx, "residents.view");
  const r = await prisma.resident.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      user: { select: { id: true, username: true, email: true, isActive: true, roles: { select: { role: { select: { key: true, name: true } } } } } },
      memberships: { include: { unit: true }, orderBy: { startDate: "desc" } },
      histories: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!r) throw new NotFoundError("Warga tidak ditemukan.");
  const sensitive = can(ctx, "residents.view_sensitive");
  const actorIds = [...new Set(r.histories.map((h) => h.actorId).filter(Boolean))] as string[];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  return {
    ...r,
    nik: sensitive ? decryptField(r.nik) : null,
    nikMasked: maskNik(decryptField(r.nik)),
    internalNotes: sensitive ? r.internalNotes : null,
    actorNames: Object.fromEntries(actors.map((a) => [a.id, a.name])),
  };
}

function maskNik(n: string | null) {
  if (!n) return null;
  return n.slice(0, 4) + "********" + n.slice(-4);
}

/** Pencarian warga untuk autofill (form pembayaran, booking). Hanya data yang diperlukan. */
export async function searchResidentsLite(ctx: AuthContext, q: string) {
  assertCanAny(ctx, ["residents.view", "ipl.payment_record", "residents.security_lookup"]);
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const rows = await prisma.resident.findMany({
    where: {
      organizationId: ctx.organizationId,
      archivedAt: null,
      status: { not: "DECEASED" },
      OR: [
        { fullName: { contains: term, mode: "insensitive" } },
        { code: { contains: term, mode: "insensitive" } },
        { memberships: { some: { endDate: null, unit: { houseNumber: { contains: term, mode: "insensitive" } } } } },
      ],
    },
    take: 10,
    orderBy: { fullName: "asc" },
    select: {
      id: true, fullName: true, code: true, phone: true, occupancyStatus: true,
      memberships: { where: { endDate: null }, select: { unit: { select: { id: true, houseNumber: true, address: true } } } },
    },
  });
  const full = can(ctx, "residents.view") || can(ctx, "ipl.payment_record");
  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    code: r.code,
    phone: full ? r.phone : null,
    occupancyStatus: r.occupancyStatus,
    units: r.memberships.map((m) => m.unit),
  }));
}

export async function residentOptionsWithoutAccount(ctx: AuthContext) {
  assertCan(ctx, "users.manage");
  return prisma.resident.findMany({
    where: { organizationId: ctx.organizationId, userId: null, archivedAt: null, status: { not: "DECEASED" } },
    select: { id: true, fullName: true, code: true },
    orderBy: { fullName: "asc" },
    take: 500,
  });
}

export async function residentStats(tx: Tx, organizationId: string) {
  const grouped = await tx.resident.groupBy({
    by: ["status"], where: { organizationId, archivedAt: null }, _count: { _all: true },
  });
  const by = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Record<string, number>;
  return {
    total: grouped.reduce((s, g) => s + g._count._all, 0),
    active: by.ACTIVE ?? 0,
    newcomer: by.NEWCOMER ?? 0,
    moved: by.MOVED ?? 0,
    deceased: by.DECEASED ?? 0,
  };
}
