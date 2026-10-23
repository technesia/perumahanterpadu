import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { assertCan, assertCanAny, can, type AuthContext } from "../auth/context";
import { AppError, NotFoundError } from "../errors";
import { writeAudit } from "../audit";
import { optionalText, pageParams, requiredText, rupiahSchema } from "../validation";
import { todayDate } from "@/lib/dates";
import {
  arrearsWindow, billDisplayStatus, comparePeriod, dueDateFor, isArrears, OPENING_KINDS, outstanding, periodIndex, periodsBetween,
  type Period,
} from "@/lib/ipl";
import { periodLabel } from "@/lib/format";

export const PENDING_PAYMENT_STATUSES = ["PENDING_VERIFICATION", "AWAITING_PROVIDER"] as const;

export function currentPeriod(today = todayDate()): Period {
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
}

async function windowFor(organizationId: string, ref?: Period) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return arrearsWindow(ref ?? currentPeriod(), org.arrearsWindowMonths);
}

/** Filter Prisma untuk periode di dalam jendela (inklusif). */
function periodRangeWhere(start: Period, end: Period): Prisma.IplBillWhereInput {
  return {
    AND: [
      { OR: [{ periodYear: { gt: start.year } }, { periodYear: start.year, periodMonth: { gte: start.month } }] },
      { OR: [{ periodYear: { lt: end.year } }, { periodYear: end.year, periodMonth: { lte: end.month } }] },
    ],
  };
}

/**
 * Periode di dalam jendela pelacakan, ATAU tunggakan awal (selalu dilacak berapa pun umurnya,
 * termasuk tunggakan awal tanpa rincian periode yang memakai periode 0/0).
 */
function trackedPeriodWhere(start: Period, end: Period): Prisma.IplBillWhereInput {
  return { OR: [periodRangeWhere(start, end), { kind: { in: [...OPENING_KINDS] } }] };
}

const noPendingAllocation: Prisma.IplBillWhereInput = {
  allocations: { none: { payment: { status: { in: [...PENDING_PAYMENT_STATUSES] } } } },
};

/** Where untuk tagihan yang terhitung tunggakan (lewat jatuh tempo, belum lunas, tidak sedang diverifikasi). */
export function arrearsWhere(organizationId: string, start: Period, end: Period, today = todayDate()): Prisma.IplBillWhereInput {
  return {
    organizationId,
    status: { in: ["UNPAID", "PARTIAL"] },
    dueDate: { lt: today },
    ...noPendingAllocation,
    AND: [trackedPeriodWhere(start, end)],
  };
}

// ───────────────────────── Master IPL ─────────────────────────

export const iplTypeSchema = z.object({
  name: requiredText("Nama jenis iuran", 80),
  amount: rupiahSchema("Nominal"),
  dueDay: z.coerce.number().int().min(1, "Tanggal jatuh tempo 1–28.").max(28, "Tanggal jatuh tempo 1–28."),
  isActive: z.boolean().default(true),
  description: optionalText(500),
});

export async function listIplTypes(ctx: AuthContext) {
  assertCanAny(ctx, ["ipl.manage", "ipl.view"]);
  return prisma.iplType.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
}

export async function saveIplType(ctx: AuthContext, id: string | null, input: z.input<typeof iplTypeSchema>) {
  assertCan(ctx, "ipl.manage");
  const data = iplTypeSchema.parse(input);
  const clash = await prisma.iplType.findFirst({ where: { organizationId: ctx.organizationId, name: data.name, id: id ? { not: id } : undefined } });
  if (clash) throw new AppError("Nama jenis iuran sudah ada.", "VALIDATION", { name: "Nama sudah dipakai." });
  return prisma.$transaction(async (tx) => {
    let row;
    if (id) {
      const existing = await tx.iplType.findFirst({ where: { id, organizationId: ctx.organizationId } });
      if (!existing) throw new NotFoundError();
      // Mengubah nominal master tidak mengubah tagihan yang sudah terbit.
      row = await tx.iplType.update({ where: { id }, data: { ...data, updatedById: ctx.userId } });
    } else {
      row = await tx.iplType.create({ data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId, updatedById: ctx.userId } });
    }
    await writeAudit(ctx, {
      action: id ? "IPL_TYPE_UPDATED" : "IPL_TYPE_CREATED", module: "ipl", entityType: "IplType", entityId: row.id,
      summary: `${id ? "Mengubah" : "Menambah"} jenis iuran ${row.name} (Rp${row.amount.toLocaleString("id-ID")})`,
    }, tx);
    return row;
  });
}

