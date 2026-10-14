import type { ReactNode } from "react";
import { Search } from "lucide-react";
import Link from "next/link";

/** Form GET sederhana: tetap berfungsi tanpa JavaScript, parameter tersimpan di URL. */
export function FilterBar({ action, q, placeholder = "Cari…", children, resetHref }: {
  action: string; q?: string; placeholder?: string; children?: ReactNode; resetHref?: string;
}) {
  return (
    <form action={action} method="get" className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
        <label htmlFor="q" className="sr-only">Pencarian</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input id="q" name="q" defaultValue={q} placeholder={placeholder} className="input pl-9" />
      </div>
      {children}
      <div className="flex gap-2">
        <button type="submit" className="h-10 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">Terapkan</button>
        {resetHref && <Link href={resetHref} className="flex h-10 items-center rounded-lg border px-3 text-sm text-slate-600 hover:bg-slate-50">Reset</Link>}
      </div>
    </form>
  );
}

export function FilterSelect({ name, label, value, options }: {
  name: string; label: string; value?: string; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="sr-only">{label}</label>
      <select id={`f-${name}`} name={name} defaultValue={value ?? ""} className="input h-10 py-0 sm:w-auto">
        <option value="">{label}: Semua</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function sp(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim().slice(0, 100) : undefined;
}

export function spInt(v: string | string[] | undefined): number | undefined {
  const n = Number(sp(v));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
