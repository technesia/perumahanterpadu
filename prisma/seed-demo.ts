// DATA DEMO — hanya untuk development/demonstrasi. JANGAN dijalankan di production.
// Semua nama diawali "[DEMO]". Password akun demo wajib diberikan lewat DEMO_PASSWORD.
//
//   DEMO_PASSWORD="..." npm run seed:demo
import { PrismaClient } from "@prisma/client";
import { seed } from "./seed";
import { hashPassword, passwordPolicyError } from "../src/server/auth/password";
import { dueDateFor, addMonths, periodsBetween } from "../src/lib/ipl";
import { todayDate } from "../src/lib/dates";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Seed demo ditolak di production.");
  const pw = process.env.DEMO_PASSWORD ?? "";
  const err = passwordPolicyError(pw);
  if (err) throw new Error(`DEMO_PASSWORD tidak valid: ${err}`);

  const org = await seed(prisma);
  const hash = await hashPassword(pw);
  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.key, r.id]));

  async function user(username: string, name: string, role: string) {
    return prisma.user.upsert({
      where: { organizationId_username: { organizationId: org.id, username } },
      update: { passwordHash: hash, isActive: true },
      create: {
        organizationId: org.id, username, name, passwordHash: hash,
        roles: { create: { organizationId: org.id, roleId: roles[role] } },
      },
    });
  }
  await user("admin.demo", "[DEMO] Admin RT", "ADMIN");
  await user("security.demo", "[DEMO] Petugas Keamanan", "SECURITY");

  const type = await prisma.iplType.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "[DEMO] IPL Bulanan" } },
    update: {},
    create: { organizationId: org.id, name: "[DEMO] IPL Bulanan", amount: 100000, dueDay: 10, description: "Data demo" },
  });

  const today = todayDate();
  const now = { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
  const periods = periodsBetween(addMonths(now, -7), now);
  const households = [
    { house: "D-01", name: "[DEMO] Budi Santoso", phone: "081200000001", paidMonths: 8, occ: "PERMANENT" },
    { house: "D-02", name: "[DEMO] Siti Rahmawati", phone: "081200000002", paidMonths: 5, occ: "PERMANENT" },
    { house: "D-03", name: "[DEMO] Agus Wijaya", phone: "081200000003", paidMonths: 0, occ: "TEMPORARY" },
    { house: "D-04", name: "[DEMO] Dewi Lestari", phone: "081200000004", paidMonths: 3, occ: "PERMANENT" },
  ] as const;

  for (const [i, h] of households.entries()) {
    const unit = await prisma.residentialUnit.upsert({
      where: { organizationId_houseNumber: { organizationId: org.id, houseNumber: h.house } },
      update: {},
      create: { organizationId: org.id, houseNumber: h.house, block: "D", address: `Blok D No. ${i + 1}, Taman Pesona Rajeg Mulya`, occupancyStatus: h.occ },
    });
    let resident = await prisma.resident.findFirst({ where: { organizationId: org.id, fullName: h.name } });
    if (!resident) {
      resident = await prisma.resident.create({
        data: { organizationId: org.id, code: `DEMO-${String(i + 1).padStart(3, "0")}`, fullName: h.name, phone: h.phone, occupancyStatus: h.occ, moveInDate: new Date("2022-01-01") },
      });
      await prisma.residentUnitMembership.create({
        data: { organizationId: org.id, residentId: resident.id, unitId: unit.id, relation: "HEAD", startDate: new Date("2022-01-01") },
      });
    }
    for (const [pi, p] of periods.entries()) {
      const paid = pi < h.paidMonths;
      await prisma.iplBill.upsert({
        where: { organizationId_unitId_iplTypeId_periodYear_periodMonth: { organizationId: org.id, unitId: unit.id, iplTypeId: type.id, periodYear: p.year, periodMonth: p.month } },
        update: {},
        create: {
          organizationId: org.id, unitId: unit.id, residentId: resident.id, iplTypeId: type.id, periodYear: p.year, periodMonth: p.month,
          amount: type.amount, dueDate: dueDateFor(p, type.dueDay),
          // Status lunas demo dibuat langsung tanpa transaksi kas (hanya untuk tampilan demo).
          ...(paid ? { status: "PAID", paidAmount: type.amount, paidAt: new Date() } : {}),
        },
      });
    }
    if (i === 1) {
      const w = await prisma.user.findUnique({ where: { organizationId_username: { organizationId: org.id, username: "warga.demo" } } });
      const u = w ?? (await user("warga.demo", h.name, "MEMBER"));
      await prisma.resident.update({ where: { id: resident.id }, data: { userId: u.id } });
    }
  }
  console.log("Data demo siap. Akun: admin.demo, warga.demo, security.demo (password = DEMO_PASSWORD).");
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
