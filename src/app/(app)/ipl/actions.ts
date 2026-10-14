"use server";
import type { z } from "zod";
import { withAuth } from "@/server/action";
import { generateBills, saveIplType, unitBills, voidBill, type generateBillsSchema, type iplTypeSchema } from "@/server/services/ipl";
import { approvePayment, cancelOwnPayment, rejectPayment, submitPayment } from "@/server/services/ipl-payments";
import { fileFromForm } from "@/server/storage";
import { periodLabel } from "@/lib/format";

export async function saveIplTypeAction(id: string | null, input: z.input<typeof iplTypeSchema>) {
  return withAuth(async (ctx) => {
    await saveIplType(ctx, id, input);
    return { ok: true, message: "Jenis iuran disimpan. Tagihan yang sudah terbit tidak berubah." };
  });
}

export async function generateBillsAction(input: z.input<typeof generateBillsSchema>) {
  return withAuth(async (ctx) => {
    const r = await generateBills(ctx, input);
    return { ok: true, message: `${r.created} tagihan diterbitkan untuk ${r.units} rumah${r.skipped ? `, ${r.skipped} sudah ada (dilewati)` : ""}.` };
  });
}

export async function voidBillAction(billId: string, reason: string) {
  return withAuth(async (ctx) => {
    await voidBill(ctx, billId, reason);
    return { ok: true, message: "Tagihan dibatalkan." };
  });
}

/** Daftar periode yang dapat dibayar untuk rumah tertentu (dengan otorisasi kepemilikan). */
export async function payableBillsAction(unitId: string) {
  return withAuth(async (ctx) => {
    const { items } = await unitBills(ctx, unitId);
    const payable = items
      .filter((b) => b.displayStatus === "UNPAID" || b.displayStatus === "PARTIAL" || b.displayStatus === "NOT_DUE")
      .map((b) => ({
        id: b.id, label: periodLabel(b.periodYear, b.periodMonth), year: b.periodYear, month: b.periodMonth,
        typeName: b.typeName, amount: b.amount, outstanding: b.outstanding, arrears: b.arrears, status: b.displayStatus,
      }));
    const pending = items.filter((b) => b.displayStatus === "PENDING").map((b) => periodLabel(b.periodYear, b.periodMonth));
    return { ok: true, data: { payable, pending } };
  }, { readOnly: true });
}

export async function submitPaymentAction(fd: FormData) {
  return withAuth(async (ctx) => {
    const billIds = fd.getAll("billIds").map(String);
    const amounts: Record<string, number> = {};
    for (const id of billIds) {
      const v = fd.get(`amount_${id}`);
      if (typeof v === "string" && v) amounts[id] = Number(v);
    }
    const p = await submitPayment(ctx, {
      residentId: String(fd.get("residentId") ?? "") || undefined,
      unitId: String(fd.get("unitId") ?? ""),
      billIds,
      amounts: Object.keys(amounts).length ? amounts : undefined,
      method: String(fd.get("method") ?? "") as never,
      notes: String(fd.get("notes") ?? ""),
      idempotencyKey: String(fd.get("idempotencyKey") ?? "") || undefined,
    }, await fileFromForm(fd.get("proof")));
    return { ok: true, data: { id: p.id }, message: "Pengajuan pembayaran terkirim dan menunggu verifikasi pengurus." };
  });
}

export async function approvePaymentAction(id: string, note: string) {
  return withAuth(async (ctx) => {
    await approvePayment(ctx, id, note);
    return { ok: true, message: "Pembayaran disetujui. Status IPL dan kas diperbarui." };
  });
}

export async function rejectPaymentAction(id: string, reason: string) {
  return withAuth(async (ctx) => {
    await rejectPayment(ctx, id, reason);
    return { ok: true, message: "Pembayaran ditolak. Warga akan menerima alasan penolakan." };
  });
}

export async function cancelPaymentAction(id: string) {
  return withAuth(async (ctx) => {
    await cancelOwnPayment(ctx, id);
    return { ok: true, message: "Pengajuan dibatalkan." };
  });
}
