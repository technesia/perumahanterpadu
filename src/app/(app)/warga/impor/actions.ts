"use server";
import { withAuth } from "@/server/action";
import { confirmResidentImport, importFileFromForm, previewResidentImport } from "@/server/services/imports";

/** Pratinjau impor: TIDAK menyimpan data apa pun. */
export async function previewResidentImportAction(fd: FormData) {
  return withAuth(async (ctx) => ({ ok: true, data: await previewResidentImport(ctx, await importFileFromForm(fd)) }), { readOnly: true });
}

export async function confirmResidentImportAction(fd: FormData) {
  return withAuth(async (ctx) => {
    const r = await confirmResidentImport(ctx, await importFileFromForm(fd), String(fd.get("hash") ?? ""));
    return { ok: true, message: `${r.imported} warga ditambahkan${r.skipped ? `, ${r.skipped} baris dilewati` : ""}.` };
  });
}
