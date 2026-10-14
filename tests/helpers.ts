import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { seed } from "../prisma/seed";
import { hashPassword } from "@/server/auth/password";
import { loadSession } from "@/server/auth/service";
import { generateToken, hashToken } from "@/server/auth/tokens";
import type { RoleKey } from "@/server/rbac/permissions";
import type { AuthContext } from "@/server/auth/context";

export { prisma };

export async function ensureSeed() {
  return seed(prisma as unknown as PrismaClient);
}

let counter = 0;
export const uniq = (p = "x") => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

export const TEST_PASSWORD = "RahasiaTest123";

let cachedHash: string | null = null;

/** Buat user dengan role tertentu dan kembalikan AuthContext nyata (lewat sesi). */
export async function makeUser(role: RoleKey, opts: { residentId?: string; isActive?: boolean; organizationId?: string } = {}) {
  const org = opts.organizationId
    ? { id: opts.organizationId }
    : await prisma.organization.findUniqueOrThrow({ where: { slug: "taman-pesona-rajeg-mulya" } });
  cachedHash ??= await hashPassword(TEST_PASSWORD);
  const username = uniq(role.toLowerCase().replace("_", ""));
  const roleRow = await prisma.role.findUniqueOrThrow({ where: { key: role } });
  const user = await prisma.user.create({
    data: {
      organizationId: org.id, username, name: `Test ${role} ${username}`, passwordHash: cachedHash,
      isActive: opts.isActive ?? true,
      roles: { create: { organizationId: org.id, roleId: roleRow.id } },
    },
  });
  if (opts.residentId) await prisma.resident.update({ where: { id: opts.residentId }, data: { userId: user.id } });
  return { user, ctx: user.isActive ? await contextFor(user.id) : (null as unknown as AuthContext) };
}

export async function contextFor(userId: string): Promise<AuthContext> {
  const token = generateToken();
  await prisma.userSession.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) },
  });
  const ctx = await loadSession(token);
  if (!ctx) throw new Error("Gagal membuat sesi test");
  return ctx;
}

/** PNG 1x1 valid untuk test upload. */
export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export async function orgId() {
  return (await prisma.organization.findUniqueOrThrow({ where: { slug: "taman-pesona-rajeg-mulya" } })).id;
}

/** Membuat rumah + warga kepala keluarga (langsung via DB, tanpa RBAC). */
export async function makeHousehold(opts: { withAccount?: boolean } = {}) {
  const organizationId = await orgId();
  const unit = await prisma.residentialUnit.create({
    data: { organizationId, houseNumber: uniq("H").toUpperCase(), address: "Jl. Pesona Raya" },
  });
  const resident = await prisma.resident.create({
    data: { organizationId, code: uniq("W"), fullName: `Warga ${unit.houseNumber}`, phone: "081234567890" },
  });
  await prisma.residentUnitMembership.create({
    data: { organizationId, residentId: resident.id, unitId: unit.id, relation: "HEAD", startDate: new Date("2020-01-01") },
  });
  const member = opts.withAccount ? await makeUser("MEMBER", { residentId: resident.id }) : null;
  return { unit, resident, member: member ? { user: member.user, ctx: await contextFor(member.user.id) } : null };
}
