import { z } from "zod";
import type { BookingStatus, Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { assertCan, assertCanAny, can, type AuthContext } from "../auth/context";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { writeAudit } from "../audit";
import { nextNumber } from "../counters";
import { storeFile, type UploadInput } from "../storage";
import { isoDate, optionalText, pageParams, requiredText } from "../validation";
import { notifyPermissionHolders, notifyUser } from "./notifications";
import { dateOnly, jakartaDateTime, jakartaTime, minutesOfDay, todayDate, isoDateInJakarta } from "@/lib/dates";
import { daySlots, isFullyBooked, validateRange } from "@/lib/booking";
import { BOOKING_STATUS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

export const CONFLICT_MESSAGE = "Maaf, gedung sudah memiliki booking pada tanggal dan jam tersebut.";
export const PENDING_CONFLICT_MESSAGE = "Slot tersebut sedang diajukan warga lain dan belum dikonfirmasi. Silakan pilih jam lain.";

// ───────────────────────── Master fasilitas ─────────────────────────

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam HH:MM.");

export const facilitySchema = z.object({
  name: requiredText("Nama fasilitas", 100),
  description: optionalText(2000),
  location: optionalText(200),
  capacity: z.coerce.number().int().min(1).max(10000).optional().or(z.literal("").transform(() => undefined)),
  rules: optionalText(3000),
  fee: z.coerce.number().int().min(0, "Biaya tidak boleh negatif.").max(100_000_000).default(0),
  openTime: hhmm,
  closeTime: hhmm,
  slotMinutes: z.coerce.number().int().refine((v) => [30, 60, 90, 120, 180, 240].includes(v), "Pilih durasi slot yang tersedia."),
  isActive: z.boolean().default(true),
}).refine((d) => minutesOfDay(d.closeTime) > minutesOfDay(d.openTime), { message: "Jam tutup harus setelah jam buka.", path: ["closeTime"] });

export async function saveFacility(ctx: AuthContext, id: string | null, input: z.input<typeof facilitySchema>, photo: UploadInput | null) {
  assertCan(ctx, "facilities.manage");
  const data = facilitySchema.parse(input);
  const clash = await prisma.facility.findFirst({ where: { organizationId: ctx.organizationId, name: data.name, id: id ? { not: id } : undefined } });
  if (clash) throw new AppError("Nama fasilitas sudah ada.", "VALIDATION", { name: "Nama sudah dipakai." });
  return prisma.$transaction(async (tx) => {
    const file = photo ? await storeFile(tx, ctx.organizationId, photo, "facility", ctx.userId) : null;
    if (file && !file.mimeType.startsWith("image/")) throw new AppError("Foto harus JPG atau PNG.", "VALIDATION", { photo: "Harus gambar." });
    const payload = { ...data, capacity: data.capacity ?? null, ...(file ? { photoFileId: file.id } : {}) };
    let row;
    if (id) {
      const f = await tx.facility.findFirst({ where: { id, organizationId: ctx.organizationId } });
      if (!f) throw new NotFoundError("Fasilitas tidak ditemukan.");
      row = await tx.facility.update({ where: { id }, data: payload });
    } else {
      row = await tx.facility.create({ data: { ...payload, organizationId: ctx.organizationId } });
    }
    await writeAudit(ctx, { action: id ? "FACILITY_UPDATED" : "FACILITY_CREATED", module: "facilities", entityType: "Facility", entityId: row.id, summary: `${id ? "Mengubah" : "Menambah"} fasilitas ${row.name}` }, tx);
    return row;
  });
}

export async function listFacilities(ctx: AuthContext, includeInactive = false) {
  assertCanAny(ctx, ["facilities.view", "facilities.manage"]);
  return prisma.facility.findMany({
    where: { organizationId: ctx.organizationId, ...(includeInactive && can(ctx, "facilities.manage") ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
  });
}

// ───────────────────────── Ketersediaan ─────────────────────────

const ACTIVE: BookingStatus[] = ["PENDING", "APPROVED"];

function dayRange(isoDate: string) {
  return { from: jakartaDateTime(isoDate, "00:00"), to: new Date(jakartaDateTime(isoDate, "00:00").getTime() + 86_400_000) };
}

async function activeFacility(ctx: AuthContext, facilityId: string) {
  const f = await prisma.facility.findFirst({ where: { id: facilityId, organizationId: ctx.organizationId, isActive: true } });
  if (!f) throw new AppError("Fasilitas tidak ditemukan atau tidak aktif.", "VALIDATION", { facilityId: "Tidak valid." });
  return f;
}

const toMinutes = (d: Date) => minutesOfDay(jakartaTime(d));

/**
 * Ringkasan per hari dalam satu bulan untuk highlight kalender.
 * Identitas pemesan tidak dikirim di sini.
 */
export async function monthAvailability(ctx: AuthContext, facilityId: string, year: number, month: number) {
  assertCanAny(ctx, ["facilities.view", "facilities.manage"]);
  const f = await activeFacility(ctx, facilityId);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const from = jakartaDateTime(first, "00:00");
  const to = new Date(from.getTime() + days * 86_400_000);
  const bookings = await prisma.facilityBooking.findMany({
    where: { facilityId, status: { in: ACTIVE }, startAt: { lt: to }, endAt: { gt: from } },
    select: { startAt: true, endAt: true, status: true },
  });
  const slots = daySlots(f.openTime, f.closeTime, f.slotMinutes);
  const out: Record<string, { pending: number; approved: number; full: boolean }> = {};
  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const mine = bookings.filter((b) => isoDateInJakarta(b.startAt) === iso);
    if (!mine.length) continue;
    out[iso] = {
      pending: mine.filter((b) => b.status === "PENDING").length,
      approved: mine.filter((b) => b.status === "APPROVED").length,
      full: isFullyBooked(slots, mine.map((b) => ({ start: toMinutes(b.startAt), end: toMinutes(b.endAt) }))),
    };
  }
  return out;
}

/** Slot pada satu tanggal beserta statusnya. Nama pemesan hanya untuk pengurus. */
export async function dayAvailability(ctx: AuthContext, facilityId: string, isoDay: string) {
  assertCanAny(ctx, ["facilities.view", "facilities.manage"]);
  const f = await activeFacility(ctx, facilityId);
  dateOnly(isoDay);
  const { from, to } = dayRange(isoDay);
  const bookings = await prisma.facilityBooking.findMany({
    where: { facilityId, status: { in: ACTIVE }, startAt: { lt: to }, endAt: { gt: from } },
    select: { id: true, startAt: true, endAt: true, status: true, requesterUserId: true, resident: { select: { fullName: true } } },
    orderBy: { startAt: "asc" },
  });
  const staff = can(ctx, "facilities.manage");
  return {
    facility: { id: f.id, name: f.name, openTime: f.openTime, closeTime: f.closeTime, slotMinutes: f.slotMinutes, capacity: f.capacity },
    bookings: bookings.map((b) => ({
      id: staff || b.requesterUserId === ctx.userId ? b.id : null,
      start: jakartaTime(b.startAt), end: jakartaTime(b.endAt), status: b.status,
      mine: b.requesterUserId === ctx.userId,
      name: staff ? b.resident.fullName : null,
    })),
  };
}

// ───────────────────────── Booking ─────────────────────────

export const bookingSchema = z.object({
  facilityId: z.string().min(1, "Gedung wajib dipilih.").max(40),
  date: isoDate("Tanggal"),
  startTime: hhmm,
  endTime: hhmm,
  purpose: requiredText("Tujuan acara", 300),
  participants: z.coerce.number().int().min(1, "Minimal 1 peserta.").max(10000).optional().or(z.literal("").transform(() => undefined)),
  notes: optionalText(1000),
});

/** Kunci per fasilitas agar pengecekan konflik dan insert tidak berlomba. */
async function lockFacility(tx: Tx, facilityId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"facility:" + facilityId}))`;
}

async function findConflict(tx: Tx, facilityId: string, start: Date, end: Date, includePending: boolean, excludeId?: string) {
  return tx.facilityBooking.findFirst({
    where: {
      facilityId, id: excludeId ? { not: excludeId } : undefined,
      status: { in: includePending ? ACTIVE : ["APPROVED"] },
      startAt: { lt: end }, endAt: { gt: start },
    },
    orderBy: { status: "asc" }, // APPROVED dulu
  });
}

function isExclusionViolation(e: unknown) {
  return typeof e === "object" && e !== null && /facility_bookings_no_overlap|23P01/.test(String((e as { message?: string }).message ?? "") + String((e as { code?: string }).code ?? ""));
}

export async function createBooking(ctx: AuthContext, input: z.input<typeof bookingSchema>) {
  assertCan(ctx, "facilities.book");
  const data = bookingSchema.parse(input);
  if (!ctx.residentId) throw new AppError("Akun Anda belum terhubung dengan data warga. Hubungi pengurus.");
  const f = await activeFacility(ctx, data.facilityId);
  const rangeErr = validateRange({ start: minutesOfDay(data.startTime), end: minutesOfDay(data.endTime) }, f.openTime, f.closeTime, f.slotMinutes);
  if (rangeErr) throw new AppError(rangeErr, "VALIDATION", { startTime: rangeErr });
  const startAt = jakartaDateTime(data.date, data.startTime);
  const endAt = jakartaDateTime(data.date, data.endTime);
  if (startAt <= new Date()) throw new AppError("Waktu booking sudah lewat.", "VALIDATION", { date: "Pilih waktu yang akan datang." });
  if (dateOnly(data.date) > new Date(todayDate().getTime() + 180 * 86_400_000)) throw new AppError("Booking maksimal 180 hari ke depan.", "VALIDATION", { date: "Terlalu jauh." });
  if (f.capacity && data.participants && data.participants > f.capacity) {
    throw new AppError(`Jumlah peserta melebihi kapasitas (${f.capacity}).`, "VALIDATION", { participants: `Maksimal ${f.capacity}.` });
  }
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
  const resident = await prisma.resident.findUniqueOrThrow({ where: { id: ctx.residentId } });

  return prisma.$transaction(async (tx) => {
    await lockFacility(tx, f.id);
    const conflict = await findConflict(tx, f.id, startAt, endAt, org.holdPendingBookings);
    if (conflict) throw new ConflictError(conflict.status === "APPROVED" ? CONFLICT_MESSAGE : PENDING_CONFLICT_MESSAGE);
    const b = await tx.facilityBooking.create({
      data: {
        organizationId: ctx.organizationId, number: await nextNumber(tx, ctx.organizationId, "BKG"),
        facilityId: f.id, residentId: resident.id, requesterUserId: ctx.userId, startAt, endAt,
        purpose: data.purpose, participants: data.participants ?? null, notes: data.notes,
        histories: { create: { toStatus: "PENDING", actorId: ctx.userId, note: "Pengajuan dibuat" } },
      },
    });
    await writeAudit(ctx, {
      action: "BOOKING_SUBMITTED", module: "facilities", entityType: "FacilityBooking", entityId: b.id,
      summary: `Pengajuan booking ${f.name} ${data.date} ${data.startTime}–${data.endTime} oleh ${resident.fullName}`,
    }, tx);
    await notifyPermissionHolders(tx, ctx.organizationId, "facilities.manage", {
      type: "BOOKING_NEW", title: "Booking baru perlu direview", body: `${f.name} · ${data.date} ${data.startTime}–${data.endTime} · ${resident.fullName}`, link: `/booking/${b.id}`,
    }, ctx.userId);
    return b;
  });
}

async function lockBooking(tx: Tx, ctx: AuthContext, id: string) {
  const b = await tx.facilityBooking.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { facility: true, resident: { select: { fullName: true } } } });
  if (!b) throw new NotFoundError("Booking tidak ditemukan.");
  await lockFacility(tx, b.facilityId);
  return tx.facilityBooking.findUniqueOrThrow({ where: { id }, include: { facility: true, resident: { select: { fullName: true } } } });
}

const label = (b: { facility: { name: string }; startAt: Date; endAt: Date }) => `${b.facility.name} ${formatDateTime(b.startAt)}–${jakartaTime(b.endAt)}`;

export async function approveBooking(ctx: AuthContext, id: string, note?: string) {
  assertCan(ctx, "facilities.manage");
  try {
    return await prisma.$transaction(async (tx) => {
      const b = await lockBooking(tx, ctx, id);
      if (b.status !== "PENDING") throw new ConflictError("Booking ini sudah diputuskan.");
      if (await findConflict(tx, b.facilityId, b.startAt, b.endAt, false, b.id)) throw new ConflictError(CONFLICT_MESSAGE);
      const now = new Date();
      await tx.facilityBooking.update({
        where: { id }, data: { status: "APPROVED", adminNotes: note?.trim() || b.adminNotes, decidedAt: now, decidedById: ctx.userId, histories: { create: { fromStatus: "PENDING", toStatus: "APPROVED", note: note?.trim() || null, actorId: ctx.userId } } },
      });
      // Pengajuan lain yang bertabrakan otomatis ditolak (relevan bila slot tidak ditahan).
      const others = await tx.facilityBooking.findMany({ where: { facilityId: b.facilityId, status: "PENDING", id: { not: id }, startAt: { lt: b.endAt }, endAt: { gt: b.startAt } } });
      for (const o of others) {
        await tx.facilityBooking.update({ where: { id: o.id }, data: { status: "REJECTED", adminNotes: "Slot telah disetujui untuk pengajuan lain.", decidedAt: now, decidedById: ctx.userId, histories: { create: { fromStatus: "PENDING", toStatus: "REJECTED", note: "Otomatis: slot telah disetujui untuk pengajuan lain", actorId: ctx.userId } } } });
        await notifyUser(tx, ctx.organizationId, o.requesterUserId, { type: "BOOKING_REJECTED", title: "Booking ditolak", body: `${b.facility.name}: slot telah disetujui untuk pengajuan lain.`, link: `/booking/${o.id}` });
      }
      await writeAudit(ctx, { action: "BOOKING_APPROVED", module: "facilities", entityType: "FacilityBooking", entityId: id, summary: `Menyetujui booking ${b.number} (${label(b)}) — ${b.resident.fullName}`, metadata: { autoRejected: others.length } }, tx);
      await notifyUser(tx, ctx.organizationId, b.requesterUserId, { type: "BOOKING_APPROVED", title: "Booking disetujui", body: label(b), link: `/booking/${id}` });
      await notifyPermissionHolders(tx, ctx.organizationId, "facilities.manage", { type: "BOOKING_APPROVED", title: "Booking disetujui", body: `${label(b)} — ${b.resident.fullName}`, link: `/booking/${id}` }, ctx.userId);
    });
  } catch (e) {
    if (isExclusionViolation(e)) throw new ConflictError(CONFLICT_MESSAGE);
    throw e;
  }
}

export async function rejectBooking(ctx: AuthContext, id: string, reason: string) {
  assertCan(ctx, "facilities.manage");
  if (!reason?.trim()) throw new AppError("Alasan penolakan wajib diisi.", "VALIDATION", { reason: "Alasan wajib diisi." });
  return prisma.$transaction(async (tx) => {
    const b = await lockBooking(tx, ctx, id);
    if (b.status !== "PENDING") throw new ConflictError("Booking ini sudah diputuskan.");
    await tx.facilityBooking.update({ where: { id }, data: { status: "REJECTED", adminNotes: reason.trim(), decidedAt: new Date(), decidedById: ctx.userId, histories: { create: { fromStatus: "PENDING", toStatus: "REJECTED", note: reason.trim(), actorId: ctx.userId } } } });
    await writeAudit(ctx, { action: "BOOKING_REJECTED", module: "facilities", entityType: "FacilityBooking", entityId: id, summary: `Menolak booking ${b.number} (${label(b)})`, metadata: { reason } }, tx);
    await notifyUser(tx, ctx.organizationId, b.requesterUserId, { type: "BOOKING_REJECTED", title: "Booking ditolak", body: `${label(b)}: ${reason.trim()}`, link: `/booking/${id}` });
    await notifyPermissionHolders(tx, ctx.organizationId, "facilities.manage", { type: "BOOKING_REJECTED", title: "Booking ditolak", body: `${label(b)} — ${b.resident.fullName}`, link: `/booking/${id}` }, ctx.userId);
  });
}

/** Pemohon membatalkan miliknya (Menunggu/Disetujui yang belum lewat); pengurus dapat membatalkan dengan alasan. */
export async function cancelBooking(ctx: AuthContext, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const b = await lockBooking(tx, ctx, id);
    const owner = b.requesterUserId === ctx.userId;
    const staff = can(ctx, "facilities.manage");
    if (!owner && !staff) throw new NotFoundError("Booking tidak ditemukan.");
    if (!["PENDING", "APPROVED"].includes(b.status)) throw new ConflictError("Booking ini tidak dapat dibatalkan.");
    if (b.endAt <= new Date()) throw new ConflictError("Booking yang sudah lewat tidak dapat dibatalkan.");
    if (!owner && !reason?.trim()) throw new AppError("Alasan pembatalan wajib diisi.", "VALIDATION", { reason: "Alasan wajib diisi." });
    await tx.facilityBooking.update({ where: { id }, data: { status: "CANCELLED", histories: { create: { fromStatus: b.status, toStatus: "CANCELLED", note: reason?.trim() || "Dibatalkan pemohon", actorId: ctx.userId } } } });
    await writeAudit(ctx, { action: "BOOKING_CANCELLED", module: "facilities", entityType: "FacilityBooking", entityId: id, summary: `Membatalkan booking ${b.number} (${label(b)})` }, tx);
    if (owner) {
      await notifyPermissionHolders(tx, ctx.organizationId, "facilities.manage", { type: "BOOKING_CANCELLED", title: "Booking dibatalkan pemohon", body: `${label(b)} — ${b.resident.fullName}`, link: `/booking/${id}` }, ctx.userId);
    } else {
      await notifyUser(tx, ctx.organizationId, b.requesterUserId, { type: "BOOKING_CANCELLED", title: "Booking dibatalkan pengurus", body: `${label(b)}: ${reason.trim()}`, link: `/booking/${id}` });
    }
  });
}

export async function listBookings(ctx: AuthContext, f: { status?: string; facilityId?: string; q?: string; page: number; own?: boolean; upcoming?: boolean }, pageSize = 20) {
  const where: Prisma.FacilityBookingWhereInput = { organizationId: ctx.organizationId };
  if (f.own || !can(ctx, "facilities.manage")) {
    assertCan(ctx, "facilities.book");
    where.requesterUserId = ctx.userId;
  }
  if (f.status && f.status in BOOKING_STATUS) where.status = f.status as BookingStatus;
  if (f.facilityId) where.facilityId = f.facilityId;
  if (f.upcoming) where.endAt = { gte: new Date() };
  if (f.q && !where.requesterUserId) {
    const q = f.q.trim().slice(0, 60);
    where.OR = [{ number: { contains: q, mode: "insensitive" } }, { resident: { fullName: { contains: q, mode: "insensitive" } } }, { purpose: { contains: q, mode: "insensitive" } }];
  }
  const [items, total] = await Promise.all([
    prisma.facilityBooking.findMany({
      where, orderBy: f.status === "PENDING" ? { startAt: "asc" } : { startAt: "desc" }, ...pageParams(f.page, pageSize),
      include: { facility: { select: { name: true } }, resident: { select: { fullName: true } } },
    }),
    prisma.facilityBooking.count({ where }),
  ]);
  return { items, total };
}

export async function getBooking(ctx: AuthContext, id: string) {
  const staff = can(ctx, "facilities.manage");
  const b = await prisma.facilityBooking.findFirst({
    where: { id, organizationId: ctx.organizationId, ...(staff ? {} : { requesterUserId: ctx.userId }) },
    include: {
      facility: true,
      resident: { select: { fullName: true, phone: true, memberships: { where: { endDate: null }, select: { unit: { select: { houseNumber: true, address: true } } } } } },
      histories: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!b) throw new NotFoundError("Booking tidak ditemukan.");
  const ids = [...new Set(b.histories.map((h) => h.actorId).filter(Boolean))] as string[];
  const actors = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return { ...b, isOwner: b.requesterUserId === ctx.userId, canManage: staff, actorNames: Object.fromEntries(actors.map((a) => [a.id, a.name])), date: isoDateInJakarta(b.startAt) };
}
