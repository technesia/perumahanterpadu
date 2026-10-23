"use server";
import type { z } from "zod";
import { withAuth } from "@/server/action";
import {
  cancelOpeningBill, correctOpeningBill, createOpeningArrears, openingCorrections, type correctionSchema, type OpeningInput,
} from "@/server/services/ipl-opening";
import { confirmOpeningImport, importFileFromForm, previewOpeningImport } from "@/server/services/imports";
import { rupiah } from "@/lib/format";

export async function createOpeningAction(input: OpeningInput) {
  return withAuth(async (ctx) => {
    const r = await createOpeningArrears(ctx, input);
    return { ok: true, message: `${r.count} data tunggakan awal tercatat (sisa ${rupiah(r.outstanding)}). Tidak dicatat sebagai pemasukan kas.` };
  });
}

export async function correctOpeningAction(billId: string, input: z.input<typeof correctionSchema>) {
  return withAuth(async (ctx) => {
    await correctOpeningBill(ctx, billId, input);
    return { ok: true, message: "Koreksi tersimpan dan tercatat di riwayat koreksi." };
  });
}

export async function cancelOpeningAction(billId: string, reason: string) {
  return withAuth(async (ctx) => {
    await cancelOpeningBill(ctx, billId, reason);
    return { ok: true, message: "Tunggakan awal dibatalkan." };
  });
}

export async function openingHistoryAction(billId: string) {
  return withAuth(async (ctx) => ({ ok: true, data: await openingCorrections(ctx, billId) }), { readOnly: true });
}

/** Pratinjau impor: TIDAK menyimpan data apa pun. */
export async function previewOpeningImportAction(fd: FormData) {
  return withAuth(async (ctx) => ({ ok: true, data: await previewOpeningImport(ctx, await importFileFromForm(fd), String(fd.get("iplTypeId") ?? "")) }), { readOnly: true });
}

export async function confirmOpeningImportAction(fd: FormData) {
  return withAuth(async (ctx) => {
    const r = await confirmOpeningImport(ctx, await importFileFromForm(fd), String(fd.get("iplTypeId") ?? ""), String(fd.get("hash") ?? ""));
    return { ok: true, message: `${r.imported} data tunggakan awal diimpor (sisa piutang ${rupiah(r.outstanding)})${r.skipped ? `, ${r.skipped} baris dilewati` : ""}.` };
  });
}
