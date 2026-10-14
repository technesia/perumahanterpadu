"use server";
import type { z } from "zod";
import { withAuth } from "@/server/action";
import { fileFromForm } from "@/server/storage";
import { correctTransaction, createTransaction, setOpeningBalance, voidTransaction, type openingBalanceSchema } from "@/server/services/finance";

function txInput(fd: FormData) {
  const g = (k: string) => String(fd.get(k) ?? "");
  return {
    date: g("date"), categoryId: g("categoryId"), description: g("description"), amount: g("amount") as never,
    method: g("method") as never, reference: g("reference"), counterparty: g("counterparty"), notes: g("notes"),
  };
}

export async function createTransactionAction(fd: FormData) {
  return withAuth(async (ctx) => {
    const type = fd.get("type") === "INCOME" ? "INCOME" : "EXPENSE";
    const t = await createTransaction(ctx, type, txInput(fd), await fileFromForm(fd.get("attachment")));
    return { ok: true, data: { id: t.id }, message: `Transaksi ${t.number} tercatat.` };
  });
}

export async function correctTransactionAction(id: string, fd: FormData) {
  return withAuth(async (ctx) => {
    await correctTransaction(ctx, id, txInput(fd), String(fd.get("reason") ?? ""), await fileFromForm(fd.get("attachment")));
    return { ok: true, message: "Koreksi tersimpan dan tercatat di histori." };
  });
}

export async function voidTransactionAction(id: string, reason: string) {
  return withAuth(async (ctx) => {
    await voidTransaction(ctx, id, reason);
    return { ok: true, message: "Transaksi dibatalkan. Saldo kas diperbarui." };
  });
}

export async function setOpeningBalanceAction(input: z.input<typeof openingBalanceSchema>) {
  return withAuth(async (ctx) => {
    await setOpeningBalance(ctx, input);
    return { ok: true, message: "Saldo awal disimpan." };
  });
}
