import { NextResponse } from "next/server";
import { getQrisProvider } from "@/server/payments/qris";
import { applyProviderEvent } from "@/server/services/ipl-payments";

export const dynamic = "force-dynamic";

/**
 * Webhook provider QRIS. Signature diverifikasi oleh adapter provider (parseWebhook).
 * Selama provider belum dikonfigurasi, endpoint ini selalu menolak (503).
 */
export async function POST(req: Request) {
  const provider = getQrisProvider();
  if (!provider) return NextResponse.json({ error: "QRIS belum dikonfigurasi" }, { status: 503 });
  const raw = await req.text();
  let event;
  try {
    event = await provider.parseWebhook(raw, req.headers);
  } catch {
    return NextResponse.json({ error: "Signature tidak valid" }, { status: 401 });
  }
  try {
    const result = await applyProviderEvent(provider.name, event);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[qris webhook]", e);
    return NextResponse.json({ error: "Tidak dapat diproses" }, { status: 422 });
  }
}
