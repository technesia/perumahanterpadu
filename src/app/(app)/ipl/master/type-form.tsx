"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { saveIplTypeAction } from "../actions";

export function IplTypeButton({ id, initial }: { id?: string; initial?: { name: string; amount: number; dueDay: number; isActive: boolean; description: string } }) {
  const [open, setOpen] = useState(false);
  const { run, pending, errors } = useAction(saveIplTypeAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size={id ? "sm" : "md"} variant={id ? "secondary" : "primary"} onClick={() => setOpen(true)}>{id ? "Ubah" : "Tambah Jenis Iuran"}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={id ? "Ubah Jenis Iuran" : "Tambah Jenis Iuran"}>
        <form noValidate className="grid gap-4" onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          run(id ?? null, { name: f.name, amount: f.amount as never, dueDay: f.dueDay as never, isActive: f.isActive === "on", description: f.description });
        }}>
          <TextField label="Nama Jenis Iuran" name="name" required defaultValue={initial?.name} placeholder="mis. IPL Bulanan" error={errors.name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nominal per Bulan (Rp)" name="amount" type="number" min={1} step={1} required defaultValue={initial?.amount} error={errors.amount} />
            <TextField label="Tanggal Jatuh Tempo" name="dueDay" type="number" min={1} max={28} required defaultValue={initial?.dueDay ?? 10} hint="Tanggal 1–28 setiap bulan." error={errors.dueDay} />
          </div>
          <TextField label="Periode" name="period" value="Bulanan" disabled />
          <TextAreaField label="Keterangan" name="description" defaultValue={initial?.description} error={errors.description} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="accent-brand-700" /> Aktif</label>
          {id && <p className="text-xs text-slate-500">Perubahan nominal hanya berlaku untuk tagihan yang diterbitkan setelahnya.</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={pending}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