// ───────────────────────── Penerbitan tagihan ─────────────────────────

export const generateBillsSchema = z.object({
  iplTypeId: z.string().min(1, "Jenis iuran wajib dipilih.").max(40),
  fromYear: z.coerce.number().int().min(2000).max(2100),
  fromMonth: z.coerce.number().int().min(1).max(12),
  toYear: z.coerce.number().int().min(2000).max(2100),
  toMonth: z.coerce.number().int().min(1).max(12),
  unitIds: z.array(z.string().max(40)).max(1000).optional(),
});

/**
 * Menerbitkan tagihan untuk semua rumah aktif (bukan "Kosong") pada rentang periode.
 * Idempoten: tagihan yang sudah ada (rumah + jenis + periode) dilewati oleh unique constraint.
 */
export async function generateBills(ctx: AuthContext, input: z.input<typeof generateBillsSchema>) {
  assertCan(ctx, "ipl.manage");
  const data = generateBillsSchema.parse(input);
  const from = { year: data.fromYear, month: data.fromMonth };
  const to = { year: data.toYear, month: data.toMonth };
  if (comparePeriod(from, to) > 0) throw new AppError("Periode awal harus sebelum periode akhir.", "VALIDATION", { fromMonth: "Periode awal setelah periode akhir." });
  const window = await windowFor(ctx.organizationId);
  if (comparePeriod(from, window.start) < 0) {
    throw new AppError(`Periode paling awal yang dapat ditagihkan adalah ${periodLabel(window.start.year, window.start.month)}.`, "VALIDATION", { fromMonth: "Di luar jendela pelacakan." });
  }
  const maxFuture = { ...currentPeriod(), year: currentPeriod().year + 1 };
  if (comparePeriod(to, maxFuture) > 0) throw new AppError("Tagihan hanya dapat diterbitkan maksimal 12 bulan ke depan.", "VALIDATION", { toMonth: "Terlalu jauh ke depan." });

  const type = await prisma.iplType.findFirst({ where: { id: data.iplTypeId, organizationId: ctx.organizationId, isActive: true } });
  if (!type) throw new AppError("Jenis iuran tidak ditemukan atau tidak aktif.", "VALIDATION", { iplTypeId: "Tidak valid." });

  const units = await prisma.residentialUnit.findMany({
    where: {
      organizationId: ctx.organizationId, isActive: true, occupancyStatus: { not: "VACANT" },
      ...(data.unitIds?.length ? { id: { in: data.unitIds } } : {}),
    },
    select: {
      id: true, ownerResidentId: true,
      memberships: { where: { endDate: null }, select: { residentId: true, relation: true } },
    },
  });
  const periods = periodsBetween(from, to);
  // Periode yang sudah tercatat sebagai tunggakan awal (jenis iuran apa pun) tidak ditagihkan lagi.
  const opening = await prisma.iplBill.findMany({
    where: {
      organizationId: ctx.organizationId, kind: "OPENING_PERIOD", status: { not: "VOID" },
      unitId: { in: units.map((u) => u.id) }, ...periodRangeWhere(from, to),
    },
    select: { unitId: true, periodYear: true, periodMonth: true },
  });
  const openingKeys = new Set(opening.map((o) => `${o.unitId}:${o.periodYear}:${o.periodMonth}`));
  let skippedOpening = 0;
  const rows: Prisma.IplBillCreateManyInput[] = [];
  for (const u of units) {
    const responsible = u.memberships.find((m) => m.relation === "HEAD")?.residentId
      ?? u.memberships.find((m) => m.relation === "TENANT")?.residentId
      ?? u.memberships[0]?.residentId ?? u.ownerResidentId ?? null;
    for (const p of periods) {
      if (openingKeys.has(`${u.id}:${p.year}:${p.month}`)) { skippedOpening++; continue; }
      rows.push({
        organizationId: ctx.organizationId, unitId: u.id, residentId: responsible, iplTypeId: type.id,
        periodYear: p.year, periodMonth: p.month, amount: type.amount, dueDate: dueDateFor(p, type.dueDay), createdById: ctx.userId,
      });
    }
  }
  return prisma.$transaction(async (tx) => {
    const res = rows.length ? await tx.iplBill.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
    await writeAudit(ctx, {
      action: "IPL_BILLS_GENERATED", module: "ipl", entityType: "IplType", entityId: type.id,
      summary: `Menerbitkan ${res.count} tagihan ${type.name} periode ${periodLabel(from.year, from.month)} – ${periodLabel(to.year, to.month)}`,
      metadata: { created: res.count, skipped: rows.length - res.count + skippedOpening, skippedOpening, units: units.length },
    }, tx);
    return { created: res.count, skipped: rows.length - res.count + skippedOpening, skippedOpening, units: units.length, periods: periods.length };
  });
}

