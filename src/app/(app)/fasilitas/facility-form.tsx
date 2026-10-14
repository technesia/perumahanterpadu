"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { saveFacilityAction } from "../booking/actions";

export interface FacilityValues { name: string; description: string; location: string; capacity: string; rules: string; fee: number; openTime: string; closeTime: string; slotMinutes: number; isActive: boolean }

export function FacilityButton({ id, initial }: { id?: string; initial?: FacilityValues }) {
  const [open, setOpen] = useState(false);
  const { run, pending, errors } = useAction(saveFacilityAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size={id ? "sm" : "md"} variant={id ? "secondary" : "primary"} onClick={() => setOpen(true)}>{id ? "Ubah" : "Tambah Fasilitas"}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={id ? "Ubah Fasilitas" : "Tambah Fasilitas"}>
        <form noValidate className="grid gap-4" onSubmit={(e) => { e.preventDefault(); run(id ?? null, new FormData(e.currentTarget)); }}>
          <TextField label="Nama Gedung / Fasilitas" name="name" required defaultValue={initial?.name} error={errors.name} />
          <TextAreaField label="Deskripsi" name="description" defaultValue={initial?.description} error={errors.description} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Lokasi" name="location" defaultValue={initial?.location} error={errors.location} />
            <TextField label="Kapasitas (orang)" name="capacity" type="number" min={1} defaultValue={initial?.capacity} error={errors.capacity} />
            <TextField label="Jam Buka" name="openTime" type="time" required defaultValue={initial?.openTime ?? "08:00"} error={errors.openTime} />
            <TextField label="Jam Tutup" name="closeTime" type="time" required defaultValue={initial?.closeTime ?? "22:00"} error={errors.closeTime} />
            <SelectField label="Durasi Slot" name="slotMinutes" defaultValue={String(initial?.slotMinutes ?? 60)} error={errors.slotMinutes}>
              {[30, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m} menit</option>)}
            </SelectField>
            <TextField label="Biaya (Rp)" name="fee" type="number" min={0} defaultValue={initial?.fee ?? 0} hint="0 bila gratis." error={errors.fee} />
          </div>
          <TextAreaField label="Aturan Penggunaan" name="rules" defaultValue={initial?.rules} error={errors.rules} />
          <div>
            <label htmlFor="photo" className="label">Foto</label>
            <input id="photo" name="photo" type="file" accept=".jpg,.jpeg,.png" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-800" />
            {errors.photo && <p className="mt-1 text-xs text-red-600">{errors.photo}</p>}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="accent-brand-700" /> Aktif (dapat dipesan)</label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={pending}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
