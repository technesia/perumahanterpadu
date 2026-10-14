import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadSession, sessionTtlMs } from "./service";
import type { AuthContext } from "./context";
import type { PermissionKey } from "../rbac/permissions";

export const SESSION_COOKIE = "tprm_session";

/**
 * IP klien untuk rate limiting & audit. Header X-Forwarded-For hanya dipercaya bila aplikasi
 * berada di belakang reverse proxy tepercaya (TRUST_PROXY=true); tanpa itu header dapat dipalsukan.
 */
export async function clientIp(): Promise<string | null> {
  if (process.env.TRUST_PROXY !== "true") return null;
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || null;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // LOCAL_HTTP=true hanya untuk menjalankan build production lewat http://localhost (Docker lokal).
    secure: process.env.NODE_ENV === "production" && process.env.LOCAL_HTTP !== "true",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(sessionTtlMs() / 1000),
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Konteks autentikasi untuk request saat ini (di-cache per request). */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const ctx = await loadSession(token);
  if (ctx) ctx.ip = await clientIp();
  return ctx;
});

/** Untuk halaman: redirect ke login bila belum masuk, ke /akses-ditolak bila tanpa izin. */
export async function requirePage(perms?: PermissionKey | PermissionKey[]): Promise<AuthContext> {
  const ctx = await getAuth();
  if (!ctx) redirect("/login");
  if (perms) {
    const list = Array.isArray(perms) ? perms : [perms];
    if (!list.some((p) => ctx.permissions.has(p))) redirect("/akses-ditolak");
  }
  return ctx;
}
