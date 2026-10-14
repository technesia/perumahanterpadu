import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { hashPassword, passwordPolicyError, verifyPassword } from "../auth/password";
import type { AuthContext } from "../auth/context";

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Password lama wajib diisi."),
  newPassword: z.string().min(1, "Password baru wajib diisi."),
  confirmPassword: z.string().min(1, "Konfirmasi password wajib diisi."),
});

export async function changeOwnPassword(ctx: AuthContext, input: z.infer<typeof changePasswordSchema>) {
  const data = changePasswordSchema.parse(input);
  const policy = passwordPolicyError(data.newPassword);
  if (policy) throw new AppError(policy, "VALIDATION", { newPassword: policy });
  if (data.newPassword !== data.confirmPassword) {
    throw new AppError("Konfirmasi password tidak sama.", "VALIDATION", { confirmPassword: "Konfirmasi password tidak sama." });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!(await verifyPassword(data.currentPassword, user.passwordHash))) {
    throw new AppError("Password lama salah.", "VALIDATION", { currentPassword: "Password lama salah." });
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ctx.userId }, data: { passwordHash: await hashPassword(data.newPassword) } });
    // Cabut sesi lain; sesi saat ini tetap berlaku.
    await tx.userSession.updateMany({
      where: { userId: ctx.userId, revokedAt: null, id: { not: ctx.sessionId } },
      data: { revokedAt: new Date() },
    });
    await writeAudit(ctx, { action: "PASSWORD_CHANGED", module: "auth", summary: `${ctx.name} mengganti password`, entityType: "User", entityId: ctx.userId }, tx);
  });
}

export async function getProfile(ctx: AuthContext) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: ctx.userId },
    select: {
      name: true, username: true, email: true, phone: true, lastLoginAt: true,
      resident: {
        select: {
          code: true, fullName: true, phone: true, status: true, occupancyStatus: true,
          memberships: {
            where: { endDate: null },
            select: { relation: true, unit: { select: { houseNumber: true, block: true, address: true } } },
          },
        },
      },
    },
  });
  return user;
}
