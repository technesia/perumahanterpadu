"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { archiveResidentAction } from "../actions";

export function ArchiveButton({ id, archived, name }: { id: string; archived: boolean; name: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending, errors } = useAction(archiveResidentAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant={archived ? "secondary" : "danger"} onClick={() => setOpen(true)}>{archived ? "Pulihkan" : "Arsipkan"}</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} loading={pending} danger={!archived}
        title={archived ? "Pulihkan warga?" : "Arsipkan warga?"}
        confirmLabel={archived ? "Pulihkan" : "Arsipkan"}
        message={archived ? `${name} akan kembali tampil di daftar warga.` : `${name} akan disembunyikan dari daftar aktif. Histori IPL, pembayaran, dan pengajuan tetap tersimpan.`}
        onConfirm={() => run(id, !archived, reason)}>
        {!archived && <TextField label="Alasan" name="reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />}
      </ConfirmDialog>
    </>
  );
}
