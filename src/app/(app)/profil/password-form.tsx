"use client";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const form = useRef<HTMLFormElement>(null);
  const { run, pending, errors } = useAction(changePasswordAction, { onSuccess: () => form.current?.reset() });
  return (
    <form ref={form} noValidate className="grid gap-4 sm:max-w-md" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      run({
        currentPassword: String(fd.get("currentPassword")),
        newPassword: String(fd.get("newPassword")),
        confirmPassword: String(fd.get("confirmPassword")),
      });
    }}>
      <TextField label="Password Lama" name="currentPassword" type="password" autoComplete="current-password" required error={errors.currentPassword} />
      <TextField label="Password Baru" name="newPassword" type="password" autoComplete="new-password" required
        hint="Minimal 10 karakter, mengandung huruf dan angka." error={errors.newPassword} />
      <TextField label="Ulangi Password Baru" name="confirmPassword" type="password" autoComplete="new-password" required error={errors.confirmPassword} />
      <div><Button type="submit" loading={pending}>Simpan Password</Button></div>
    </form>
  );
}
