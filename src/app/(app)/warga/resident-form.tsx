"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { OCCUPANCY_STATUS, RESIDENT_STATUS, MEMBERSHIP_RELATION } from "@/lib/labels";
import { createResidentAction, updateResidentAction } from "./actions";

export interface ResidentFormValues {
  fullName: string; nik: string; phone: string; email: string; status: string; occupancyStatus: string;
  moveInDate: string; deathDate: string; internalNotes: string;
}

export function ResidentForm({ mode, id, initial, units, roles, canCreateAccount, canBackdate, maxYears }: {
  mode: "create" | "edit"; id?: string; initial?: Partial<ResidentFormValues>;
  units: { id: string; houseNumber: string; address: string }[];
  roles: { value: string; label: string }[]; canCreateAccount: boolean; canBackdate: boolean; maxYears: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial?.status ?? "ACTIVE");
  const [withAccount, setWithAccount] = useState(false);
  const action = mode === "create" ? createResidentAction : updateResidentAction.bind(null, id!);
  const { run, pending, errors } = useAction(action, {
    refresh: false,
    onSuccess: (d) => router.push(`/warga/${(d as { id: string }).id}`),
  });
  const today = new Date().toISOString().slice(0, 10);
  const minDeath = new Date(new Date().setFullYear(new Date().getFullYear() - maxYears)).toISOString().slice(0, 10);

  return (
    <form noValidate className="space-y-6" onSubmit={(e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      run({
        fullName: f.fullName, nik: f.nik ?? "", phone: f.phone ?? "", email: f.email ?? "",
        status: f.status as never, occupancyStatus: f.occupancyStatus as never, moveInDate: f.moveInDate ?? "",
        deathDate: f.deathDate ?? "", deathCorrectionNote: f.deathCorrectionNote ?? "", internalNotes: f.internalNotes ?? "",
        ...(mode === "create" ? { unitId: f.unitId ?? "", relation: (f.relation || "HEAD") as never } : {}),
        ...(withAccount ? { account: { username: f.username, email: f.accountEmail ?? "", password: f.password, role: f.role as never } } : {}),
      });
    }}>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Identitas</legend>
        <div className="sm:col-span-2"><TextField label="Nama Lengkap" name="fullName" required defaultValue={initial?.fullName} error={errors.fullName} /></div>
        <TextField label="NIK" name="nik" inputMode="numeric" maxLength={16} defaultValue={initial?.nik}
          hint={mode === "edit" ? "Kosongkan untuk mempertahankan NIK tersimpan." : "Opsional. Disimpan terenkripsi."} error={errors.nik} />
        <TextField label="Nomor HP" name="phone" inputMode="tel" placeholder="08xxxxxxxxxx" defaultValue={initial?.phone} error={errors.phone} />
        <TextField label="Email" name="email" type="email" defaultValue={initial?.email} error={errors.email} />
        <TextField label="Tanggal Mulai Tinggal" name="moveInDate" type="date" max={today} defaultValue={initial?.moveInDate} error={errors.moveInDate} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Status</legend>
        <SelectField label="Status Warga" name="status" required value={status} onChange={(e) => setStatus(e.target.value)} error={errors.status}>
          {Object.entries(RESIDENT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectField>
        <SelectField label="Status Hunian" name="occupancyStatus" required defaultValue={initial?.occupancyStatus ?? "PERMANENT"} error={errors.occupancyStatus}>
          {Object.entries(OCCUPANCY_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectField>
        {status === "DECEASED" && (
          <>
            <TextField label="Tanggal Meninggal" name="deathDate" type="date" required max={today} min={canBackdate ? undefined : minDeath}
              defaultValue={initial?.deathDate} error={errors.deathDate}
              hint={`Maksimal ${maxYears} tahun ke belakang${canBackdate ? "; lebih lama memerlukan alasan koreksi" : ""}.`} />
            {canBackdate && <TextField label="Alasan Koreksi (jika lebih dari batas)" name="deathCorrectionNote" error={errors.deathCorrectionNote} />}
            <p className="text-xs text-slate-500 sm:col-span-2">Data warga, histori IPL, dan pengajuan tidak dihapus. Akun dan kepemilikan rumah tidak diubah otomatis.</p>
          </>
        )}
      </fieldset>

      {mode === "create" && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-900">Rumah</legend>
          <SelectField label="Rumah" name="unitId" error={errors.unitId} hint="Opsional — dapat diatur kemudian dari Data Rumah.">
            <option value="">— Belum ditentukan —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.houseNumber} — {u.address}</option>)}
          </SelectField>
          <SelectField label="Hubungan" name="relation" defaultValue="HEAD">
            {Object.entries(MEMBERSHIP_RELATION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
        </fieldset>
      )}

      <TextAreaField label="Catatan Internal Pengurus" name="internalNotes" defaultValue={initial?.internalNotes} error={errors.internalNotes}
        hint="Tidak terlihat oleh warga." />

      {mode === "create" && canCreateAccount && (
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={withAccount} onChange={(e) => setWithAccount(e.target.checked)} className="h-4 w-4 accent-brand-700" />
            Buatkan akun login untuk warga ini
          </label>
          {withAccount && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField label="Username" name="username" required autoComplete="off" error={errors["account.username"] ?? errors.username} />
              <TextField label="Email Login" name="accountEmail" type="email" error={errors["account.email"] ?? errors.email} />
              <TextField label="Password Awal" name="password" type="password" required autoComplete="new-password"
                hint="Min. 10 karakter, huruf & angka. Sampaikan langsung ke warga." error={errors["account.password"] ?? errors.password} />
              <SelectField label="Role" name="role" defaultValue="MEMBER" error={errors["account.role"]}>
                {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </SelectField>
            </div>
          )}
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>{mode === "create" ? "Simpan Warga" : "Simpan Perubahan"}</Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>Batal</Button>
      </div>
    </form>
  );
}
