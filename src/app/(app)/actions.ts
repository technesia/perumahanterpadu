"use server";
import { redirect } from "next/navigation";
import { getAuth, clearSessionCookie } from "@/server/auth/session";
import { logout } from "@/server/auth/service";

export async function logoutAction() {
  const ctx = await getAuth();
  if (ctx) await logout(ctx);
  await clearSessionCookie();
  redirect("/login");
}