export async function voidBill(ctx: AuthContext, billId: string, reason: string) {
  assertCan(ctx, "ipl.manage");
  if (!reason.trim()) throw new AppError("Alasan pembatalan wajib diisi.", "VALIDATION", { reason: "Alasan wajib diisi." });
  await prisma.$transaction(async (tx) => {
    const [bill] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ipl_bills WHERE id = ${billId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    if (!bill) throw new NotFoundError("Tagihan tidak ditemukan.");
    const b = await tx.iplBill.findUniqueOrThrow({ where: { id: billId }, include: { allocations: { include: { payment: true } } } });
    if (b.kind !== "REGULAR") throw new AppError("Tunggakan awal dibatalkan atau dikoreksi melalui menu Tunggakan Awal agar tercatat riwayat koreksinya.");
    if (b.status !== "UNPAID" || b.paidAmount > 0) throw new AppError("Hanya tagihan yang belum dibayar sama sekali yang dapat dibatalkan.");
    if (b.allocations.some((a) => (PENDING_PAYMENT_STATUSES as readonly string[]).includes(a.payment.status))) {
      throw new AppError("Tagihan sedang dalam proses verifikasi pembayaran.");
    }
    await tx.iplBill.update({ where: { id: billId }, data: { status: "VOID" } });
    await writeAudit(ctx, {
      action: "IPL_BILL_VOIDED", module: "ipl", entityType: "IplBill", entityId: billId,
      summary: `Membatalkan tagihan periode ${periodLabel(b.periodYear, b.periodMonth)}`, metadata: { reason },
    }, tx);
  });
}

// ───────────────────────── Query tagihan ─────────────────────────

type BillWithPending = Prisma.IplBillGetPayload<{
  include: { iplType: { select: { name: true } }; unit: { select: { id: true; houseNumber: true; address: true } }; allocations: { select: { amount: true; payment: { select: { status: true } } } } };
}>;

const billInclude = {
  iplType: { select: { name: true } },
  unit: { select: { id: true, houseNumber: true, address: true } },
  allocations: { select: { amount: true, payment: { select: { status: true } } } },
} as const;

export function decorateBill(b: BillWithPending, today = todayDate()) {
  const pendingAmount = b.allocations
    .filter((a) => (PENDING_PAYMENT_STATUSES as readonly string[]).includes(a.payment.status))
    .reduce((s, a) => s + a.amount, 0);
  return {
    id: b.id, unitId: b.unitId, unit: b.unit, typeName: b.iplType.name, kind: b.kind,
    periodYear: b.periodYear, periodMonth: b.periodMonth, amount: b.amount, paidAmount: b.paidAmount,
    outstanding: outstanding(b), dueDate: b.dueDate, pendingAmount,
    displayStatus: billDisplayStatus(b, pendingAmount, today),
    arrears: isArrears(b, pendingAmount, today),
  };
}
export type DecoratedBill = ReturnType<typeof decorateBill>;

export interface BillFilter { q?: string; status?: string; year?: number; month?: number; page: number }

export async function listBills(ctx: AuthContext, f: BillFilter, pageSize = 30) {
  assertCan(ctx, "ipl.view");
  const today = todayDate();
  const where: Prisma.IplBillWhereInput = { organizationId: ctx.organizationId };
  if (f.year) where.periodYear = f.year;
  if (f.month) where.periodMonth = f.month;
  if (f.q) {
    const q = f.q.trim().slice(0, 60);
    where.OR = [
      { unit: { houseNumber: { contains: q, mode: "insensitive" } } },
      { resident: { fullName: { contains: q, mode: "insensitive" } } },
    ];
  }
  const pendingRel = { allocations: { some: { payment: { status: { in: [...PENDING_PAYMENT_STATUSES] } } } } };
  switch (f.status) {
    case "PAID": where.status = "PAID"; break;
    case "VOID": where.status = "VOID"; break;
    case "PENDING": Object.assign(where, { status: { in: ["UNPAID", "PARTIAL"] }, ...pendingRel }); break;
    case "PARTIAL": Object.assign(where, { status: "PARTIAL", ...noPendingAllocation }); break;
    case "NOT_DUE": Object.assign(where, { status: "UNPAID", dueDate: { gte: today }, ...noPendingAllocation }); break;
    case "UNPAID": Object.assign(where, { status: "UNPAID", dueDate: { lt: today }, ...noPendingAllocation }); break;
  }
  const [rows, total] = await Promise.all([
    prisma.iplBill.findMany({
      where, include: { ...billInclude, resident: { select: { fullName: true } } },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { unit: { houseNumber: "asc" } }],
      ...pageParams(f.page, pageSize),
    }),
    prisma.iplBill.count({ where }),
  ]);
  return { items: rows.map((r) => ({ ...decorateBill(r, today), residentName: r.resident?.fullName ?? null })), total };
}

