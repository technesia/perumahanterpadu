import { apiHandler } from "@/server/http";
import { searchResidentsLite } from "@/server/services/residents";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return apiHandler((ctx) => searchResidentsLite(ctx, q));
}
