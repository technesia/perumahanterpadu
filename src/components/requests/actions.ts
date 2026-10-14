"use server";
import type { z } from "zod";
import { withAuth } from "@/server/action";
import { fileFromForm, type UploadInput } from "@/server/storage";
import { cancelOwnRequest, processRequest, saveRequestType, submitRequest, type processRequestSchema, type requestTypeSchema } from "@/server/services/admin-requests";

export async function submitRequestAction(fd: FormData) {
  return withAuth(async (ctx) => {
    const docs: UploadInput[] = [];
    for (const v of fd.getAll("documents")) {
      const f = await fileFromForm(v);
      if (f) docs.push(f);
    }
    const r = await submitRequest(ctx, {
      typeId: String(fd.get("typeId") ?? ""), purpose: String(fd.get("purpose") ?? ""),
      contactPhone: String(fd.get("contactPhone") ?? ""), applicantNotes: String(fd.get("applicantNotes") ?? ""),
    }, docs);
    return { ok: true, data: { id: r.id }, message: `Pengajuan ${r.number} terkirim. Pengurus akan memprosesnya.` };
  });
}

export async function processRequestAction(id: string, input: z.input<typeof processRequestSchema>) {
  return withAuth(async (ctx) => {
    await processRequest(ctx, id, input);
    return { ok: true, message: "Status pengajuan diperbarui." };
  });
}

export async function cancelRequestAction(id: string) {
  return withAuth(async (ctx) => {
    await cancelOwnRequest(ctx, id);
    return { ok: true, message: "Pengajuan dibatalkan." };
  });
}

export async function saveRequestTypeAction(id: string | null, input: z.input<typeof requestTypeSchema>) {
  return withAuth(async (ctx) => {
    await saveRequestType(ctx, id, input);
    return { ok: true, message: "Jenis pengajuan disimpan." };
  });
}
