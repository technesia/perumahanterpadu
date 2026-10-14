import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { assertCan, type AuthContext } from "../auth/context";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { writeAudit } from "../audit";
import { hashPassword, passwordPolicyError } from "../auth/password";
import { revokeAllSessions } from "../auth/service";
import { assignableRoles, ROLE_KEYS, ROLE_LABELS, type RoleKey } from "../rbac/permissions";
import { emailSchema, pageParams, phoneSchema, requiredText } from "../validation";

export const accountInputSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "Username 3-32 karakter: huruf kecil, angka, titik, garis bawah, atau strip."),
  email: emailSchema,
  password: z.string().min(1, "Password wajib diisi.").max(128),
  role: z.enum(ROLE_KEYS, { errorMap: () => ({ message: "Role wajib dipilih." }) }),
});

export const createUserSchema = accountInputSchema.extend({
  name: requiredText("Nama", 120),
  phone: phoneSchema,
  residentId: z.string().max(40).optional().transform((v) => v || null),
});

function assertAssignable(ctx: AuthContext, role: RoleKey) {
  if (!assignableRoles(ctx.permissions).includes(role)) {
    throw new ForbiddenError(`Anda tidak berwenang memberikan role ${ROLE_LABELS[role]}.`);
  }
}

function checkPassword(pw: string) {
  const err = passwordPolicyError(pw);
  if (err) throw new AppError(err, "VALIDATION", { password: err });
}

async function assertUniqueLogin(tx: Tx, organizationId: string, username: string, email: string | null, excludeId?: string) {
  const clash = await tx.user.findFirst({
    where: {
      organizationId,
      id: excludeId ? { not: excludeId } : undefined,
      OR: [{ username }, ...(email ? [{ email }] : [])],
    },
    select: { username: true },
  });
  if (clash) {
    const field = clash.username === username ? "username" : "email";
    throw new AppError(`${field === "username" ? "Username" : "Email"} sudah dipakai.`, "VALIDATION", { [field]: "Sudah dipakai akun lain." });
  }
}

async function insertUser(
  ctx: AuthContext, tx: Tx,
  data: { name: string; username: string; email: string | null; phone: string | null; password: string; role: RoleKey },
) {
  assertAssignable(ctx, data.role);
  checkPassword(data.password);
  await assertUniqueLogin(tx, ctx.organizationId, data.username, data.email);
  const role = await tx.role.findUniqueOrThrow({ where: { key: data.role } });
  const user = await tx.user.create({
    data: {
      organizationId: ctx.organizationId,
      name: data.name, username: data.username, email: data.email, phone: data.phone,
      passwordHash: await hashPassword(data.password),
      createdById: ctx.userId,
      roles: { create: { organizationId: ctx.organizationId, roleId: role.id, assignedById: ctx.userId } },
    },
  });
  await writeAudit(ctx, {
    action: "USER_CREATED", module: "users", entityType: "User", entityId: user.id,
    summary: `Membuat akun ${user.username} dengan role ${ROLE_LABELS[data.role]}`,
  }, tx);
  return user;
}

/** Dipanggil dari form tambah warga: membuat akun dan menghubungkannya ke warga. */
export async function createAccountForResident(ctx: AuthContext, tx: Tx, residentId: string, input: z.input<typeof accountInputSchema> | z.output<typeof accountInputSchema>) {
  assertCan(ctx, "users.manage");
  const data = accountInputSchema.parse({ ...input, email: input.email ?? "" });
  const resident = await tx.resident.findFirstOrThrow({ where: { id: residentId, organizationId: ctx.organizationId } });
  if (resident.userId) throw new AppError("Warga sudah memiliki akun.");
  const user = await insertUser(ctx, tx, { ...data, name: resident.fullName, phone: resident.phone });
  await tx.resident.update({ where: { id: residentId }, data: { userId: user.id } });
  return user;
}

export async function createUser(ctx: AuthContext, input: z.input<typeof createUserSchema>) {
  assertCan(ctx, "users.manage");
  const data = createUserSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    if (data.residentId) {
      const r = await tx.resident.findFirst({ where: { id: data.residentId, organizationId: ctx.organizationId } });
      if (!r) throw new AppError("Warga tidak ditemukan.", "VALIDATION", { residentId: "Warga tidak valid." });
      if (r.userId) throw new AppError("Warga tersebut sudah memiliki akun.", "VALIDATION", { residentId: "Sudah memiliki akun." });
    }
    const user = await insertUser(ctx, tx, data);
    if (data.residentId) {
      await tx.resident.update({ where: { id: data.residentId }, data: { userId: user.id } });
      await writeAudit(ctx, { action: "RESIDENT_ACCOUNT_LINKED", module: "users", entityType: "Resident", entityId: data.residentId, summary: `Menghubungkan akun ${user.username} ke data warga` }, tx);
    }
    return user;
  });
}

