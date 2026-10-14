import { z } from "zod";
import { prisma } from "../db";
import { assertCan, type AuthContext } from "../auth/context";
import { writeAudit } from "../audit";

export const settingsSchema = z.object({
  arrearsWindowMonths: z.coerce.number().int().min(12, "Minimal 12 bulan.").max(120, "Maksimal 120 bulan."),
  deathRecordMaxYears: z.coerce.number().int().min(1, "Minimal 1 tahun.").max(30, "Maksimal 30 tahun."),
  allowPartialPayment: z.boolean(),
  holdPendingBookings: z.boolean(),
});

export async function getSettings(ctx: AuthContext) {
  assertCan(ctx, "settings.manage");
  return prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
}

export async function updateSettings(ctx: AuthContext, input: z.input<typeof settingsSchema>) {
  assertCan(ctx, "settings.manage");
  const data = settingsSchema.parse(input);
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: ctx.organizationId }, data });
    const changed = Object.fromEntries(Object.entries(data).filter(([k, v]) => before[k as keyof typeof data] !== v).map(([k, v]) => [k, { from: before[k as keyof typeof data], to: v }]));
    await writeAudit(ctx, { action: "SETTINGS_UPDATED", module: "settings", entityType: "Organization", entityId: ctx.organizationId, summary: `Mengubah pengaturan: ${Object.keys(changed).join(", ") || "tanpa perubahan"}`, metadata: changed }, tx);
  });
}

export async function roleMatrix(ctx: AuthContext) {
  assertCan(ctx, "roles.view");
  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({ include: { permissions: { select: { permissionId: true } }, _count: { select: { users: true } } } }),
    prisma.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] }),
  ]);
  return { roles, permissions };
}
