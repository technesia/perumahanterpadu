import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { openingTemplate, residentTemplate } from "@/server/services/imports";
import { XLSX_MIME } from "@/server/excel";

export const dynamic = "force-dynamic";

/** Template impor resmi. GET /api/templates/tunggakan-ipl | /api/templates/data-warga */
const TEMPLATES = {
  "tunggakan-ipl": { perm: "ipl.opening_manage", file: "Template Riwayat Tunggakan IPL.xlsx", build: openingTemplate },
  "data-warga": { perm: "residents.create", file: "Template Data Warga.xlsx", build: residentTemplate },
} as const;

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const ctx = await getAuth();
  if (!ctx) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  const { name } = await params;
  const t = TEMPLATES[name as keyof typeof TEMPLATES];
  if (!t) return NextResponse.json({ error: "Template tidak ditemukan" }, { status: 404 });
  if (!can(ctx, t.perm)) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  const data = await t.build();
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(t.file)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