async function loadTarget(ctx: AuthContext, tx: Tx, userId: string) {
  const user = await tx.user.findFirst({
    where: { id: userId, organizationId: ctx.organizationId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new NotFoundError("Akun tidak ditemukan.");
  const roles = user.roles.map((r) => r.role.key as RoleKey);
  // Hanya pemegang roles.assign_super_admin yang boleh mengubah akun Super Admin;
  // hanya pemegang roles.assign_admin yang boleh mengubah akun Admin.
  if (roles.includes("SUPER_ADMIN") && !ctx.permissions.has("roles.assign_super_admin")) throw new ForbiddenError("Akun Super Admin hanya dapat dikelola oleh Super Admin.");
  if (roles.includes("ADMIN") && !ctx.permissions.has("roles.assign_admin")) throw new ForbiddenError("Akun Admin hanya dapat dikelola oleh Super Admin.");
  return { user, roles };
}

async function activeSuperAdminCount(tx: Tx, organizationId: string, excludeUserId: string) {
  return tx.user.count({
    where: { organizationId, isActive: true, id: { not: excludeUserId }, roles: { some: { role: { key: "SUPER_ADMIN" } } } },
  });
}

export async function changeUserRole(ctx: AuthContext, userId: string, newRole: RoleKey) {
  assertCan(ctx, "users.manage");
  if (!(ROLE_KEYS as readonly string[]).includes(newRole)) throw new AppError("Role tidak valid.");
  if (userId === ctx.userId) throw new ForbiddenError("Anda tidak dapat mengubah role akun sendiri.");
  assertAssignable(ctx, newRole);
  return prisma.$transaction(async (tx) => {
    const { user, roles } = await loadTarget(ctx, tx, userId);
    if (roles.length === 1 && roles[0] === newRole) return;
    if (roles.includes("SUPER_ADMIN") && newRole !== "SUPER_ADMIN" && (await activeSuperAdminCount(tx, ctx.organizationId, userId)) === 0) {
      throw new AppError("Tidak dapat menurunkan Super Admin aktif terakhir.");
    }
    const role = await tx.role.findUniqueOrThrow({ where: { key: newRole } });
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.create({ data: { organizationId: ctx.organizationId, userId, roleId: role.id, assignedById: ctx.userId } });
    await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(ctx, {
      action: newRole === "SUPER_ADMIN" || roles.includes("SUPER_ADMIN") ? "SUPER_ADMIN_ROLE_CHANGED" : "ROLE_CHANGED",
      module: "users", entityType: "User", entityId: userId,
      summary: `Mengubah role ${user.username}: ${roles.map((r) => ROLE_LABELS[r]).join(", ") || "-"} → ${ROLE_LABELS[newRole]}`,
      metadata: { from: roles, to: newRole },
    }, tx);
  });
}

export async function setUserActive(ctx: AuthContext, userId: string, active: boolean) {
  assertCan(ctx, "users.manage");
  if (userId === ctx.userId) throw new ForbiddenError("Anda tidak dapat menonaktifkan akun sendiri.");
  await prisma.$transaction(async (tx) => {
    const { user, roles } = await loadTarget(ctx, tx, userId);
    if (!active && roles.includes("SUPER_ADMIN") && (await activeSuperAdminCount(tx, ctx.organizationId, userId)) === 0) {
      throw new AppError("Super Admin aktif terakhir tidak dapat dinonaktifkan.");
    }
    await tx.user.update({ where: { id: userId }, data: { isActive: active, failedLoginCount: 0, lockedUntil: null } });
    if (!active) await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(ctx, {
      action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED", module: "users", entityType: "User", entityId: userId,
      summary: `${active ? "Mengaktifkan" : "Menonaktifkan"} akun ${user.username}`,
    }, tx);
  });
}

export async function resetUserPassword(ctx: AuthContext, userId: string, password: string) {
  assertCan(ctx, "users.manage");
  checkPassword(password);
  await prisma.$transaction(async (tx) => {
    const { user } = await loadTarget(ctx, tx, userId);
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null } });
    await writeAudit(ctx, { action: "PASSWORD_RESET", module: "users", entityType: "User", entityId: userId, summary: `Mereset password akun ${user.username}` }, tx);
  });
  await revokeAllSessions(userId);
}

export async function listUsers(ctx: AuthContext, f: { q?: string; role?: string; page: number }, pageSize = 20) {
  assertCan(ctx, "users.manage");
  const where: Prisma.UserWhereInput = { organizationId: ctx.organizationId };
  if (f.role && (ROLE_KEYS as readonly string[]).includes(f.role)) where.roles = { some: { role: { key: f.role } } };
  if (f.q) {
    const q = f.q.trim().slice(0, 60);
    where.OR = [{ name: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
  }
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where, orderBy: { name: "asc" }, ...pageParams(f.page, pageSize),
      select: {
        id: true, name: true, username: true, email: true, isActive: true, lastLoginAt: true, lockedUntil: true,
        roles: { select: { role: { select: { key: true } } } },
        resident: { select: { id: true, code: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return { items: items.map((u) => ({ ...u, roleKeys: u.roles.map((r) => r.role.key as RoleKey) })), total };
}
