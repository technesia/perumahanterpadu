import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth/session";
import { cameraAccessUrl } from "@/server/services/security";

export const dynamic = "force-dynamic";

/** Redirect ke tautan kamera setelah cek izin. URL tidak pernah dirender di halaman. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  try {
    const url = await cameraAccessUrl(ctx, (await params).id);
    return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ error: "Kamera tidak tersedia atau Anda tidak memiliki akses." }, { status: 404 });
  }
}
