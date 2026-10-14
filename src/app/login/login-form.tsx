"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { loginAction } from "./actions";

export function LoginForm() {
  const [show, setShow] = useState(false);
  const { run, pending, errors } = useAction(loginAction, {
    refresh: false,
    onSuccess: () => window.location.assign("/dashboard"),
  });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run({ identifier: String(fd.get("identifier") ?? ""), password: String(fd.get("password") ?? "") });
      }}
    >
      <TextField label="Email atau Username" name="identifier" autoComplete="username" required error={errors.identifier} />
      <div className="relative">
        <TextField label="Password" name="password" type={show ? "text" : "password"} autoComplete="current-password"
          required error={errors.password} className="pr-11" />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
          className="absolute right-2 top-[34px] rounded p-1.5 text-slate-500 hover:bg-slate-100">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <Button type="submit" className="w-full" loading={pending}>Masuk</Button>
      <p className="text-center text-xs text-slate-500">
        Akun warga dibuat oleh pengurus. Lupa password? Hubungi Admin RT untuk reset.
      </p>
    </form>
  );
}
