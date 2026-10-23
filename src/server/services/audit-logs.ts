import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { assertCan, can, type AuthContext } from "../auth/context";
import { pageParams } from "../validation";
import { dateOnly } from "@/lib/dates";

export interface AuditFilter { q?: string; module?: string; userId?: string; role?: string; action?: string; from?: string; to?: string; page: number }

/** Role pelaku yang boleh dilihat oleh pemegang `audit_logs.view` tanpa `audit_logs.view_all` (Admin). */
export const LIMITED_VISIBLE_ROLES = ["MEMBER", "SECURITY"] as const;
/** Pilihan filter role. SYSTEM = aktivitas tanpa pengguna (mis. provider pembayaran). */
export const AUDIT_ROLE_FILTERS = ["SUPER_ADMIN", "ADMIN", "MEMBER", "SECURITY", "SYSTEM"] as const;

/**
 * Batas visibilitas Activity Log menurut hak akses pengguna yang login. Dipakai oleh SEMUA
 * query audit log (halaman, API polling, SSE, dashboard) dan selalu digabung dengan AND,
 * sehingga parameter filter apa pun dari request tidak dapat memperluasnya.
 * - audit_logs.view_all (Super Admin): semua aktivitas.
 * - audit_logs.view saja (Admin): aktivitas Member, Security, dan aktivitas sistem tanpa pengguna.
 */
export function auditScopeWhere(ctx: AuthContext): Prisma.AuditLogWhereInput {
  assertCan(ctx, "audit_logs.view");
  if (can(ctx, "audit_logs.view_all")) return { organizationId: ctx.organizationId };
  return {
    organizationId: ctx.organizationId,
    OR: [{ userRole: { in: [...LIMITED_VISIBLE_ROLES] } }, { userId: null }],
  };
}

/** Role yang dapat dipilih sebagai filter oleh pengguna ini. */
export function roleFilterOptions(ctx: AuthContext): string[] {
  return can(ctx, "audit_logs.view_all") ? [...AUDIT_ROLE_FILTERS] : [...LIMITED_VISIBLE_ROLES, "SYSTEM"];
}

function buildWhere(ctx: AuthContext, f: Omit<AuditFilter, "page">): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [auditScopeWhere(ctx)];
  if (f.module) and.push({ module: f.module.slice(0, 40) });
  if (f.userId) and.push({ userId: f.userId.slice(0, 40) });
  if (f.action) and.push({ action: f.action.slice(0, 60) });
  if (f.role && (AUDIT_ROLE_FILTERS as readonly string[]).includes(f.role)) {
    and.push(f.role === "SYSTEM" ? { userId: null } : { userRole: f.role, userId: { not: null } });
  }
  const range: Prisma.DateTimeFilter = {};
  try {
    // Batas tanggal mengikuti WIB (UTC+7).
    if (f.from) range.gte = new Date(dateOnly(f.from).getTime() - 7 * 3600_000);
    if (f.to) range.lt = new Date(dateOnly(f.to).getTime() + 17 * 3600_000);
  } catch { /* abaikan tanggal tidak valid */ }
  if (Object.keys(range).length) and.push({ createdAt: range });
  if (f.q) {
    const q = f.q.trim().slice(0, 80);
    and.push({
      OR: [
        { summary: { contains: q, mode: "insensitive" } },
        { userName: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { entityId: q },
      ],
    });
  }
  return { AND: and };
}

/** Hanya baca. Tidak ada fungsi ubah/hapus audit log (ditegakkan juga oleh trigger DB). */
export async function listAuditLogs(ctx: AuthContext, f: AuditFilter, pageSize = 30) {
  const where = buildWhere(ctx, f);
  const scope = auditScopeWhere(ctx);
  const [items, total, modules, actions, users] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...pageParams(f.page, pageSize) }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where: scope, distinct: ["module"], select: { module: true } }),
    prisma.auditLog.findMany({ where: scope, distinct: ["action"], select: { action: true } }),
    prisma.auditLog.findMany({ where: { AND: [scope, { userId: { not: null } }] }, distinct: ["userId"], select: { userId: true, userName: true }, take: 500 }),
  ]);
  return {
    items, total,
    modules: modules.map((m) => m.module).sort(),
    actions: actions.map((a) => a.action).sort(),
    users: users.map((u) => ({ id: u.userId!, name: u.userName ?? u.userId! })).sort((a, b) => a.name.localeCompare(b.name)),
    roles: roleFilterOptions(ctx),
  };
}

/** Log yang lebih baru dari `since` (untuk realtime/polling). */
export async function auditLogsSince(ctx: AuthContext, since: Date, f: Omit<AuditFilter, "page"> = {}) {
  return prisma.auditLog.findMany({
    where: { AND: [buildWhere(ctx, f), { createdAt: { gt: since } }] },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
}

/** Aktivitas terbaru untuk dashboard, dengan batas visibilitas yang sama. */
export async function recentAuditLogs(ctx: AuthContext, take = 8) {
  if (!can(ctx, "audit_logs.view")) return [];
  return prisma.auditLog.findMany({ where: auditScopeWhere(ctx), orderBy: { createdAt: "desc" }, take });
}
