import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { assertCan, assertCanAny, type AuthContext } from "../auth/context";
import { AppError, NotFoundError } from "../errors";
import { writeAudit } from "../audit";
import { isoDate, optionalText, pageParams, requiredText } from "../validation";
import { dateOnly } from "@/lib/dates";

export const unitSchema = z.object({
  houseNumber: requiredText("Nomor rumah", 30).transform((v) => v.toUpperCase()),
  block: optionalText(20),
  address: requiredText("Alamat", 300),
  occupancyStatus: z.enum(["PERMANENT", "TEMPORARY", "VACANT"]),
  ownerResidentId: z.string().max(40).optional().transform((v) => v || null),
  notes: optionalText(1000),
  isActive: z.boolean().optional().default(true),
});

async function assertOwner(ctx: AuthContext, ownerId: string | null) {
  if (!ownerId) return;
  const r = await prisma.resident.findFirst({ where: { id: ownerId, organizationId: ctx.organizationId } });
  if (!r) throw new AppError("Pemilik tidak valid.", "VALIDATION", { ownerResidentId: "Warga tidak ditemukan." });
}

export async function createUnit(ctx: AuthContext, input: z.input<typeof unitSchema>) {
  assertCan(ctx, "units.manage");
  const data = unitSchema.parse(input);
  await assertOwner(ctx, data.ownerResidentId);
  const exists = await prisma.residentialUnit.findUnique({
    where: { organizationId_houseNumber: { organizationId: ctx.organizationId, houseNumber: data.houseNumber } },
  });
  if (exists) throw new AppError("Nomor rumah sudah terdaftar.", "VALIDATION", { houseNumber: "Nomor rumah sudah terdaftar." });
  return prisma.$transaction(async (tx) => {
    const unit = await tx.residentialUnit.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId, updatedById: ctx.userId } });
    await writeAudit(ctx, { action: "UNIT_CREATED", module: "units", entityType: "ResidentialUnit", entityId: unit.id, summary: `Menambah rumah ${unit.houseNumber}` }, tx);
    return unit;
  });
}

export async function updateUnit(ctx: AuthContext, id: string, input: z.input<typeof unitSchema>) {
  assertCan(ctx, "units.manage");
  const data = unitSchema.parse(input);
  const unit = await prisma.residentialUnit.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!unit) throw new NotFoundError("Rumah tidak ditemukan.");
  await assertOwner(ctx, data.ownerResidentId);
  if (data.houseNumber !== unit.houseNumber) {
    const clash = await prisma.residentialUnit.findUnique({
      where: { organizationId_houseNumber: { organizationId: ctx.organizationId, houseNumber: data.houseNumber } },
    });
    if (clash) throw new AppError("Nomor rumah sudah terdaftar.", "VALIDATION", { houseNumber: "Nomor rumah sudah terdaftar." });
  }
  return prisma.$transaction(async (tx) => {
    const u = await tx.residentialUnit.update({ where: { id }, data: { ...data, updatedById: ctx.userId } });
    await writeAudit(ctx, {
      action: unit.occupancyStatus !== data.occupancyStatus ? "UNIT_OCCUPANCY_CHANGED" : "UNIT_UPDATED",
      module: "units", entityType: "ResidentialUnit", entityId: id, summary: `Mengubah data rumah ${u.houseNumber}`,
    }, tx);
    return u;
  });
}

export const membershipSchema = z.object({
  residentId: z.string().min(1, "Warga wajib dipilih.").max(40),
  relation: z.enum(["HEAD", "FAMILY", "TENANT"]),
  startDate: isoDate("Tanggal mulai"),
});

