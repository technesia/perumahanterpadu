import { z } from "zod";
import { apiHandler } from "@/server/http";
import { listNotifications, markNotificationsRead } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

export function GET() {
  return apiHandler((ctx) => listNotifications(ctx));
}

const body = z.object({ ids: z.union([z.literal("all"), z.array(z.string().max(40)).max(100)]) });

export function POST(req: Request) {
  return apiHandler(async (ctx) => {
    const { ids } = body.parse(await req.json());
    await markNotificationsRead(ctx, ids);
    return { ok: true };
  }, { mutation: true });
}
