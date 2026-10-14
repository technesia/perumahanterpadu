import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { assertCan, type AuthContext } from "../auth/context";
import { pageParams } from "../validation";
import { dateOnly } from "@/lib/dates";

export interface AuditFilter { q?: string; module?: string; userId?: string; from?: string; to?: string; page: number }

function buildWhere(ctx: AuthContext, f: Omit<AuditFilter, "page">): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = { organizationId: ctx.organizationId };
  if (f.module) where.module = f.module;
  if (f.userId) where.userId = f.userId;
  const range: Prisma.DateTimeFilter = {};
  try {
    // Batas tanggal mengikuti WIB (UTC+7).
    if (f.from) range.gte = new Date(dateOnly(f.from).getTime() - 7 * 3600_000);
    if (f.to) range.lt = new Date(dateOnly(f.to).getTime() + 17 * 3600_000);
  } catch { /* abaikan tanggal tidak valid */ }
  if (Object.keys(range).length) where.createdAt = range;
  if (f.q) {
    const q = f.q.trim().slice(0, 80);
    where.OR = [
      { summary: { contains: q, mode: "insensitive" } },
      { userName: { contains: q, mode: "insensitive" } },
      { action: { contains: q, mode: "insensitive" } },
      { entityId: q },
    ];
  }
  return where;
}

/** Hanya baca. Tidak ada fungsi ubah/hapus audit log (ditegakkan juga oleh trigger DB). */
export async function listAuditLogs(ctx: AuthContext, f: AuditFilter, pageSize = 30) {
  assertCan(ctx, "audit_logs.view");
  const where = buildWhere(ctx, f);
  const [items, total, modules] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...pageParams(f.page, pageSize) }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where: { organizationId: ctx.organizationId }, distinct: ["module"], select: { module: true } }),
  ]);
  return { items, total, modules: modules.map((m) => m.module).sort() };
}

/** Log yang lebih baru dari `since` (untuk realtime/polling). */
export async function auditLogsSince(ctx: AuthContext, since: Date, f: Omit<AuditFilter, "page"> = {}) {
  assertCan(ctx, "audit_logs.view");
  return prisma.auditLog.findMany({
    where: { ...buildWhere(ctx, f), createdAt: { gt: since } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
}
