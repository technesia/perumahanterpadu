import Link from "next/link";

export function Pagination({ page, pageSize, total, baseHref, params }: {
  page: number; pageSize: number; total: number; baseHref: string; params?: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) q.set(k, v);
    q.set("page", String(p));
    return `${baseHref}?${q.toString()}`;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <span>Menampilkan {from}–{to} dari {total}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="rounded-lg border px-3 py-1.5 hover:bg-slate-50" href={href(page - 1)}>Sebelumnya</Link>
          : <span className="rounded-lg border px-3 py-1.5 text-slate-300">Sebelumnya</span>}
        <span className="px-2 py-1.5">Hal {page}/{pages}</span>
        {page < pages ? <Link className="rounded-lg border px-3 py-1.5 hover:bg-slate-50" href={href(page + 1)}>Berikutnya</Link>
          : <span className="rounded-lg border px-3 py-1.5 text-slate-300">Berikutnya</span>}
      </div>
    </div>
  );
}

export function parsePage(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10_000) : 1;
}
