"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { checkInAction } from "@/components/security-actions";

interface Hit { id: string; fullName: string; units: { id: string; houseNumber: string }[] }

export function CheckInForm({ units }: { units: { id: string; houseNumber: string; address: string }[] }) {
  const router = useRouter();
  const [unitId, setUnitId] = useState("");
  const [host, setHost] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const { run, pending, errors } = useAction(checkInAction, { refresh: false, onSuccess: () => router.push("/buku-tamu?status=inside") });
  useEffect(() => {
    if (host.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/residents/search?q=${encodeURIComponent(host)}`);
      if (r.ok) setHits(await r.json());
    }, 300);
    return () => clearTimeout(t);
  }, [host]);
  return (
    <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      run({ visitorName: f.visitorName, idNumber: f.idNumber, phone: f.phone, purpose: f.purpose, unitId, hostName: host, vehiclePlate: f.vehiclePlate, notes: f.notes });
    }}>
      <TextField label="Nama Tamu" name="visitorName" required autoFocus error={errors.visitorName} />
      <TextField label="Tujuan Kunjungan" name="purpose" required placeholder="mis. Bertamu, antar paket, servis AC" error={errors.purpose} />
      <div className="relative">
        <TextField label="Penghuni yang Dikunjungi" name="hostName" value={host} onChange={(e) => setHost(e.target.value)} autoComplete="off" error={errors.hostName} />
        {hits.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
            {hits.map((h) => (
              <li key={h.id}><button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                onClick={() => { setHost(h.fullName); if (h.units[0]) setUnitId(h.units[0].id); setHits([]); }}>
                {h.fullName} <span className="text-slate-500">· {h.units.map((u) => u.houseNumber).join(", ")}</span>
              </button></li>
            ))}
          </ul>
        )}
      </div>
      <SelectField label="Rumah yang Dituju" name="unitId" value={unitId} onChange={(e) => setUnitId(e.target.value)} error={errors.unitId}>
        <option value="">— Pilih rumah —</option>
        {units.map((u) => <option key={u.id} value={u.id}>{u.houseNumber} — {u.address}</option>)}
      </SelectField>
      <TextField label="Nomor Kendaraan" name="vehiclePlate" placeholder="B 1234 XYZ" error={errors.vehiclePlate} />
      <TextField label="Nomor HP Tamu" name="phone" inputMode="tel" error={errors.phone} />
      <TextField label="Nomor Identitas" name="idNumber" hint="Opsional, hanya bila diperlukan. Disimpan terenkripsi." error={errors.idNumber} />
      <TextAreaField label="Catatan" name="notes" rows={2} error={errors.notes} />
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={pending}>Simpan Tamu Masuk</Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>Batal</Button>
      </div>
    </form>
  );
}
