import { prisma } from "../db";
import { assertCan, can, type AuthContext } from "../auth/context";
import { residentStats } from "./residents";
import { currentPeriod, myBills, PENDING_PAYMENT_STATUSES, unpaidSummary } from "./ipl";
import { cashSummary } from "./finance";
import { todayDate } from "@/lib/dates";

function startOfTodayJakarta() {
  // tengah malam WIB = 17:00 UTC hari sebelumnya
  return new Date(todayDate().getTime() - 7 * 3600_000);
}

export async function adminDashboard(ctx: AuthContext) {
  assertCan(ctx, "dashboard.admin");
  const org = ctx.organizationId;
  const p = currentPeriod();
  const [residents, units, billed, arrears, cash, requests, bookings, visitorsToday, incidentsOpen, recent] = await Promise.all([
    residentStats(prisma, org),
    prisma.residentialUnit.count({ where: { organizationId: org, isActive: true } }),
    prisma.iplBill.aggregate({ where: { organizationId: org, periodYear: p.year, periodMonth: p.month, status: { not: "VOID" } }, _sum: { amount: true }, _count: { _all: true } }),
    can(ctx, "ipl.view") ? unpaidSummary(ctx) : null,
    can(ctx, "finance.view") ? cashSummary(org) : null,
    prisma.administrativeRequest.count({ where: { organizationId: org, status: { in: ["SUBMITTED", "PROCESSING"] } } }),
    prisma.facilityBooking.count({ where: { organizationId: org, status: "PENDING" } }),
    prisma.visitorLog.count({ where: { organizationId: org, checkInAt: { gte: startOfTodayJakarta() } } }),
    prisma.securityIncident.count({ where: { organizationId: org, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    can(ctx, "audit_logs.view")
      ? prisma.auditLog.findMany({ where: { organizationId: org }, orderBy: { createdAt: "desc" }, take: 8 })
      : Promise.resolve([]),
  ]);
  return {
    period: p, residents, units,
    billedAmount: billed._sum.amount ?? 0, billedCount: billed._count._all,
    arrears, cash, requests, bookings, visitorsToday, incidentsOpen, recent,
  };
}

export async function memberDashboard(ctx: AuthContext) {
  const bills = can(ctx, "ipl.self_view") ? await myBills(ctx) : null;
  const where = { organizationId: ctx.organizationId };
  const [payments, requests, bookings, announcements, activities] = await Promise.all([
    prisma.iplPayment.findMany({
      where: { ...where, OR: [{ submittedById: ctx.userId }, ...(ctx.residentId ? [{ residentId: ctx.residentId }] : [])] },
      orderBy: { createdAt: "desc" }, take: 5,
      select: { id: true, number: true, totalAmount: true, status: true, createdAt: true },
    }),
    prisma.administrativeRequest.findMany({
      where: { ...where, requesterUserId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 3,
      select: { id: true, number: true, status: true, type: { select: { name: true } } },
    }),
    prisma.facilityBooking.findMany({
      where: { ...where, requesterUserId: ctx.userId, endAt: { gte: new Date() } }, orderBy: { startAt: "asc" }, take: 3,
      select: { id: true, startAt: true, endAt: true, status: true, facility: { select: { name: true } } },
    }),
    prisma.announcement.findMany({
      where: { ...where, status: "PUBLISHED", audience: { in: ["ALL", "RESIDENTS"] } },
      orderBy: [{ isPriority: "desc" }, { publishedAt: "desc" }], take: 4,
      select: { id: true, title: true, category: true, isPriority: true, publishedAt: true },
    }),
    prisma.activity.findMany({
      where: { ...where, startAt: { gte: startOfTodayJakarta() }, status: { in: ["PLANNED", "ONGOING"] } },
      orderBy: { startAt: "asc" }, take: 4,
      select: { id: true, name: true, startAt: true, location: true },
    }),
  ]);
  return { bills, payments, requests, bookings, announcements, activities, pendingCount: payments.filter((p) => (PENDING_PAYMENT_STATUSES as readonly string[]).includes(p.status)).length };
}

export async function securityDashboard(ctx: AuthContext) {
  assertCan(ctx, "security.dashboard");
  const where = { organizationId: ctx.organizationId };
  const [inside, todayVisitors, incidents, cameras, announcements] = await Promise.all([
    prisma.visitorLog.findMany({ where: { ...where, checkOutAt: null }, orderBy: { checkInAt: "desc" }, take: 20, include: { unit: { select: { houseNumber: true } } } }),
    prisma.visitorLog.findMany({ where: { ...where, checkInAt: { gte: startOfTodayJakarta() } }, orderBy: { checkInAt: "desc" }, take: 10, include: { unit: { select: { houseNumber: true } } } }),
    prisma.securityIncident.findMany({ where, orderBy: { occurredAt: "desc" }, take: 5 }),
    can(ctx, "cctv.view") ? prisma.cctvCamera.findMany({ where: { ...where, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, location: true, status: true } }) : Promise.resolve([]),
    prisma.announcement.findMany({
      where: { ...where, status: "PUBLISHED", audience: { in: ["ALL", "SECURITY"] } },
      orderBy: [{ isPriority: "desc" }, { publishedAt: "desc" }], take: 4,
      select: { id: true, title: true, category: true, isPriority: true, publishedAt: true },
    }),
  ]);
  return { inside, todayVisitors, incidents, cameras, announcements };
}
