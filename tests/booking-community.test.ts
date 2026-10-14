import { beforeAll, describe, expect, it } from "vitest";
import { ensureSeed, makeHousehold, makeUser, prisma, uniq } from "./helpers";
import {
  approveBooking, cancelBooking, CONFLICT_MESSAGE, createBooking, dayAvailability, getBooking, listBookings, monthAvailability,
  PENDING_CONFLICT_MESSAGE, rejectBooking, saveFacility,
} from "@/server/services/facilities";
import { getAnnouncement, listAnnouncements, listBusinesses, saveAnnouncement, saveBusiness } from "@/server/services/community";
import { daySlots, isFullyBooked, overlaps, validateRange } from "@/lib/booking";
import { todayDate, toIsoDate } from "@/lib/dates";
import { ForbiddenError, NotFoundError } from "@/server/errors";

beforeAll(ensureSeed);

/** Tanggal N hari ke depan (WIB). */
const day = (n: number) => toIsoDate(new Date(todayDate().getTime() + n * 86_400_000));

async function setup() {
  const { ctx: admin } = await makeUser("ADMIN");
  const fac = await saveFacility(admin, null, { name: uniq("Balai Warga "), openTime: "08:00", closeTime: "22:00", slotMinutes: 60, fee: 0, capacity: 100, isActive: true }, null);
  const a = await makeHousehold({ withAccount: true });
  const b = await makeHousehold({ withAccount: true });
  return { admin, fac, a: a.member!, b: b.member! };
}
const req = (facilityId: string, date: string, startTime: string, endTime: string) => ({ facilityId, date, startTime, endTime, purpose: "Arisan RT" });

describe("Logika slot", () => {
  it("tumpang tindih & slot", () => {
    expect(overlaps({ start: 600, end: 720 }, { start: 660, end: 780 })).toBe(true);
    expect(overlaps({ start: 600, end: 720 }, { start: 720, end: 780 })).toBe(false); // bersebelahan boleh
    expect(daySlots("08:00", "12:00", 60)).toHaveLength(4);
    expect(validateRange({ start: 7 * 60, end: 9 * 60 }, "08:00", "22:00", 60)).toMatch(/operasional/);
    expect(validateRange({ start: 8 * 60 + 30, end: 10 * 60 }, "08:00", "22:00", 60)).toMatch(/slot/);
    const slots = daySlots("08:00", "10:00", 60);
    expect(isFullyBooked(slots, [{ start: 480, end: 540 }])).toBe(false);
    expect(isFullyBooked(slots, [{ start: 480, end: 600 }])).toBe(true);
  });
});

