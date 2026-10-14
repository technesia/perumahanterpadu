"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { navFor } from "./nav-config";
import { Logo } from "./logo";
import { Footer } from "./footer";
import { NotificationBell } from "./notification-bell";
import { NavigationProgress } from "./navigation-progress";
import { cn } from "../ui/cn";

interface Props {
  user: { name: string; roleLabel: string; role: string };
  controls: { accountsLocked: boolean; readOnlyMode: boolean; superAdmin: boolean };
  permissions: string[];
  logoutAction: () => Promise<void>;
  children: ReactNode;
}

export function AppShell({ user, controls, permissions, logoutAction, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = navFor(user.role, permissions);
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/") &&
      !groups.some((g) => g.items.some((i) => i.href !== href && i.href.startsWith(href) && pathname.startsWith(i.href))));

  const nav = (
    <nav aria-label="Menu utama" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={active ? "page" : undefined}
                    className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
                    <item.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-brand-700" : "text-slate-400")} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col lg:pl-64">
      <a href="#konten" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow">Lewati ke konten</a>
      <Suspense fallback={null}><NavigationProgress /></Suspense>
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex justify-center border-b border-slate-100 px-4 py-3">
          <Link href="/dashboard" aria-label="Beranda"><Logo className="h-[72px] w-auto" priority /></Link>
        </div>
        {nav}
      </aside>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
              <Logo className="h-14 w-auto" />
              <button type="button" onClick={() => setOpen(false)} aria-label="Tutup menu" className="rounded-lg p-2 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" onClick={() => setOpen(true)} aria-label="Buka menu" className="-ml-1 rounded-lg p-2 hover:bg-slate-100 lg:hidden">
          <Menu className="h-6 w-6" />
        </button>
        <Link href="/dashboard" className="lg:hidden" aria-label="Beranda"><Logo className="h-11 w-auto" priority /></Link>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <NotificationBell />
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold leading-tight text-slate-800">{user.name}</p>
            <p className="text-xs text-slate-500">{user.roleLabel}</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100" aria-label="Keluar">
              <LogOut className="h-[18px] w-[18px]" /> <span className="hidden sm:inline">Keluar</span>
            </button>
          </form>
        </div>
      </header>

      <ControlBanner controls={controls} />
      <main id="konten" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      <Footer />
    </div>
  );
}

/** Pemberitahuan kontrol darurat: warga/pengurus melihat mode lihat saja; Super Admin melihat semua kontrol aktif. */
function ControlBanner({ controls }: { controls: Props["controls"] }) {
  if (controls.superAdmin) {
    const active = [controls.accountsLocked && "semua akun lain dinonaktifkan", controls.readOnlyMode && "mode lihat saja"].filter(Boolean);
    if (!active.length) return null;
    return (
      <div role="status" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 sm:px-6">
        <strong>Kontrol darurat aktif:</strong> {active.join(" · ")}.{" "}
        <Link href="/sistem/kontrol" className="font-medium underline">Kelola</Link>
      </div>
    );
  }
  if (!controls.readOnlyMode) return null;
  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6">
      <strong>Mode lihat saja.</strong> Perubahan data dinonaktifkan sementara oleh Super Admin.
    </div>
  );
}
