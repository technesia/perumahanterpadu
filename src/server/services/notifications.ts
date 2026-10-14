import { prisma, type Tx } from "../db";
import type { AuthContext } from "../auth/context";
import type { PermissionKey } from "../rbac/permissions";

interface NotificationInput { type: string; title: string; body?: string; link?: string }

/** Kirim notifikasi ke semua pengguna aktif yang memegang permission tertentu. */
export async function notifyPermissionHolders(
  tx: Tx, organizationId: string, perm: PermissionKey, n: NotificationInput, excludeUserId?: string,
) {
  const users = await tx.user.findMany({
    where: {
      organizationId,
      isActive: true,
      id: excludeUserId ? { not: excludeUserId } : undefined,
      roles: { some: { organizationId, role: { permissions: { some: { permission: { key: perm } } } } } },
    },
    select: { id: true },
  });
  if (users.length === 0) return;
  await tx.notification.createMany({ data: users.map((u) => ({ organizationId, userId: u.id, ...n })) });
}

export async function notifyUser(tx: Tx, organizationId: string, userId: string, n: NotificationInput) {
  await tx.notification.create({ data: { organizationId, userId, ...n } });
}

export async function listNotifications(ctx: AuthContext, limit = 15) {
  const where = { userId: ctx.userId, organizationId: ctx.organizationId };
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);
  return { items, unread };
}

/** Tandai dibaca — hanya milik pengguna sendiri (anti-IDOR). */
export async function markNotificationsRead(ctx: AuthContext, ids: string[] | "all") {
  await prisma.notification.updateMany({
    where: {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      readAt: null,
      ...(ids === "all" ? {} : { id: { in: ids.slice(0, 100) } }),
    },
    data: { readAt: new Date() },
  });
}
