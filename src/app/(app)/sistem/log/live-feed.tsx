"use client";
import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super Admin", ADMIN: "Admin", MEMBER: "Member", SECURITY: "Security", SYSTEM: "Sistem" };

interface Log { id: string; createdAt: string; userName: string | null; userRole: string | null; action: string; module: string; entityType: string | null; entityId: string | null; summary: string; status: string }

/** Menerima log baru secara realtime (SSE). Bila SSE gagal, beralih ke polling 10 detik. */
export function LiveFeed({ since, module, q }: { since: string; module?: string; q?: string }) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [mode, setMode] = useState<"sse" | "polling" | "connecting">("connecting");
  const last = useRef(since);

  useEffect(() => {
    const params = new URLSearchParams({ since: last.current, ...(module ? { module } : {}), ...(q ? { q } : {}) });
    let poll: ReturnType<typeof setInterval> | null = null;
    let failures = 0;
    const add = (rows: Log[]) => {
      if (!rows.length) return;
      last.current = rows[rows.length - 1].createdAt;
      setLogs((prev) => [...rows.reverse(), ...prev].slice(0, 100));
    };
    const startPolling = () => {
      setMode("polling");
      poll = setInterval(async () => {
        try {
          const r = await fetch(`/api/audit-logs?${new URLSearchParams({ since: last.current, ...(module ? { module } : {}), ...(q ? { q } : {}) })}`);
          if (r.ok) add(await r.json());
        } catch { /* coba lagi */ }
      }, 10_000);
    };
    const es = new EventSource(`/api/audit-logs/stream?${params}`);
    es.onopen = () => { failures = 0; setMode("sse"); };
    es.addEventListener("logs", (e) => add(JSON.parse((e as MessageEvent).data)));
    es.onerror = () => {
      failures += 1;
      if (failures >= 3) { es.close(); startPolling(); }
    };
    return () => { es.close(); if (poll) clearInterval(poll); };
  }, [module, q]);

  return (
    <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Radio className={`h-4 w-4 ${mode === "sse" ? "text-emerald-600" : "text-amber-500"}`} aria-hidden />
        {mode === "sse" ? "Realtime aktif" : mode === "polling" ? "Mode cadangan: diperbarui tiap 10 detik" : "Menghubungkan…"}
      </p>
      {logs.length > 0 && (
        <ul aria-live="polite" className="mt-2 divide-y divide-emerald-100 rounded-lg border border-emerald-200 bg-emerald-50/50">
          {logs.map((l) => (
            <li key={l.id} className="px-3 py-2 text-sm">
              <span className="mr-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">BARU</span>
              {l.summary}
              <span className="block text-xs text-slate-500">{l.userName ?? "Sistem"} ({l.userRole ? ROLE_LABEL[l.userRole] ?? l.userRole : "-"}) · {l.module} · {new Date(l.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
