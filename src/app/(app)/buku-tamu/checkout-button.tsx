"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useAction } from "@/components/ui/use-action";
import { checkOutAction } from "@/components/security-actions";

export function CheckOutButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const a = useAction(checkOutAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Catat Keluar</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} loading={a.pending} title="Catat tamu keluar?"
        message={`${name} akan dicatat keluar sekarang.`} confirmLabel="Catat Keluar" onConfirm={() => a.run(id)} />
    </>
  );
}
