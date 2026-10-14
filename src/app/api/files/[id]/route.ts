import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth/session";
import { authorizeFile } from "@/server/services/files";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth();
  if (!ctx) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  const { id } = await params;
  const res = await authorizeFile(ctx, id).catch(() => null);
  if (!res) return NextResponse.json({ error: "Berkas tidak ditemukan" }, { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(res.data), {
    headers: {
      "Content-Type": res.file.mimeType,
      "Content-Length": String(res.data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(res.file.originalName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
