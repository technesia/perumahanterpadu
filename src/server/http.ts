import "server-only";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "./auth/session";
import { toActionError } from "./action";
import type { AuthContext } from "./auth/context";

/** Proteksi CSRF untuk route handler mutasi: Origin harus sama dengan Host. */
export async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host || new URL(origin).host !== host) return false;
  return true;
}

export async function apiHandler(fn: (ctx: AuthContext) => Promise<unknown>, opts: { mutation?: boolean } = {}) {
  const ctx = await getAuth();
  if (!ctx) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (opts.mutation && !(await assertSameOrigin())) {
    return NextResponse.json({ error: "Permintaan ditolak" }, { status: 403 });
  }
  try {
    return NextResponse.json(await fn(ctx), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const r = toActionError(e);
    return NextResponse.json({ error: r.error }, { status: 400 });
  }
}
