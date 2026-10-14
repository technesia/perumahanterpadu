"use client";
import { useState } from "react";
import { Eye, LockKeyhole } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/modal";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/components/ui/cn";
import { setAccessControlAction } from "./actions";

type Key = "accountsLocked" | "readOnlyMode";

const COPY: Record<Key, { title: string; desc: string; on: string; off: string; icon: typeof Eye }> = {
  accountsLocked: {
    title: "Nonaktifkan semua akun",
    desc: "Semua akun selain Super Admin (Admin, Warga, Security) langsung keluar dan tidak dapat masuk. Status masing-masing akun tidak diubah — mematikan tombol ini memulihkan akses seperti semula.",
    on: "Nonaktifkan semua akun selain Super Admin? Semua pengguna lain akan langsung dikeluarkan.",
    off: "Pulihkan akses semua akun? Pengguna dapat masuk kembali.",
    icon: LockKeyhole,
  },
  readOnlyMode: {
    title: "Mode lihat saja",
    desc: "Pengguna selain Super Admin tetap dapat masuk dan melihat data, tetapi semua perubahan (simpan, ajukan, setujui, hapus) ditolak server. Super Admin tetap memiliki akses penuh.",
    on: "Aktifkan mode lihat saja? Semua perubahan data oleh pengguna selain Super Admin akan ditolak.",
    off: "Matikan mode lihat saja? Pengguna dapat mengubah data kembali.",
    icon: Eye,
  },
};

export function AccessToggles({ initial, affected }: { initial: Record<Key, boolean>; affected: number }) {
  const [pending, setPending] = useState<{ key: Key; value: boolean } | null>(null);
  const a = useAction(setAccessControlAction, { onSuccess: () => setPending(null) });
  return (
    <ul className="divide-y divide-slate-100">
      {(Object.keys(COPY) as Key[]).map((key) => {
        const c = COPY[key];
        const on = initial[key];
        const Icon = c.icon;
        return (
          <li key={key} className="flex items-start gap-4 px-4 py-5 sm:px-5">
            <span className={cn("rounded-lg p-2", on ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500")}><Icon className="h-5 w-5" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p id={`${key}-label`} className="font-semibold text-slate-900">{c.title}</p>
              <p id={`${key}-desc`} className="mt-1 text-sm text-slate-500">{c.desc}</p>
              {key === "accountsLocked" && <p className="mt-1 text-xs text-slate-400">{affected} akun aktif terdampak.</p>}
              <p className={cn("mt-2 text-xs font-semibold", on ? "text-red-700" : "text-slate-500")}>Status: {on ? "AKTIF" : "Tidak aktif"}</p>
            </div>
            <button type="button" role="switch" aria-checked={on} aria-labelledby={`${key}-label`} aria-describedby={`${key}-desc`}
              onClick={() => setPending({ key, value: !on })}
              className={cn("relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                on ? "bg-red-600" : "bg-slate-300")}>
              <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-6" : "translate-x-1")} />
            </button>
          </li>
        );
      })}
      <ConfirmDialog open={!!pending} onClose={() => setPending(null)} loading={a.pending}
        danger={!!pending?.value} title={pending ? COPY[pending.key].title : ""}
        message={pending ? (pending.value ? COPY[pending.key].on : COPY[pending.key].off) : ""}
        confirmLabel={pending?.value ? "Ya, aktifkan" : "Ya, matikan"}
        onConfirm={() => pending && a.run(pending.key, pending.value)} />
    </ul>
  );
}
