import { beforeAll, describe, expect, it } from "vitest";
import { ensureSeed, makeUser, PNG_1PX, prisma, uniq } from "./helpers";
import { ForbiddenError, NotFoundError, AppError } from "@/server/errors";
import { getResident, listResidents, createResident, searchResidentsLite } from "@/server/services/residents";
import { getUnit, listUnits, createUnit } from "@/server/services/units";
import { listUsers, createUser, changeUserRole } from "@/server/services/users";
import { generateBills, listBills, saveIplType, unpaidList, unpaidSummary } from "@/server/services/ipl";
import { approvePayment, getPayment, listPayments, rejectPayment } from "@/server/services/ipl-payments";
import { cashSummary, createTransaction, listTransactions, setOpeningBalance, yearlyRecap } from "@/server/services/finance";
import { listRequests, processRequest } from "@/server/services/admin-requests";
import { getAnnouncement, saveActivity, saveAnnouncement, saveBusiness, savePosyandu } from "@/server/services/community";
import { approveBooking, dayAvailability, saveFacility } from "@/server/services/facilities";
import { listAuditLogs } from "@/server/services/audit-logs";
import { updateSettings, roleMatrix } from "@/server/services/settings";
import { cameraAccessUrl, checkIn, listCameras, reviewIncident, saveCamera } from "@/server/services/security";
import { authorizeFile } from "@/server/services/files";
import { storeFile } from "@/server/storage";

beforeAll(ensureSeed);

/** Fungsi pengurus yang harus ditolak untuk role tertentu. Setiap pemanggilan harus Forbidden (bukan error lain). */
const STAFF_CALLS: Record<string, (ctx: Parameters<typeof listResidents>[0]) => Promise<unknown>> = {
  "residents.list": (c) => listResidents(c, { page: 1 }),
  "residents.create": (c) => createResident(c, { fullName: "X", status: "ACTIVE", occupancyStatus: "PERMANENT", phone: "", email: "" }),
  "units.list": (c) => listUnits(c, { page: 1 }),
  "units.create": (c) => createUnit(c, { houseNumber: uniq("Z"), address: "x", occupancyStatus: "PERMANENT" }),
  "users.list": (c) => listUsers(c, { page: 1 }),
  "users.create": (c) => createUser(c, { name: "x", username: uniq("u"), password: "Rahasia12345", role: "MEMBER", phone: "", email: "" }),
  "users.role": (c) => changeUserRole(c, "x", "MEMBER"),
  "ipl.type": (c) => saveIplType(c, null, { name: "x", amount: 1, dueDay: 1, isActive: true }),
  "ipl.generate": (c) => generateBills(c, { iplTypeId: "x", fromYear: 2026, fromMonth: 1, toYear: 2026, toMonth: 1 }),
  "ipl.bills": (c) => listBills(c, { page: 1 }),
  "ipl.unpaid": (c) => unpaidList(c, { page: 1 }),
  "ipl.summary": (c) => unpaidSummary(c),
  "ipl.approve": (c) => approvePayment(c, "x"),
  "ipl.reject": (c) => rejectPayment(c, "x", "alasan panjang"),
  "finance.list": (c) => listTransactions(c, "INCOME", { page: 1 }),
  "finance.create": (c) => createTransaction(c, "EXPENSE", { date: "2026-01-01", categoryId: "x", description: "x", amount: 1, method: "CASH" }, null),
  "finance.opening": (c) => setOpeningBalance(c, { amount: 1, effectiveDate: "2026-01-01", note: "x" }),
  "finance.recap": (c) => yearlyRecap(c, 2026),
  "admin.process": (c) => processRequest(c, "x", { status: "APPROVED" }),
  "announcement.save": (c) => saveAnnouncement(c, null, { title: "x", body: "x", category: "Umum", audience: "ALL", status: "DRAFT" }, null),
  "activity.save": (c) => saveActivity(c, null, { name: "x", category: "Lainnya", startAt: "2026-12-01T10:00", location: "x", status: "PLANNED" }, null),
  "business.save": (c) => saveBusiness(c, null, { name: "x", ownerName: "x", category: "x", status: "DRAFT" }, null),
  "posyandu.save": (c) => savePosyandu(c, null, { name: "x", startAt: "2026-12-01T10:00", location: "x" }),
  "facility.save": (c) => saveFacility(c, null, { name: "x", openTime: "08:00", closeTime: "10:00", slotMinutes: 60 }, null),
  "booking.approve": (c) => approveBooking(c, "x"),
  "audit.list": (c) => listAuditLogs(c, { page: 1 }),
  "settings.update": (c) => updateSettings(c, { arrearsWindowMonths: 60, deathRecordMaxYears: 10, allowPartialPayment: false, holdPendingBookings: true }),
  "roles.matrix": (c) => roleMatrix(c),
  "cctv.save": (c) => saveCamera(c, null, { name: "x", location: "x", status: "ONLINE" }),
  "incident.review": (c) => reviewIncident(c, "x", { status: "CLOSED" }),
};
const SECURITY_ALLOWED = new Set<string>([]);

