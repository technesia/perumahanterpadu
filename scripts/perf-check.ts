// Uji performa dengan data skala realistis. HANYA untuk database khusus uji
// (nama database harus mengandung "perf"). Data dibuat langsung via Prisma.
//
//   DATABASE_URL=postgresql://.../tprm_perf npx tsx scripts/perf-check.ts
import { PrismaClient } from "@prisma/client";
import { seed } from "../prisma/seed";
import { hashPassword } from "../src/server/auth/password";
import { generateToken, hashToken } from "../src/server/auth/tokens";
import { loadSession } from "../src/server/auth/service";
import { unpaidList, unpaidSummary, listBills, myBills } from "../src/server/services/ipl";
import { adminDashboard } from "../src/server/services/dashboard";
import { listResidents } from "../src/server/services/residents";
import { yearlyRecap } from "../src/server/services/finance";
import { addMonths, dueDateFor, periodsBetween } from "../src/lib/ipl";

const UNITS = 300;
const MONTHS = 60;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/perf/.test(new URL(url).pathname)) throw new Error("Menolak: database harus database uji performa (nama mengandung 'perf').");
  const prisma = new PrismaClient();
  const org = await seed(prisma);
  const hash = await hashPassword("PerfTest12345");
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  const admin = await prisma.user.create({ data: { organizationId: org.id, username: "perf", name: "Perf", passwordHash: hash, roles: { create: { organizationId: org.id, roleId: role.id } } } });
  const memberRole = await prisma.role.findUniqueOrThrow({ where: { key: "MEMBER" } });

  console.log(`Membuat ${UNITS} rumah & warga, ${UNITS * MONTHS} tagihan…`);
  const type = await prisma.iplType.create({ data: { organizationId: org.id, name: "IPL", amount: 100000, dueDay: 10 } });
  const now = new Date();
  const end = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const periods = periodsBetween(addMonths(end, -(MONTHS - 1)), end);
  let memberId = "";
  for (let i = 0; i < UNITS; i++) {
    const unit = await prisma.residentialUnit.create({ data: { organizationId: org.id, houseNumber: `P-${i}`, address: `Blok P No. ${i}` } });
    const r = await prisma.resident.create({ data: { organizationId: org.id, code: `PERF-${i}`, fullName: `Warga Uji ${i}`, phone: "081200000000" } });
    await prisma.residentUnitMembership.create({ data: { organizationId: org.id, residentId: r.id, unitId: unit.id, startDate: new Date("2020-01-01") } });
    const paid = i % 4 === 0 ? MONTHS : i % 7; // sebagian lunas penuh, sisanya menunggak
    await prisma.iplBill.createMany({
      data: periods.map((p, pi) => ({
        organizationId: org.id, unitId: unit.id, residentId: r.id, iplTypeId: type.id, periodYear: p.year, periodMonth: p.month,
        amount: 100000, dueDate: dueDateFor(p, 10), ...(pi < paid ? { status: "PAID" as const, paidAmount: 100000 } : {}),
      })),
    });
    if (i === 1) {
      const u = await prisma.user.create({ data: { organizationId: org.id, username: "perfwarga", name: r.fullName, passwordHash: hash, roles: { create: { organizationId: org.id, roleId: memberRole.id } } } });
      await prisma.resident.update({ where: { id: r.id }, data: { userId: u.id } });
      memberId = u.id;
    }
  }
  const cat = await prisma.financeCategory.findFirstOrThrow({ where: { organizationId: org.id, code: "EXP_OTHER" } });
  await prisma.financeTransaction.createMany({
    data: Array.from({ length: 5000 }, (_, i) => ({ organizationId: org.id, number: `KK-P-${i}`, type: "EXPENSE" as const, categoryId: cat.id, date: new Date(Date.UTC(end.year, i % 12, 1 + (i % 27))), description: "uji", amount: 10000 })),
  });

  async function ctxFor(userId: string) {
    const token = generateToken();
    await prisma.userSession.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) } });
    return (await loadSession(token))!;
  }
  const sa = await ctxFor(admin.id);
  const mem = await ctxFor(memberId);
  await prisma.$executeRawUnsafe("ANALYZE");

  const results: [string, number][] = [];
  async function time(label: string, fn: () => Promise<unknown>) {
    await fn(); // pemanasan
    const t = performance.now();
    for (let i = 0; i < 3; i++) await fn();
    results.push([label, Math.round((performance.now() - t) / 3)]);
  }
  await time("Dashboard Admin", () => adminDashboard(sa));
  await time("IPL Belum Bayar: ringkasan", () => unpaidSummary(sa));
  await time("IPL Belum Bayar: daftar hal. 1", () => unpaidList(sa, { page: 1 }));
  await time("IPL Belum Bayar: filter ≥12 bulan", () => unpaidList(sa, { page: 1, minMonths: 12 }));
  await time("Tagihan IPL: daftar hal. 1", () => listBills(sa, { page: 1 }));
  await time("Data Warga: cari", () => listResidents(sa, { q: "Uji 2", page: 1 }));
  await time("Rekap keuangan tahunan", () => yearlyRecap(sa, end.year));
  await time("Tagihan Saya (Member, 60 bln)", () => myBills(mem));
  console.table(results.map(([l, ms]) => ({ Operasi: l, "Rata-rata (ms)": ms })));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
