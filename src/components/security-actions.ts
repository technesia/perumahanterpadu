"use server";
import type { z } from "zod";
import { withAuth } from "@/server/action";
import { fileFromForm, type UploadInput } from "@/server/storage";
import { checkIn, checkOut, clearCameraUrl, createIncident, reviewIncident, saveCamera, type cameraSchema, type checkInSchema, type reviewIncidentSchema } from "@/server/services/security";

export async function checkInAction(input: z.input<typeof checkInSchema>) {
  return withAuth(async (ctx) => {
    const v = await checkIn(ctx, input);
    return { ok: true, data: { id: v.id }, message: `Tamu ${v.visitorName} tercatat masuk.` };
  });
}
export async function checkOutAction(id: string) {
  return withAuth(async (ctx) => { await checkOut(ctx, id); return { ok: true, message: "Tamu tercatat keluar." }; });
}
export async function createIncidentAction(fd: FormData) {
  return withAuth(async (ctx) => {
    const files: UploadInput[] = [];
    for (const v of fd.getAll("attachments")) { const f = await fileFromForm(v); if (f) files.push(f); }
    const inc = await createIncident(ctx, {
      type: String(fd.get("type") ?? "") as never, occurredAt: String(fd.get("occurredAt") ?? ""),
      location: String(fd.get("location") ?? ""), description: String(fd.get("description") ?? ""),
    }, files);
    return { ok: true, data: { id: inc.id }, message: `Laporan ${inc.number} terkirim ke pengurus.` };
  });
}
export async function reviewIncidentAction(id: string, input: z.input<typeof reviewIncidentSchema>) {
  return withAuth(async (ctx) => { await reviewIncident(ctx, id, input); return { ok: true, message: "Tindak lanjut disimpan." }; });
}
export async function saveCameraAction(id: string | null, input: z.input<typeof cameraSchema>) {
  return withAuth(async (ctx) => { await saveCamera(ctx, id, input); return { ok: true, message: "Data kamera disimpan." }; });
}
export async function clearCameraUrlAction(id: string) {
  return withAuth(async (ctx) => { await clearCameraUrl(ctx, id); return { ok: true, message: "Tautan kamera dihapus." }; });
}