describe("Sapu bersih RBAC (#4–#6)", () => {
  for (const role of ["MEMBER", "SECURITY"] as const) {
    it(`${role} ditolak di semua fungsi pengurus`, async () => {
      const { ctx } = await makeUser(role);
      const leaks: string[] = [];
      for (const [name, call] of Object.entries(STAFF_CALLS)) {
        if (role === "SECURITY" && SECURITY_ALLOWED.has(name)) continue;
        try {
          await call(ctx);
          leaks.push(`${name}: berhasil`);
        } catch (e) {
          if (!(e instanceof ForbiddenError)) leaks.push(`${name}: ${(e as Error).constructor.name} ${(e as Error).message}`);
        }
      }
      expect(leaks).toEqual([]);
    });
  }

  it("Member tidak dapat melihat CCTV maupun mencatat tamu", async () => {
    const { ctx } = await makeUser("MEMBER");
    await expect(listCameras(ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cameraAccessUrl(ctx, "x")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(checkIn(ctx, { visitorName: "x", purpose: "x", hostName: "x", phone: "" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(searchResidentsLite(ctx, "ab")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("Member: daftar pembayaran & pengajuan otomatis dibatasi milik sendiri", async () => {
    const { ctx } = await makeUser("MEMBER");
    const pays = await listPayments(ctx, { page: 1 });
    const reqs = await listRequests(ctx, { page: 1 });
    expect(pays.items.every((p) => p.submittedById === ctx.userId)).toBe(true);
    expect(reqs.items.every((r) => r.requesterUserId === ctx.userId)).toBe(true);
  });
});

describe("Isolasi organization context (#53)", () => {
  it("data organisasi lain tidak terlihat dan tidak dapat diakses lewat ID", async () => {
    const other = await prisma.organization.create({ data: { slug: uniq("org"), name: "Perumahan Lain" } });
    const resident = await prisma.resident.create({ data: { organizationId: other.id, code: uniq("W"), fullName: uniq("Rahasia Lain ") } });
    const unit = await prisma.residentialUnit.create({ data: { organizationId: other.id, houseNumber: uniq("O"), address: "x" } });
    const ann = await prisma.announcement.create({ data: { organizationId: other.id, title: "Rahasia", body: "x", category: "Umum", status: "PUBLISHED", audience: "ALL", publishedAt: new Date() } });
    const fac = await prisma.facility.create({ data: { organizationId: other.id, name: uniq("Gedung Lain ") } });
    const cam = await prisma.cctvCamera.create({ data: { organizationId: other.id, name: uniq("Cam"), location: "x", accessUrl: "https://other.example" } });
    const file = await storeFile(prisma, other.id, { name: "x.png", data: PNG_1PX }, "finance", "sys");
    const cat = await prisma.financeCategory.create({ data: { organizationId: other.id, type: "INCOME", code: uniq("C"), name: "x" } });
    await prisma.financeTransaction.create({
      data: { organizationId: other.id, number: uniq("KM"), type: "INCOME", categoryId: cat.id, date: new Date(), description: "x", amount: 999_999_999, attachmentFileId: file.id },
    });

    const { ctx: sa } = await makeUser("SUPER_ADMIN");
    expect((await listResidents(sa, { q: resident.fullName, page: 1 })).total).toBe(0);
    await expect(getResident(sa, resident.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getUnit(sa, unit.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getAnnouncement(sa, ann.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(dayAvailability(sa, fac.id, "2026-12-01")).rejects.toBeInstanceOf(AppError);
    await expect(cameraAccessUrl(sa, cam.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPayment(sa, "tidak-ada")).rejects.toBeInstanceOf(NotFoundError);
    expect(await authorizeFile(sa, file.id)).toBeNull();
    const cash = await cashSummary(sa.organizationId);
    expect(cash.income).toBeLessThan(999_999_999);
    expect((await listTransactions(sa, "INCOME", { q: "x", page: 1 })).items.every((t) => t.organizationId === sa.organizationId)).toBe(true);
  });
});
