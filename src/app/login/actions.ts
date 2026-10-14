"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { authenticate } from "@/server/auth/service";
import { clientIp, setSessionCookie } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/action";

const schema = z.object({
  identifier: z.string().trim().min(1, "Email atau username wajib diisi.").max(120),
  password: z.string().min(1, "Password wajib diisi.").max(128),
});

export async function loginAction(input: { identifier: string; password: string }): Promise<ActionResult> {
  try {
    const data = schema.parse(input);
    const { token } = await authenticate({
      ...data,
      ip: await clientIp(),
      userAgent: (await headers()).get("user-agent"),
    });
    await setSessionCookie(token);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
