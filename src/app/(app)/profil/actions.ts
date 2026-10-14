"use server";
import { withAuth } from "@/server/action";
import { changeOwnPassword } from "@/server/services/profile";

export async function changePasswordAction(input: { currentPassword: string; newPassword: string; confirmPassword: string }) {
  return withAuth(async (ctx) => {
    await changeOwnPassword(ctx, input);
    return { ok: true, message: "Password berhasil diganti." };
  });
}
