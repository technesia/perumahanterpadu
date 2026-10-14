"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { TextAreaField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { voidTransactionAction } from "../actions";

export function VoidTransactionButton({ id, number }: { id: string; number: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const a = useAction(voidTransactionAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>Batalkan Transaksi</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} danger loading={a.pending} title={`Batalkan ${number}?`}
        message="Transaksi tidak dihapus, tetapi ditandai Dibatalkan dan tidak dihitung dalam saldo kas." confirmLabel="Batalkan Transaksi"
        onConfirm={() => a.run(id, reason)}>
        <TextAreaField label="Alasan pembatalan" name="reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={a.errors.reason} />
      </ConfirmDialog>
    </>
  );
}