export async function addMembership(ctx: AuthContext, unitId: string, input: z.input<typeof membershipSchema>) {
  assertCan(ctx, "units.manage");
  const data = membershipSchema.parse(input);
  const [unit, resident] = await Promise.all([
    prisma.residentialUnit.findFirst({ where: { id: unitId, organizationId: ctx.organizationId } }),
    prisma.resident.findFirst({ where: { id: data.residentId, organizationId: ctx.organizationId, archivedAt: null } }),
  ]);
  if (!unit) throw new NotFoundError("Rumah tidak ditemukan.");
  if (!resident) throw new AppError("Warga tidak valid.", "VALIDATION", { residentId: "Warga tidak ditemukan." });
  const active = await prisma.residentUnitMembership.findFirst({ where: { unitId, residentId: data.residentId, endDate: null } });
  if (active) throw new AppError("Warga sudah tercatat sebagai penghuni aktif rumah ini.", "VALIDATION", { residentId: "Sudah menjadi penghuni aktif." });
  return prisma.$transaction(async (tx) => {
    const m = await tx.residentUnitMembership.create({
      data: { organizationId: ctx.organizationId, unitId, residentId: data.residentId, relation: data.relation, startDate: dateOnly(data.startDate), createdById: ctx.userId },
    });
    await writeAudit(ctx, { action: "UNIT_MEMBER_ADDED", module: "units", entityType: "ResidentialUnit", entityId: unitId, summary: `Menambah ${resident.fullName} sebagai penghuni ${unit.houseNumber}` }, tx);
    return m;
  });
}

/** Mengakhiri keanggotaan (pindah) — histori tetap tersimpan. */
export async function endMembership(ctx: AuthContext, membershipId: string, endDateIso: string) {
  assertCan(ctx, "units.manage");
  const m = await prisma.residentUnitMembership.findFirst({
    where: { id: membershipId, organizationId: ctx.organizationId, endDate: null },
    include: { resident: true, unit: true },
  });
  if (!m) throw new NotFoundError("Data penghuni aktif tidak ditemukan.");
  const end = dateOnly(endDateIso);
  if (end < m.startDate) throw new AppError("Tanggal selesai tidak boleh sebelum tanggal mulai.", "VALIDATION", { endDate: "Sebelum tanggal mulai." });
  await prisma.$transaction(async (tx) => {
    await tx.residentUnitMembership.update({ where: { id: m.id }, data: { endDate: end } });
    await writeAudit(ctx, { action: "UNIT_MEMBER_ENDED", module: "units", entityType: "ResidentialUnit", entityId: m.unitId, summary: `${m.resident.fullName} tidak lagi menghuni ${m.unit.houseNumber}` }, tx);
  });
}

export async function listUnits(ctx: AuthContext, f: { q?: string; occupancy?: string; page: number }, pageSize = 20) {
  assertCan(ctx, "units.view");
  const where: Prisma.ResidentialUnitWhereInput = { organizationId: ctx.organizationId };
  if (f.occupancy && ["PERMANENT", "TEMPORARY", "VACANT"].includes(f.occupancy)) where.occupancyStatus = f.occupancy as never;
  if (f.q) {
    const q = f.q.trim().slice(0, 60);
    where.OR = [
      { houseNumber: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
      { memberships: { some: { endDate: null, resident: { fullName: { contains: q, mode: "insensitive" } } } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.residentialUnit.findMany({
      where, orderBy: { houseNumber: "asc" }, ...pageParams(f.page, pageSize),
      include: {
        owner: { select: { id: true, fullName: true } },
        memberships: { where: { endDate: null }, select: { relation: true, resident: { select: { id: true, fullName: true } } } },
      },
    }),
    prisma.residentialUnit.count({ where }),
  ]);
  return { items, total };
}

export async function getUnit(ctx: AuthContext, id: string) {
  assertCan(ctx, "units.view");
  const unit = await prisma.residentialUnit.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      owner: { select: { id: true, fullName: true } },
      memberships: { include: { resident: { select: { id: true, fullName: true, code: true, status: true } } }, orderBy: [{ endDate: { sort: "asc", nulls: "first" } }, { startDate: "desc" }] },
    },
  });
  if (!unit) throw new NotFoundError("Rumah tidak ditemukan.");
  return unit;
}

export async function unitOptions(ctx: AuthContext) {
  assertCanAny(ctx, ["units.view", "residents.create", "security.visitors.manage", "ipl.manage"]);
  return prisma.residentialUnit.findMany({
    where: { organizationId: ctx.organizationId, isActive: true },
    select: { id: true, houseNumber: true, address: true },
    orderBy: { houseNumber: "asc" },
  });
}
