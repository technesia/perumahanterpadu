"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { INCIDENT_STATUS } from "@/lib/labels";
import { createIncidentAction, reviewIncidentAction } from "@/components/security-actions";

export function IncidentForm({ types }: { types: readonly string[] }) {
  const router = useRouter();
  const { run, pending, errors } = useAction(createIncidentAction, { refresh: false, onSuccess: (d) => router.push(`/kejadian/${(d as { id: string }).id}`) });
  const nowLocal = () => {
    const d = new Date();
    return `${d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })}T${d.toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour12: false }).slice(0, 5)}`;
  };
  return (
    <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(new FormData(e.currentTarget)); }}>
      <SelectField label="Jenis Kejadian" name="type" required error={errors.type}>
        <option value="">— Pilih —</option>
        {types.map((t) => <option key={t}>{t}</option>)}
      </SelectField>
      <TextField label="Waktu Kejadian" name="occurredAt" type="datetime-local" required defaultValue={nowLocal()} error={errors.occurredAt} />
      <div className="sm:col-span-2"><TextField label="Lokasi" name="location" required placeholder="mis. Gerbang utama, Blok C" error={errors.location} /></div>
      <div className="sm:col-span-2"><TextAreaField label="Deskripsi Kejadian" name="description" required rows={5} error={errors.description} /></div>
      <div className="sm:col-span-2">
        <label htmlFor="attachments" className="label">Lampiran Bukti</label>
        <input id="attachments" name="attachments" type="file" multiple accept=".jpg,.jpeg,.png,.pdf" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-800" />
        <p className="mt-1 text-xs text-slate-500">Opsional, maks. 5 berkas JPG/PNG/PDF.</p>
        {errors.attachments && <p className="mt-1 text-xs text-red-600">{errors.attachments}</p>}
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={pending}>Kirim Laporan</Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>Batal</Button>
      </div>
    </form>
  );
}

export function ReviewIncidentForm({ id, status, notes }: { id: string; status: string; notes: string }) {
  const [s, setS] = useState(status);
  const [n, setN] = useState(notes);
  const { run, pending, errors } = useAction(reviewIncidentAction);
  return (
    <form noValidate className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(id, { status: s as never, managementNotes: n }); }}>
      <SelectField label="Status Tindak Lanjut" name="status" value={s} onChange={(e) => setS(e.target.value)} error={errors.status}>
        {Object.entries(INCIDENT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </SelectField>
      <TextAreaField label="Catatan Pengurus" name="managementNotes" rows={4} value={n} onChange={(e) => setN(e.target.value)} error={errors.managementNotes} />
      <div><Button type="submit" loading={pending}>Simpan Tindak Lanjut</Button></div>
    </form>
  );
}
