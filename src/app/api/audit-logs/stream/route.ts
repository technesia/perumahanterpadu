import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { auditLogsSince } from "@/server/services/audit-logs";

export const dynamic = "force-dynamic";

const POLL_MS = 3000;
const MAX_LIFETIME_MS = 5 * 60_000; // klien EventSource menyambung ulang otomatis

/**
 * Server-Sent Events untuk Activity Log. Sumber data tetap tabel audit_logs;
 * server memeriksa log baru tiap 3 detik dan mendorongnya ke browser.
 */
export async function GET(req: Request) {
  const ctx = await getAuth();
  if (!ctx) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (!can(ctx, "audit_logs.view")) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  const u = new URL(req.url).searchParams;
  const filter = { module: u.get("module") || undefined, q: u.get("q") || undefined };
  const start = new Date(u.get("since") ?? Date.now());
  let last = Number.isNaN(start.getTime()) ? new Date() : start;
  const enc = new TextEncoder();
  const began = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => controller.enqueue(enc.encode(s));
      send(`retry: 5000\n\n`);
      while (!req.signal.aborted && Date.now() - began < MAX_LIFETIME_MS) {
        try {
          const rows = await auditLogsSince(ctx, last, filter);
          if (rows.length) {
            last = rows[rows.length - 1].createdAt;
            send(`event: logs\ndata: ${JSON.stringify(rows)}\n\n`);
          } else {
            send(`: ping\n\n`);
          }
        } catch {
          break;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      try { controller.close(); } catch { /* sudah ditutup */ }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
