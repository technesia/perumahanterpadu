import { apiHandler } from "@/server/http";
import { auditLogsSince } from "@/server/services/audit-logs";

export const dynamic = "force-dynamic";

/** Fallback polling: GET /api/audit-logs?since=ISO&module=&q= */
export function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const since = new Date(u.get("since") ?? Date.now());
  return apiHandler((ctx) => auditLogsSince(ctx, Number.isNaN(since.getTime()) ? new Date() : since, {
    module: u.get("module") || undefined, q: u.get("q") || undefined,
  }));
}
