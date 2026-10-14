import { z } from "zod";
import { prisma } from "../db";
import { assertCan, type AuthContext } from "../auth/context";
import { writeAudit } from "../audit";

export const accessControlSchema = z.object({
  accountsLocked: z.boolean().optional(),
  readOnlyMode: z.boolean().optional(),
});

export async function getAccessControls(ctx: AuthContext) {
  assertCan(ctx, "system.access_control");
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: { accountsLocked: true, readOnlyMode: true },
  });
  // Jumlah akun aktif yang terdampak (semua selain Super Admin).
  const affected = await prisma.user.count({
    where: { organizationId: ctx.organizationId, isActive: true, roles: { none: { role: { key: "SUPER_ADMIN" } } } },
  });
  return { ...org, affected };
}

/**
 * Kontrol darurat Super Admin. Mengunci akun mencabut semua sesi selain Super Admin;
 * status masing-masing akun (aktif/nonaktif) tidak diubah sehingga membuka kunci
 * mengembalikan keadaan semula.
 */
export async function setAccessControls(ctx: AuthContext, input: z.input<typeof accessControlSchema>) {
  assertCan(ctx, "system.access_control");
  const data = accessControlSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { accountsLocked: true, readOnlyMode: true },
    });
    const after = await tx.organization.update({
      where: { id: ctx.organizationId },
      data,
      select: { accountsLocked: true, readOnlyMode: true },
    });
    if (data.accountsLocked !== undefined && data.accountsLocked !== before.accountsLocked) {
      let revoked = 0;
      if (data.accountsLocked) {
        const r = await tx.userSession.updateMany({
          where: { revokedAt: null, user: { organizationId: ctx.organizationId, roles: { none: { role: { key: "SUPER_ADMIN" } } } } },
          data: { revokedAt: new Date() },
        });
        revoked = r.count;
      }
      await writeAudit(ctx, {
        action: data.accountsLocked ? "ACCOUNTS_LOCKED" : "ACCOUNTS_UNLOCKED", module: "settings",
        entityType: "Organization", entityId: ctx.organizationId,
        summary: data.accountsLocked
          ? `Menonaktifkan semua akun selain Super Admin (${revoked} sesi diakhiri)`
          : "Mengaktifkan kembali akses semua akun",
      }, tx);
    }
    if (data.readOnlyMode !== undefined && data.readOnlyMode !== before.readOnlyMode) {
      await writeAudit(ctx, {
        action: data.readOnlyMode ? "READ_ONLY_ENABLED" : "READ_ONLY_DISABLED", module: "settings",
        entityType: "Organization", entityId: ctx.organizationId,
        summary: data.readOnlyMode ? "Mengaktifkan mode lihat saja untuk semua selain Super Admin" : "Menonaktifkan mode lihat saja",
      }, tx);
    }
    return after;
  });
}
