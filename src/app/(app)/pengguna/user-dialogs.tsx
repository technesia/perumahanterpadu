"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { SelectField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { changeRoleAction, createUserAction, resetPasswordAction, setActiveAction } from "./actions";

type Opt = { value: string; label: string };

export function CreateUserButton({ roles, residents, presetResidentId }: { roles: Opt[]; residents: { id: string; fullName: string; code: string }[]; presetResidentId?: string }) {
  const [open, setOpen] = useState(!!presetResidentId);
  const { run, pending, errors } = useAction(createUserAction, { onSuccess: () => setOpen(false) });
  const preset = residents.find((r) => r.id === presetResidentId);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Buat Akun</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Buat Akun Pengguna">
        <form noValidate className="grid gap-4" onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          run({ name: f.name, username: f.username, email: f.email, phone: f.phone, password: f.password, role: f.role as never, residentId: f.residentId });
        }}>
          <SelectField label="Hubungkan dengan Data Warga" name="residentId" defaultValue={presetResidentId ?? ""} error={errors.residentId}
            hint="Wajib untuk Member agar tagihan IPL tampil. Hanya warga tanpa akun yang ditampilkan.">
            <option value="">— Tidak dihubungkan —</option>
            {residents.map((r) => <option key={r.id} value={r.id}>{r.fullName} ({r.code})</option>)}
          </SelectField>
          <TextField label="Nama" name="name" required defaultValue={preset?.fullName} error={errors.name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Username" name="username" required autoComplete="off" error={errors.username} />
            <TextField label="Email" name="email" type="email" error={errors.email} />
            <TextField label="Nomor HP" name="phone" inputMode="tel" error={errors.phone} />
            <SelectField label="Role" name="role" defaultValue="MEMBER" error={errors.role}>
              {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </SelectField>
          </div>
          <TextField label="Password Awal" name="password" type="password" required autoComplete="new-password"
            hint="Min. 10 karakter, huruf & angka. Jangan gunakan password yang sama untuk semua warga." error={errors.password} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={pending}>Buat Akun</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function UserRowActions({ userId, username, active, currentRole, roles, canManage }: {
  userId: string; username: string; active: boolean; currentRole: string; roles: Opt[]; canManage: boolean;
}) {
  const [dialog, setDialog] = useState<null | "role" | "active" | "password">(null);
  const [role, setRole] = useState(currentRole);
  const [pw, setPw] = useState("");
  const close = () => setDialog(null);
  const roleA = useAction(changeRoleAction, { onSuccess: close });
  const activeA = useAction(setActiveAction, { onSuccess: close });
  const pwA = useAction(resetPasswordAction, { onSuccess: () => { setPw(""); close(); } });
  if (!canManage) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      <Button size="sm" variant="secondary" onClick={() => setDialog("role")}>Role</Button>
      <Button size="sm" variant="secondary" onClick={() => setDialog("password")}>Reset Password</Button>
      <Button size="sm" variant={active ? "ghost" : "secondary"} onClick={() => setDialog("active")}>{active ? "Nonaktifkan" : "Aktifkan"}</Button>

      <ConfirmDialog open={dialog === "role"} onClose={close} loading={roleA.pending} title={`Ubah role ${username}`}
        message="Pengguna akan keluar otomatis dan perlu masuk ulang." onConfirm={() => roleA.run(userId, role as never)}>
        <SelectField label="Role baru" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
          {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </SelectField>
      </ConfirmDialog>
      <ConfirmDialog open={dialog === "active"} onClose={close} loading={activeA.pending} danger={active}
        title={active ? `Nonaktifkan ${username}?` : `Aktifkan ${username}?`}
        message={active ? "Pengguna tidak dapat masuk dan sesinya diakhiri. Data tidak dihapus." : "Pengguna dapat masuk kembali."}
        onConfirm={() => activeA.run(userId, !active)} />
      <ConfirmDialog open={dialog === "password"} onClose={close} loading={pwA.pending} title={`Reset password ${username}`}
        message="Semua sesi pengguna akan diakhiri." onConfirm={() => pwA.run(userId, pw)}>
        <TextField label="Password baru" name="password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)}
          error={pwA.errors.password} hint="Min. 10 karakter, huruf & angka." />
      </ConfirmDialog>
    </div>
  );
}
