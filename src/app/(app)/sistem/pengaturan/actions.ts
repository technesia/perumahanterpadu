"use server";
import type { z } from "zod";
import { withAuth } from "@/server/action";
import { updateSettings, type settingsSchema } from "@/server/services/settings";

export async function withAuthAction(input: z.input<typeof settingsSchema>) {
  return withAuth(async (ctx) => {
    await updateSettings(ctx, input);
    return { ok: true };
  });
}
