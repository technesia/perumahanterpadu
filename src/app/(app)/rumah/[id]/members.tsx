"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { SelectField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { MEMBERSHIP_RELATION } from "@/lib/labels";
import { addMemberAction, endMemberAction } from "../actions";

const today = () => new Date().toISOString().slice(0, 10);

export function AddMemberButton({ unitId, residents }: { unitId: string; residents: { id: string; fullName: string; code: string }[] }) {
  const [open, setOpen] = useState(false);
  const { run, pending, errors } = useAction(addMemberAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Tambah Penghuni</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Tambah Penghuni">
        <form noValidate className="grid gap-4" onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          run(unitId, { residentId: f.residentId, relation: f.relation as never, startDate: f.startDate });
        }}>
          <SelectField label="Warga" name="residentId" required error={errors.residentId}>
            <option value="">— Pilih warga —</option>
            {residents.map((r) => <option key={r.id} value={r.id}>{r.fullName} ({r.code})</option>)}
          </SelectField>
          <SelectField label="Hubungan" name="relation" defaultValue="HEAD">
            {Object.entries(MEMBERSHIP_RELATION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
          <TextField label="Mulai Tinggal" name="startDate" type="date" required defaultValue={today()} error={errors.startDate} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={pending}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function EndMemberButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const { run, pending, errors } = useAction(endMemberAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Akhiri</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} loading={pending} onConfirm={() => run(id, date)}
        title="Akhiri masa tinggal?" confirmLabel="Simpan"
        message={`${name} dicatat tidak lagi tinggal di rumah ini. Histori dan tagihan tidak dihapus.`}>
        <TextField label="Tanggal selesai" name="endDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.endDate} />
      </ConfirmDialog>
    </>
  );
}