/** Rumah aktif milik warga (via keanggotaan aktif). */
export async function residentUnits(organizationId: string, residentId: string) {
  const ms = await prisma.residentUnitMembership.findMany({
    where: { organizationId, residentId, endDate: null },
    select: { unit: { select: { id: true, houseNumber: true, address: true } } },
  });
  return ms.map((m) => m.unit);
}

/**
 * Tagihan sebuah rumah di dalam jendela pelacakan + ringkasan tunggakan.
 * Akses: ipl.view, ipl.payment_record, atau warga penghuni aktif rumah tersebut.
 */
export async function unitBills(ctx: AuthContext, unitId: string) {
  const isStaff = can(ctx, "ipl.view") || can(ctx, "ipl.payment_record");
  if (!isStaff) {
    assertCan(ctx, "ipl.self_view");
    const mine = ctx.residentId ? await residentUnits(ctx.organizationId, ctx.residentId) : [];
    if (!mine.some((u) => u.id === unitId)) throw new NotFoundError("Data tagihan tidak ditemukan.");
  }
  const window = await windowFor(ctx.organizationId);
  const today = todayDate();
  const bills = await prisma.iplBill.findMany({
    where: { organizationId: ctx.organizationId, unitId, status: { not: "VOID" }, ...trackedPeriodWhere(window.start, addFuture(window.end)) },
    include: billInclude,
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
  });
  const items = bills.map((b) => decorateBill(b, today));
  return { window, items, summary: summarize(items) };
}

function addFuture(p: Period): Period {
  return { year: p.year + 1, month: p.month };
}

export function summarize(items: DecoratedBill[]) {
  const arrears = items.filter((i) => i.arrears);
  return {
    arrearsCount: arrears.length,
    arrearsAmount: arrears.reduce((s, i) => s + i.outstanding, 0),
    arrearsPeriods: arrears.map((i) => ({ year: i.periodYear, month: i.periodMonth, typeName: i.typeName, amount: i.outstanding })),
    pendingCount: items.filter((i) => i.displayStatus === "PENDING").length,
    payable: items.filter((i) => i.displayStatus === "UNPAID" || i.displayStatus === "PARTIAL" || i.displayStatus === "NOT_DUE"),
  };
}

/** Ringkasan tagihan untuk warga yang sedang login (semua rumahnya). */
export async function myBills(ctx: AuthContext) {
  assertCan(ctx, "ipl.self_view");
  if (!ctx.residentId) return { units: [] as Awaited<ReturnType<typeof residentUnits>>, items: [] as DecoratedBill[], summary: summarize([]) };
  const units = await residentUnits(ctx.organizationId, ctx.residentId);
  const all: DecoratedBill[] = [];
  for (const u of units) all.push(...(await unitBills(ctx, u.id)).items);
  all.sort((a, b) => periodIndex({ year: a.periodYear, month: a.periodMonth }) - periodIndex({ year: b.periodYear, month: b.periodMonth }));
  return { units, items: all, summary: summarize(all) };
}

// ───────────────────────── IPL Belum Bayar ─────────────────────────

export interface UnpaidFilter { q?: string; occupancy?: string; year?: number; month?: number; minMonths?: number; page: number }

