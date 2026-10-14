"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { ACTIVITY_STATUS, AUDIENCE, PUBLISH_STATUS } from "@/lib/labels";
import { saveActivityAction, saveAnnouncementAction, saveBusinessAction, savePosyanduAction } from "./actions";

type Values = Record<string, string | number | boolean | null | undefined>;
const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
const FileInput = ({ name, label, accept, error }: { name: string; label: string; accept: string; error?: string }) => (
  <div>
    <label htmlFor={name} className="label">{label}</label>
    <input id={name} name={name} type="file" accept={accept} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-800" />
    {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
  </div>
);

function FormModal({ title, trigger, action, children }: {
  title: string; trigger: { label: string; small?: boolean };
  action: (fd: FormData) => Promise<{ ok: true; data?: unknown; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }>;
  children: (errors: Record<string, string>) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, errors } = useAction(action, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size={trigger.small ? "sm" : "md"} variant={trigger.small ? "secondary" : "primary"} onClick={() => setOpen(true)}>{trigger.label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <form noValidate className="grid gap-4" onSubmit={(e) => { e.preventDefault(); run(new FormData(e.currentTarget)); }}>
          {children(errors)}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={pending}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function AnnouncementForm({ initial, categories }: { initial?: Values; categories: readonly string[] }) {
  return (
    <FormModal title={initial ? "Ubah Pengumuman" : "Buat Pengumuman"} trigger={{ label: initial ? "Ubah" : "Buat Pengumuman", small: !!initial }} action={saveAnnouncementAction}>
      {(e) => <>
        <input type="hidden" name="id" value={str(initial?.id) ?? ""} />
        <TextField label="Judul" name="title" required defaultValue={str(initial?.title)} error={e.title} />
        <TextAreaField label="Isi" name="body" required rows={7} defaultValue={str(initial?.body)} error={e.body} />
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Kategori" name="category" defaultValue={str(initial?.category) ?? categories[0]} error={e.category}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </SelectField>
          <SelectField label="Ditujukan untuk" name="audience" defaultValue={str(initial?.audience) ?? "ALL"} error={e.audience}>
            {Object.entries(AUDIENCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
          <SelectField label="Status" name="status" defaultValue={str(initial?.status) ?? "DRAFT"} error={e.status}>
            {Object.entries(PUBLISH_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPriority" defaultChecked={!!initial?.isPriority} className="accent-brand-700" /> Pengumuman prioritas (ditampilkan paling atas)</label>
        <FileInput name="attachment" label="Lampiran (opsional)" accept=".jpg,.jpeg,.png,.pdf" error={e.attachment} />
      </>}
    </FormModal>
  );
}

export function ActivityForm({ initial, categories }: { initial?: Values; categories: readonly string[] }) {
  return (
    <FormModal title={initial ? "Ubah Kegiatan" : "Tambah Kegiatan"} trigger={{ label: initial ? "Ubah" : "Tambah Kegiatan", small: !!initial }} action={saveActivityAction}>
      {(e) => <>
        <input type="hidden" name="id" value={str(initial?.id) ?? ""} />
        <TextField label="Nama Kegiatan" name="name" required defaultValue={str(initial?.name)} error={e.name} />
        <TextAreaField label="Deskripsi" name="description" defaultValue={str(initial?.description)} error={e.description} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Kategori" name="category" defaultValue={str(initial?.category) ?? categories[0]} error={e.category}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </SelectField>
          <SelectField label="Status" name="status" defaultValue={str(initial?.status) ?? "PLANNED"} error={e.status}>
            {Object.entries(ACTIVITY_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
          <TextField label="Mulai" name="startAt" type="datetime-local" required defaultValue={str(initial?.startAt)} error={e.startAt} />
          <TextField label="Selesai" name="endAt" type="datetime-local" defaultValue={str(initial?.endAt)} error={e.endAt} />
          <TextField label="Lokasi" name="location" required defaultValue={str(initial?.location)} error={e.location} />
          <TextField label="Penanggung Jawab" name="personInCharge" defaultValue={str(initial?.personInCharge)} error={e.personInCharge} />
        </div>
        <FileInput name="attachment" label="Poster / Lampiran" accept=".jpg,.jpeg,.png,.pdf" error={e.attachment} />
      </>}
    </FormModal>
  );
}

export function BusinessForm({ initial, residents }: { initial?: Values; residents: { id: string; fullName: string }[] }) {
  return (
    <FormModal title={initial ? "Ubah UMKM" : "Tambah UMKM"} trigger={{ label: initial ? "Ubah" : "Tambah UMKM", small: !!initial }} action={saveBusinessAction}>
      {(e) => <>
        <input type="hidden" name="id" value={str(initial?.id) ?? ""} />
        <TextField label="Nama Usaha" name="name" required defaultValue={str(initial?.name)} error={e.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Warga Pemilik" name="ownerResidentId" defaultValue={str(initial?.ownerResidentId) ?? ""} error={e.ownerResidentId}>
            <option value="">— Bukan/tidak dihubungkan —</option>
            {residents.map((r) => <option key={r.id} value={r.id}>{r.fullName}</option>)}
          </SelectField>
          <TextField label="Nama Pemilik (ditampilkan)" name="ownerName" required defaultValue={str(initial?.ownerName)} error={e.ownerName} />
          <TextField label="Kategori" name="category" required placeholder="mis. Kuliner, Jasa, Toko" defaultValue={str(initial?.category)} error={e.category} />
          <TextField label="Kontak Bisnis" name="contact" placeholder="No. WA usaha" defaultValue={str(initial?.contact)} error={e.contact} />
          <TextField label="Jam Operasional" name="openingHours" defaultValue={str(initial?.openingHours)} error={e.openingHours} />
          <TextField label="Alamat / No. Rumah" name="address" defaultValue={str(initial?.address)} error={e.address} />
        </div>
        <TextAreaField label="Deskripsi" name="description" defaultValue={str(initial?.description)} error={e.description} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showAddress" defaultChecked={!!initial?.showAddress} className="accent-brand-700" /> Tampilkan alamat kepada warga</label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="ownerConsent" defaultChecked={!!initial?.ownerConsent} className="mt-0.5 accent-brand-700" />
          <span>Pemilik telah menyetujui data usaha ini dipublikasikan di direktori warga {e.ownerConsent && <span className="block text-xs text-red-600">{e.ownerConsent}</span>}</span></label>
        <SelectField label="Status Publikasi" name="status" defaultValue={str(initial?.status) ?? "DRAFT"} error={e.status}>
          {Object.entries(PUBLISH_STATUS).map(([v, l]) => <option key={v} value={v}>{v === "ARCHIVED" ? "Nonaktif" : l}</option>)}
        </SelectField>
        <FileInput name="logo" label="Foto / Logo" accept=".jpg,.jpeg,.png" error={e.logo} />
      </>}
    </FormModal>
  );
}

export function PosyanduForm({ initial }: { initial?: Values }) {
  return (
    <FormModal title={initial ? "Ubah Jadwal Posyandu" : "Tambah Jadwal Posyandu"} trigger={{ label: initial ? "Ubah" : "Tambah Jadwal", small: !!initial }} action={savePosyanduAction}>
      {(e) => <>
        <input type="hidden" name="id" value={str(initial?.id) ?? ""} />
        <TextField label="Nama Kegiatan" name="name" required defaultValue={str(initial?.name) ?? "Posyandu Balita"} error={e.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Mulai" name="startAt" type="datetime-local" required defaultValue={str(initial?.startAt)} error={e.startAt} />
          <TextField label="Selesai" name="endAt" type="datetime-local" defaultValue={str(initial?.endAt)} error={e.endAt} />
          <TextField label="Lokasi" name="location" required defaultValue={str(initial?.location)} error={e.location} />
          <TextField label="Petugas / Penanggung Jawab" name="officer" defaultValue={str(initial?.officer)} error={e.officer} />
        </div>
        <TextAreaField label="Deskripsi" name="description" defaultValue={str(initial?.description)} error={e.description} />
        <TextAreaField label="Catatan Kegiatan" name="notes" defaultValue={str(initial?.notes)} error={e.notes}
          hint="Informasi umum saja (mis. bawa buku KIA). Jangan mencatat data kesehatan anak di sini." />
      </>}
    </FormModal>
  );
}
