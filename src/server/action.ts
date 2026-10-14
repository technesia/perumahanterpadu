import "server-only";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, AuthenticationError } from "./errors";
import { getAuth } from "./auth/session";
import type { AuthContext } from "./auth/context";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function zodFieldErrors(e: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

/** Ubah error apa pun menjadi pesan aman; detail internal hanya ke log server. */
export function toActionError(e: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (e instanceof ZodError) {
    return { ok: false, error: "Periksa kembali isian formulir.", fieldErrors: zodFieldErrors(e) };
  }
  if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { ok: false, error: "Data yang sama sudah ada." };
  }
  console.error("[action error]", e);
  return { ok: false, error: "Terjadi kesalahan pada server. Silakan coba lagi." };
}

/** Pembungkus server action: wajib login, error dinormalisasi. */
export async function withAuth<T>(fn: (ctx: AuthContext) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const ctx = await getAuth();
    if (!ctx) throw new AuthenticationError();
    return await fn(ctx);
  } catch (e) {
    return toActionError(e);
  }
}

export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}