export async function unpaidSummary(ctx: AuthContext) {
  assertCan(ctx, "ipl.view");
  const window = await windowFor(ctx.organizationId);
  const where = arrearsWhere(ctx.organizationId, window.start, window.end);
  const [agg, units, pending] = await Promise.all([
    prisma.iplBill.aggregate({ where, _count: { _all: true }, _sum: { amount: true, paidAmount: true } }),
    prisma.iplBill.groupBy({ by: ["unitId"], where }),
    prisma.iplPayment.count({ where: { organizationId: ctx.organizationId, status: { in: [...PENDING_PAYMENT_STATUSES] } } }),
  ]);
  return {
    unitsInArrears: units.length,
    periods: agg._count._all,
    amount: (agg._sum.amount ?? 0) - (agg._sum.paidAmount ?? 0),
    pendingPayments: pending,
    window,
  };
}

export async function unpaidList(ctx: AuthContext, f: UnpaidFilter, pageSize = 20) {
  assertCan(ctx, "ipl.view");
  const window = await windowFor(ctx.organizationId);
  const where: Prisma.IplBillWhereInput = arrearsWhere(ctx.organizationId, window.start, window.end);
  if (f.year) where.periodYear = f.year;
  if (f.month) where.periodMonth = f.month;
  const unitWhere: Prisma.ResidentialUnitWhereInput = {};
  if (f.occupancy && ["PERMANENT", "TEMPORARY", "VACANT"].includes(f.occupancy)) unitWhere.occupancyStatus = f.occupancy as never;
  if (f.q) {
    const q = f.q.trim().slice(0, 60);
    unitWhere.OR = [
      { houseNumber: { contains: q, mode: "insensitive" } },
      { memberships: { some: { endDate: null, resident: { fullName: { contains: q, mode: "insensitive" } } } } },
    ];
  }
  if (Object.keys(unitWhere).length) where.unit = unitWhere;

  const minMonths = Math.max(1, f.minMonths ?? 1);
  const groups = await prisma.iplBill.groupBy({
    by: ["unitId"], where,
    _count: { _all: true }, _sum: { amount: true, paidAmount: true },
    having: { unitId: { _count: { gte: minMonths } } },
    orderBy: { _sum: { amount: "desc" } },
  });
  const total = groups.length;
  const page = groups.slice((f.page - 1) * pageSize, f.page * pageSize);
  const unitIds = page.map((g) => g.unitId);
  const [units, bills] = await Promise.all([
    prisma.residentialUnit.findMany({
      where: { id: { in: unitIds } },
      select: {
        id: true, houseNumber: true, address: true, occupancyStatus: true,
        memberships: { where: { endDate: null }, select: { relation: true, resident: { select: { id: true, fullName: true, phone: true, occupancyStatus: true } } } },
      },
    }),
    prisma.iplBill.findMany({
      where: { ...where, unitId: { in: unitIds } }, include: billInclude,
      orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
    }),
  ]);
  const unitMap = new Map(units.map((u) => [u.id, u]));
  const today = todayDate();
  const pendingByUnit = await prisma.iplPayment.groupBy({
    by: ["unitId"], where: { organizationId: ctx.organizationId, unitId: { in: unitIds }, status: { in: [...PENDING_PAYMENT_STATUSES] } }, _count: { _all: true },
  });
  const pendingMap = new Map(pendingByUnit.map((p) => [p.unitId, p._count._all]));
  const items = page.map((g) => {
    const u = unitMap.get(g.unitId)!;
    const head = u.memberships.find((m) => m.relation === "HEAD") ?? u.memberships[0];
    return {
      unit: { id: u.id, houseNumber: u.houseNumber, address: u.address, occupancyStatus: u.occupancyStatus },
      resident: head?.resident ?? null,
      months: g._count._all,
      amount: (g._sum.amount ?? 0) - (g._sum.paidAmount ?? 0),
      pendingPayments: pendingMap.get(g.unitId) ?? 0,
      bills: bills.filter((b) => b.unitId === g.unitId).map((b) => decorateBill(b, today)),
    };
  });
  return { items, total, window };
}

/** Rekap tunggakan per periode di dalam jendela pelacakan. */
export async function arrearsByPeriod(ctx: AuthContext) {
  assertCan(ctx, "ipl.view");
  const window = await windowFor(ctx.organizationId);
  const rows = await prisma.iplBill.groupBy({
    by: ["periodYear", "periodMonth"],
    where: arrearsWhere(ctx.organizationId, window.start, window.end),
    _count: { _all: true }, _sum: { amount: true, paidAmount: true },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });
  return {
    window,
    rows: rows.map((r) => ({ year: r.periodYear, month: r.periodMonth, units: r._count._all, amount: (r._sum.amount ?? 0) - (r._sum.paidAmount ?? 0) })),
  };
}
