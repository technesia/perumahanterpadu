"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

interface Item { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }

/** Notifikasi dengan polling ringan (30 detik) sebagai mekanisme near real-time. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ items: Item[]; unread: number }>({ items: [], unread: 0 });
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch { /* offline: abaikan, coba lagi pada interval berikutnya */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const markRead = async (ids: string[] | "all") => {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    load();
  };

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Notifikasi, ${data.unread} belum dibaca`}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100">
        <Bell className="h-5 w-5" />
        {data.unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold">Notifikasi</p>
            {data.unread > 0 && <button type="button" className="text-xs font-medium text-brand-700" onClick={() => markRead("all")}>Tandai semua dibaca</button>}
          </div>
          {data.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Belum ada notifikasi.</p>
          ) : (
            <ul>
              {data.items.map((n) => (
                <li key={n.id} className={n.readAt ? "" : "bg-brand-50/60"}>
                  <Link href={n.link ?? "#"} onClick={() => { if (!n.readAt) markRead([n.id]); setOpen(false); }}
                    className="block border-b border-slate-100 px-4 py-3 hover:bg-slate-50">
                    <p className="text-sm font-medium text-slate-800">
                      {!n.readAt && <span className="sr-only">Belum dibaca: </span>}{n.title}
                    </p>
                    {n.body && <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
