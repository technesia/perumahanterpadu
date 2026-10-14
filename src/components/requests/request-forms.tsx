"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { cancelRequestAction, processRequestAction, saveRequestTypeAction, submitRequestAction } from "./actions";

export function NewRequestForm({ types, phone }: { types: { id: string; name: string }[]; phone: string }) {
  const router = useRouter();
  const { run, pending, errors } = useAction(submitRequestAction, { refresh: false, onSuccess: (d) => router.push(`/pengajuan/${(d as { id: string }).id}`) });
  return (
    <form noValidate className="grid gap-4" onSubmit={(e) => { e.preventDefault(); run(new FormData(e.currentTarget)); }}>
      <SelectField label="Jenis Pengajuan" name="typeId" required error={errors.typeId}>
        <option value="">— Pilih jenis —</option>
        {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </SelectField>
      <TextAreaField label="Tujuan / Keterangan" name="purpose" required rows={4} placeholder="mis. Persyaratan pembuatan rekening bank" error={errors.purpose} />
      <TextField label="Nomor HP yang dapat dihubungi" name="contactPhone" inputMode="tel" defaultValue={phone} error={errors.contactPhone} />
      <div>
        <label htmlFor="documents" className="label">Dokumen Pendukung</label>
        <input id="documents" name="documents" type="file" multiple accept=".jpg,.jpeg,.png,.pdf"
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-800" />
        <p className="mt-1 text-xs text-slate-500">Opsional, maks. 5 berkas JPG/PNG/PDF. Dokumen disimpan privat.</p>
        {errors.documents && <p className="mt-1 text-xs font-medium text-red-600">{errors.documents}</p>}
      </div>
      <TextAreaField label="Catatan Tambahan" name="applicantNotes" error={errors.applicantNotes} />
      <div><Button type="submit" loading={pending}>Kirim Pengajuan</Button></div>
    </form>
  );
}

export function ProcessRequest({ id, status, internalNotes }: { id: string; status: string; internalNotes: string }) {
  const [next, setNext] = useState(status === "SUBMITTED" ? "PROCESSING" : "APPROVED");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState(internalNotes);
  const a = useAction(processRequestAction, { onSuccess: () => { setOpen(false); setNote(""); } });
  const options = status === "SUBMITTED"
    ? [["PROCESSING", "Diproses"], ["APPROVED", "Disetujui"], ["REJECTED", "Ditolak"]]
    : [["APPROVED", "Disetujui"], ["REJECTED", "Ditolak"]];
  return (
    <div className="grid gap-3">
      <SelectField label="Ubah Status Menjadi" name="next" value={next} onChange={(e) => setNext(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </SelectField>
      <TextAreaField label={next === "REJECTED" ? "Alasan Penolakan (dikirim ke warga)" : "Catatan untuk Warga"} name="note" required={next === "REJECTED"}
        value={note} onChange={(e) => setNote(e.target.value)} error={a.errors.note} />
      <TextAreaField label="Catatan Internal (tidak terlihat warga)" name="internal" value={internal} onChange={(e) => setInternal(e.target.value)} />
      <div><Button variant={next === "REJECTED" ? "danger" : "primary"} onClick={() => setOpen(true)}>Simpan Status</Button></div>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} loading={a.pending} danger={next === "REJECTED"} title="Perbarui status pengajuan?"
        message="Pemohon akan menerima notifikasi perubahan status." onConfirm={() => a.run(id, { status: next as never, note, internalNotes: internal })} />
    </div>
  );
}

export function CancelRequestButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const a = useAction(cancelRequestAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Batalkan Pengajuan</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} danger loading={a.pending} title="Batalkan pengajuan?"
        message="Pengajuan yang dibatalkan tidak akan diproses." confirmLabel="Batalkan" onConfirm={() => a.run(id)} />
    </>
  );
}

export function RequestTypesButton({ types }: { types: { id: string; name: string; isActive: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const a = useAction(saveRequestTypeAction, { onSuccess: () => setName("") });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Jenis Pengajuan</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Jenis Pengajuan">
        <ul className="mb-4 divide-y divide-slate-100 rounded-lg border text-sm">
          {types.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className={t.isActive ? "" : "text-slate-400 line-through"}>{t.name}</span>
              <Button size="sm" variant="ghost" onClick={() => a.run(t.id, { name: t.name, isActive: !t.isActive })}>{t.isActive ? "Nonaktifkan" : "Aktifkan"}</Button>
            </li>
          ))}
        </ul>
        <form noValidate className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); a.run(null, { name, isActive: true }); }}>
          <div className="flex-1"><TextField label="Jenis baru" name="typeName" value={name} onChange={(e) => setName(e.target.value)} error={a.errors.name} /></div>
          <Button type="submit" loading={a.pending}>Tambah</Button>
        </form>
      </Modal>
    </>
  );
}
