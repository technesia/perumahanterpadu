"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { OCCUPANCY_STATUS } from "@/lib/labels";
import { saveUnitAction } from "./actions";

export interface UnitValues { houseNumber: string; block: string; address: string; occupancyStatus: string; ownerResidentId: string; notes: string; isActive: boolean }

export function UnitFormButton({ id, initial, owners, label }: {
  id?: string; initial?: Partial<UnitValues>; owners: { id: string; fullName: string }[]; label: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { run, pending, errors } = useAction(saveUnitAction, {
    onSuccess: (d) => { setOpen(false); if (!id) router.push(`/rumah/${(d as { id: string }).id}`); },
  });
  return (
    <>
      <Button variant={id ? "secondary" : "primary"} onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={id ? "Ubah Data Rumah" : "Tambah Rumah"}>
        <form noValidate className="grid gap-4" onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          run(id ?? null, {
            houseNumber: f.houseNumber, block: f.block, address: f.address, occupancyStatus: f.occupancyStatus as never,
            ownerResidentId: f.ownerResidentId, notes: f.notes, isActive: f.isActive === "on",
          });
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nomor Rumah" name="houseNumber" required defaultValue={initial?.houseNumber} placeholder="mis. A1/12" error={errors.houseNumber} />
            <TextField label="Blok" name="block" defaultValue={initial?.block} error={errors.block} />
          </div>
          <TextField label="Alamat Lengkap" name="address" required defaultValue={initial?.address} error={errors.address} />
          <SelectField label="Status Hunian" name="occupancyStatus" defaultValue={initial?.occupancyStatus ?? "PERMANENT"} error={errors.occupancyStatus}>
            {Object.entries(OCCUPANCY_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
          <SelectField label="Pemilik / Penanggung Jawab" name="ownerResidentId" defaultValue={initial?.ownerResidentId ?? ""} error={errors.ownerResidentId}>
            <option value="">— Tidak ditentukan —</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
          </SelectField>
          <TextAreaField label="Catatan" name="notes" defaultValue={initial?.notes} error={errors.notes} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="accent-brand-700" /> Rumah aktif</label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={pending}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
