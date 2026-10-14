import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

export function StatCard({ label, value, hint, icon: Icon, href, tone = "brand" }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; href?: string;
  tone?: "brand" | "gold" | "red" | "blue" | "slate";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-700", gold: "bg-gold-50 text-gold-700", red: "bg-red-50 text-red-700",
    blue: "bg-sky-50 text-sky-700", slate: "bg-slate-100 text-slate-600",
  };
  const body = (
    <div className="flex items-start gap-3">
      {Icon && <span className={cn("rounded-lg p-2", tones[tone])}><Icon className="h-5 w-5" aria-hidden /></span>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 break-words text-base font-bold leading-tight text-slate-900 sm:text-xl">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="card block p-4 transition hover:border-brand-300 hover:shadow">{body}</Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}