describe("Booking gedung (#31–#38)", () => {
  it("booking baru berstatus Menunggu Review dan Admin mendapat notifikasi (#32, #33)", async () => {
    const s = await setup();
    const bk = await createBooking(s.a.ctx, req(s.fac.id, day(3), "09:00", "11:00"));
    expect(bk.status).toBe("PENDING");
    expect(await prisma.notification.count({ where: { userId: s.admin.userId, type: "BOOKING_NEW", link: `/booking/${bk.id}` } })).toBe(1);
  });

  it("kalender menampilkan slot yang sedang direview tanpa membocorkan identitas (#34, #38)", async () => {
    const s = await setup();
    await createBooking(s.a.ctx, req(s.fac.id, day(4), "13:00", "15:00"));
    const [y, m] = day(4).split("-").map(Number);
    const month = await monthAvailability(s.b.ctx, s.fac.id, y, m);
    expect(month[day(4)]).toMatchObject({ pending: 1, approved: 0, full: false });
    const d = await dayAvailability(s.b.ctx, s.fac.id, day(4));
    expect(d.bookings).toHaveLength(1);
    expect(d.bookings[0]).toMatchObject({ start: "13:00", end: "15:00", status: "PENDING", name: null, id: null, mine: false });
    const asAdmin = await dayAvailability(s.admin, s.fac.id, day(4));
    expect(asAdmin.bookings[0].name).not.toBeNull();
    expect(JSON.stringify(d)).not.toContain("0812");
  });

  it("booking bertabrakan ditolak backend; jam berbeda tetap boleh (#35, #36)", async () => {
    const s = await setup();
    const first = await createBooking(s.a.ctx, req(s.fac.id, day(5), "10:00", "12:00"));
    await expect(createBooking(s.b.ctx, req(s.fac.id, day(5), "11:00", "13:00"))).rejects.toThrow(PENDING_CONFLICT_MESSAGE);
    await approveBooking(s.admin, first.id);
    await expect(createBooking(s.b.ctx, req(s.fac.id, day(5), "09:00", "11:00"))).rejects.toThrow(CONFLICT_MESSAGE);
    const ok = await createBooking(s.b.ctx, req(s.fac.id, day(5), "12:00", "14:00")); // bersebelahan
    expect(ok.status).toBe("PENDING");
  });

  it("pengajuan bersamaan pada slot sama: hanya satu berhasil", async () => {
    const s = await setup();
    const r = await Promise.allSettled([
      createBooking(s.a.ctx, req(s.fac.id, day(6), "15:00", "17:00")),
      createBooking(s.b.ctx, req(s.fac.id, day(6), "16:00", "18:00")),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("database menolak dua booking DISETUJUI yang bertabrakan (exclusion constraint)", async () => {
    const s = await setup();
    const base = { organizationId: s.admin.organizationId, facilityId: s.fac.id, purpose: "x", status: "APPROVED" as const };
    const res = await prisma.resident.findFirstOrThrow({ where: { userId: s.a.user.id } });
    const start = new Date(`${day(7)}T03:00:00Z`);
    await prisma.facilityBooking.create({ data: { ...base, number: uniq("B"), residentId: res.id, requesterUserId: s.a.user.id, startAt: start, endAt: new Date(start.getTime() + 7200_000) } });
    await expect(prisma.facilityBooking.create({ data: { ...base, number: uniq("B"), residentId: res.id, requesterUserId: s.a.user.id, startAt: new Date(start.getTime() + 3600_000), endAt: new Date(start.getTime() + 10800_000) } })).rejects.toThrow();
  });

  it("tanpa penahanan slot: dua pengajuan boleh, persetujuan satu menolak yang lain otomatis", async () => {
    const s = await setup();
    await prisma.organization.update({ where: { id: s.admin.organizationId }, data: { holdPendingBookings: false } });
    try {
      const x = await createBooking(s.a.ctx, req(s.fac.id, day(8), "10:00", "12:00"));
      const y = await createBooking(s.b.ctx, req(s.fac.id, day(8), "11:00", "12:00"));
      await approveBooking(s.admin, x.id);
      expect((await getBooking(s.b.ctx, y.id)).status).toBe("REJECTED");
      await expect(approveBooking(s.admin, y.id)).rejects.toThrow(/sudah diputuskan/);
    } finally {
      await prisma.organization.update({ where: { id: s.admin.organizationId }, data: { holdPendingBookings: true } });
    }
  });

  it("status booking memperbarui kalender; penolakan/pembatalan melepaskan slot (#37)", async () => {
    const s = await setup();
    const bk = await createBooking(s.a.ctx, req(s.fac.id, day(9), "18:00", "20:00"));
    await expect(rejectBooking(s.admin, bk.id, "")).rejects.toThrow(/Alasan/);
    await rejectBooking(s.admin, bk.id, "Gedung dipakai rapat RW");
    expect((await dayAvailability(s.b.ctx, s.fac.id, day(9))).bookings).toHaveLength(0);
    const again = await createBooking(s.b.ctx, req(s.fac.id, day(9), "18:00", "20:00"));
    await approveBooking(s.admin, again.id);
    const [y, m] = day(9).split("-").map(Number);
    expect((await monthAvailability(s.a.ctx, s.fac.id, y, m))[day(9)]).toMatchObject({ approved: 1 });
    await cancelBooking(s.b.ctx, again.id, "");
    expect((await dayAvailability(s.a.ctx, s.fac.id, day(9))).bookings).toHaveLength(0);
    expect(await prisma.notification.count({ where: { userId: s.admin.userId, type: "BOOKING_CANCELLED" } })).toBeGreaterThan(0);
    expect((await getBooking(s.b.ctx, again.id)).histories.map((h) => h.toStatus)).toEqual(["PENDING", "APPROVED", "CANCELLED"]);
  });

  it("validasi: di luar jam operasional, waktu lampau, kapasitas, bukan pemilik", async () => {
    const s = await setup();
    await expect(createBooking(s.a.ctx, req(s.fac.id, day(10), "06:00", "08:00"))).rejects.toThrow(/operasional/);
    await expect(createBooking(s.a.ctx, req(s.fac.id, day(-1), "10:00", "11:00"))).rejects.toThrow(/sudah lewat/);
    await expect(createBooking(s.a.ctx, { ...req(s.fac.id, day(10), "10:00", "11:00"), participants: 500 })).rejects.toThrow(/kapasitas/);
    const bk = await createBooking(s.a.ctx, req(s.fac.id, day(10), "10:00", "11:00"));
    await expect(getBooking(s.b.ctx, bk.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelBooking(s.b.ctx, bk.id, "")).rejects.toBeInstanceOf(NotFoundError);
    await expect(approveBooking(s.a.ctx, bk.id)).rejects.toBeInstanceOf(ForbiddenError);
    const mine = await listBookings(s.b.ctx, { page: 1 });
    expect(mine.items.some((i) => i.id === bk.id)).toBe(false);
  });

  it("Security tidak dapat booking", async () => {
    const s = await setup();
    const { ctx: sec } = await makeUser("SECURITY");
    await expect(createBooking(sec, req(s.fac.id, day(11), "10:00", "11:00"))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Pengumuman & UMKM", () => {
  it("Member hanya melihat pengumuman terbit untuk warga; Security melihat pengumuman keamanan", async () => {
    const { ctx: admin } = await makeUser("ADMIN");
    const { ctx: mem } = await makeUser("MEMBER");
    const { ctx: sec } = await makeUser("SECURITY");
    const tag = uniq("Tag");
    const mk = (audience: "ALL" | "RESIDENTS" | "SECURITY" | "INTERNAL", status: "DRAFT" | "PUBLISHED") =>
      saveAnnouncement(admin, null, { title: `${tag} ${audience} ${status}`, body: "Isi", category: "Umum", audience, status, isPriority: false }, null);
    const draft = await mk("RESIDENTS", "DRAFT");
    await mk("RESIDENTS", "PUBLISHED");
    const internal = await mk("INTERNAL", "PUBLISHED");
    await mk("SECURITY", "PUBLISHED");
    const forMember = (await listAnnouncements(mem, { q: tag, page: 1 })).items.map((i) => i.title);
    expect(forMember).toEqual([`${tag} RESIDENTS PUBLISHED`]);
    const forSec = (await listAnnouncements(sec, { q: tag, page: 1 })).items.map((i) => i.title);
    expect(forSec).toEqual([`${tag} SECURITY PUBLISHED`]);
    await expect(getAnnouncement(mem, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getAnnouncement(mem, internal.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listAnnouncements(admin, { q: tag, page: 1 })).items).toHaveLength(4);
    await expect(saveAnnouncement(mem, null, { title: "x", body: "x", category: "Umum", audience: "ALL", status: "PUBLISHED" }, null)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("UMKM: terbit wajib persetujuan pemilik; alamat disembunyikan bila tidak diizinkan", async () => {
    const { ctx: admin } = await makeUser("ADMIN");
    const { ctx: mem } = await makeUser("MEMBER");
    const name = uniq("Warung ");
    const base = { name, ownerName: "Bu Ani", category: "Kuliner", address: "Blok A No. 3", showAddress: false, status: "PUBLISHED" as const };
    await expect(saveBusiness(admin, null, { ...base, ownerConsent: false }, null)).rejects.toThrow(/menyetujui publikasi/);
    await saveBusiness(admin, null, { ...base, ownerConsent: true }, null);
    const seen = (await listBusinesses(mem, { q: name, page: 1 })).items[0];
    expect(seen.name).toBe(name);
    expect(seen.address).toBeNull();
    await saveBusiness(admin, null, { ...base, name: name + " Draft", ownerConsent: false, status: "DRAFT" }, null);
    expect((await listBusinesses(mem, { q: name, page: 1 })).items).toHaveLength(1);
  });
});
