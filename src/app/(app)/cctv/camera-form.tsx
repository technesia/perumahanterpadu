"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { CAMERA_STATUS } from "@/lib/labels";
import { clearCameraUrlAction, saveCameraAction } from "@/components/security-actions";

export function CameraButton({ id, initial }: { id?: string; initial?: { name: string; location: string; description: string; status: string; internalNotes: string; isActive: boolean; hasLink: boolean } }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { run, pending, errors } = useAction(saveCameraAction, { onSuccess: () => setOpen(false) });
  const clear = useAction(clearCameraUrlAction, { onSuccess: () => { setConfirm(false); setOpen(false); } });
  return (
    <>
      <Button size={id ? "sm" : "md"} variant={id ? "secondary" : "primary"} onClick={() => setOpen(true)}>{id ? "Ubah" : "Tambah Kamera"}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={id ? "Ubah Kamera" : "Tambah Kamera"}>
        <form noValidate className="grid gap-4" onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          run(id ?? null, { name: f.name, location: f.location, description: f.description, status: f.status as never, accessUrl: f.accessUrl, internalNotes: f.internalNotes, isActive: f.isActive === "on" });
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nama Kamera" name="name" required defaultValue={initial?.name} error={errors.name} />
            <TextField label="Lokasi" name="location" required defaultValue={initial?.location} error={errors.location} />
          </div>
          <SelectField label="Status Kamera" name="status" defaultValue={initial?.status ?? "UNKNOWN"} error={errors.status}>
            {Object.entries(CAMERA_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
          <TextField label="Tautan Akses (https)" name="accessUrl" type="url" autoComplete="off" error={errors.accessUrl}
            placeholder={initial?.hasLink ? "Tersimpan — kosongkan untuk mempertahankan" : "https://…"}
            hint="Disimpan di server dan tidak ditampilkan di halaman. Jangan menyertakan username/password kamera di URL." />
          <TextAreaField label="Deskripsi" name="description" defaultValue={initial?.description} error={errors.description} />
          <TextAreaField label="Catatan Internal" name="internalNotes" defaultValue={initial?.internalNotes} error={errors.internalNotes} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="accent-brand-700" /> Aktif</label>
          <div className="flex flex-wrap justify-end gap-2">
            {id && initial?.hasLink && <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>Hapus Tautan</Button>}
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={pending}>Simpan</Button>
          </div>
        </form>
      </Modal>
      {id && <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} danger loading={clear.pending} title="Hapus tautan kamera?"
        message="Kamera tetap terdaftar, tetapi tidak dapat dibuka sampai tautan baru diisi." onConfirm={() => clear.run(id)} />}
    </>
  );
}
