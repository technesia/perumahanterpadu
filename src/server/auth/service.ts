import { prisma } from "../db";
import { getOrganizationId } from "../organization";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { hashPassword, verifyPassword } from "./password";
import { generateToken, hashToken } from "./tokens";
import { isRateLimited, recordAttempt } from "./rate-limit";
import { pickPrimaryRole, type AuthContext } from "./context";
import type { RoleKey } from "../rbac/permissions";

const MAX_CONSECUTIVE_FAILURES = 5;
const LOCK_MINUTES = 15;
let dummy: Promise<string> | null = null;
function dummyHash() {
  dummy ??= hashPassword(generateToken());
  return dummy;
}

const GENERIC_LOGIN_ERROR = "Email/username atau password salah.";

export function sessionTtlMs(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? 12);
  return (Number.isFinite(hours) && hours > 0 ? hours : 12) * 3600_000;
}

export interface LoginInput {
  identifier: string;
  password: string;
  ip?: string | null;
  userAgent?: string | null;
}

export async function authenticate(input: LoginInput) {
  const organizationId = await getOrganizationId();
  const identifier = input.identifier.trim().toLowerCase();
  const keys = [`id:${identifier}`, ...(input.ip ? [`ip:${input.ip}`] : [])];

  if (await isRateLimited(keys)) {
    throw new AppError("Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.", "RATE_LIMITED");
  }

  const user = await prisma.user.findFirst({
    where: { organizationId, OR: [{ username: identifier }, { email: identifier }] },
    include: { roles: { include: { role: true } } },
  });

  // Tetap jalankan bcrypt saat user tidak ada untuk mengurangi timing attack.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));

  if (!user || !ok) {
    await recordAttempt(keys, false);
    if (user) {
      await writeAudit(
        { organizationId, userId: user.id, name: user.name, primaryRole: pickPrimaryRole(user.roles.map((r) => r.role.key as RoleKey)), ip: input.ip },
        { action: "LOGIN_FAILED", module: "auth", status: "FAILED", summary: `Percobaan masuk gagal untuk akun ${user.username}`, entityType: "User", entityId: user.id },
      );
      const failures = user.failedLoginCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failures,
          lockedUntil:
            failures >= MAX_CONSECUTIVE_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
    }
    throw new AppError(GENERIC_LOGIN_ERROR, "INVALID_CREDENTIALS");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAttempt(keys, false);
    throw new AppError("Akun dikunci sementara karena terlalu banyak percobaan gagal.", "LOCKED");
  }
  if (!user.isActive) {
    await recordAttempt(keys, false);
    throw new AppError("Akun Anda tidak aktif. Hubungi pengurus.", "INACTIVE");
  }

  const token = generateToken();
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + sessionTtlMs()),
      ipAddress: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 255) ?? null,
    },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await recordAttempt(keys, true);

  const roles = user.roles.map((r) => r.role.key as RoleKey);
  await writeAudit(
    { organizationId, userId: user.id, name: user.name, primaryRole: pickPrimaryRole(roles), ip: input.ip },
    { action: "LOGIN", module: "auth", summary: `${user.name} masuk ke aplikasi`, entityType: "User", entityId: user.id },
  );

  return { token, sessionId: session.id, primaryRole: pickPrimaryRole(roles) };
}

/** Memuat konteks autentikasi dari token cookie. Null bila tidak valid. */
export async function loadSession(token: string | undefined | null): Promise<AuthContext | null> {
  if (!token) return null;
  const organizationId = await getOrganizationId();
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          resident: { select: { id: true } },
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  const user = session.user;
  if (!user.isActive || user.organizationId !== organizationId) return null;

  const roles = user.roles.filter((r) => r.organizationId === organizationId).map((r) => r.role.key as RoleKey);
  const permissions = new Set<string>();
  for (const ur of user.roles) {
    if (ur.organizationId !== organizationId) continue;
    for (const rp of ur.role.permissions) permissions.add(rp.permission.key);
  }

  // Perbarui lastSeen paling sering tiap 5 menit agar tidak membebani DB.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }

  return {
    sessionId: session.id,
    userId: user.id,
    organizationId,
    name: user.name,
    username: user.username,
    email: user.email,
    roles,
    primaryRole: pickPrimaryRole(roles),
    permissions,
    residentId: user.resident?.id ?? null,
  };
}

export async function logout(ctx: AuthContext) {
  await prisma.userSession.update({ where: { id: ctx.sessionId }, data: { revokedAt: new Date() } });
  await writeAudit(ctx, {
    action: "LOGOUT",
    module: "auth",
    summary: `${ctx.name} keluar dari aplikasi`,
    entityType: "User",
    entityId: ctx.userId,
  });
}

export async function revokeAllSessions(userId: string) {
  await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
