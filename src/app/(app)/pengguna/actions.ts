"use server";
import type { z } from "zod";
import { withAuth } from "@/server/action";
import { changeUserRole, createUser, resetUserPassword, setUserActive, type createUserSchema } from "@/server/services/users";
import type { RoleKey } from "@/server/rbac/permissions";

export async function createUserAction(input: z.input<typeof createUserSchema>) {
  return withAuth(async (ctx) => {
    const u = await createUser(ctx, input);
    return { ok: true, message: `Akun ${u.username} berhasil dibuat.` };
  });
}
export async function changeRoleAction(userId: string, role: RoleKey) {
  return withAuth(async (ctx) => {
    await changeUserRole(ctx, userId, role);
    return { ok: true, message: "Role diperbarui. Pengguna perlu masuk ulang." };
  });
}
export async function setActiveAction(userId: string, active: boolean) {
  return withAuth(async (ctx) => {
    await setUserActive(ctx, userId, active);
    return { ok: true, message: active ? "Akun diaktifkan." : "Akun dinonaktifkan dan sesinya diakhiri." };
  });
}
export async function resetPasswordAction(userId: string, password: string) {
  return withAuth(async (ctx) => {
    await resetUserPassword(ctx, userId, password);
    return { ok: true, message: "Password direset. Sampaikan password baru secara langsung ke pengguna." };
  });
}
