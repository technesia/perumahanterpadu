"use client";
import { useRef, useState, type ReactNode } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/modal";
import { useAction, type ClientActionResult } from "@/components/ui/use-action";

type RowStatus = "VALID" | "DUPLICATE" | "UNMATCHED" | "INVALID";
export interface Preview {
  fileName: string; hash: string; total: number; counts: Record<RowStatus, number>;
  rows: { rowNumber: number; status: RowStatus; messages: string[]; display: Record<string, string> }[];
  validationFile: string; extra?: Record<string, string | number>;
}

const STATUS: Record<RowStatus, { label: string; tone: Tone }> = {
  VALID: { label: "Valid", tone: "green" }, DUPLICATE: { label: "Duplikat", tone: "gold" },
  UNMATCHED: { label: "Tidak cocok", tone: "yellow" }, INVALID: { label: "Tidak valid", tone: "red" },
};

/**
 * Alur impor Excel: unduh template → unggah → pratinjau (tanpa menyimpan) → konfirmasi.
 * Konfirmasi mengirim ulang berkas yang sama beserta sidik jarinya; server memvalidasi ulang.
 */
export function ImportPanel({ templateHref, templateLabel, preview, confirm, fields, columns, summary, onDone }: {
  templateHref: string; templateLabel: string;
  preview: (fd: FormData) => Promise<ClientActionResult<Preview>>;
  confirm: (fd: FormData) => Promise<ClientActionResult<unknown>>;
  /** Field tambahan yang ikut dikirim (mis. pilihan jenis iuran). */
  fields?: ReactNode;
  columns: { key: string; label: string }[];
  summary?: (p: Preview) => ReactNode;
  onDone?: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [data, setData] = useState<Preview | null>(null);
  const [asking, setAsking] = useState(false);
  const pv = useAction(preview, { refresh: false, onSuccess: (d) => setData(d ?? null) });
  const cf = useAction(confirm, { onSuccess: () => { setAsking(false); setData(null); form.current?.reset(); onDone?.(); } });
  const fd = () => new FormData(form.current!);

  const downloadValidation = () => {
    if (!data) return;
    const bytes = Uint8Array.from(atob(data.validationFile), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url; a.download = `Hasil Validasi - ${data.fileName}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-4">
      <form ref={form} noValidate className="grid gap-4 sm:grid-cols-[1fr,auto]" onChange={() => setData(null)}
        onSubmit={(e) => { e.preventDefault(); pv.run(fd()); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields}
          <div>
            <label htmlFor="import-file" className="label">Berkas Excel (.xlsx) <span className="text-red-600">*</span></label>
            <input id="import-file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-800" />
            {pv.errors.file && <p className="mt-1 text-xs font-medium text-red-600" role="alert">{pv.errors.file}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <LinkButton href={templateHref} variant="secondary"><Download className="h-4 w-4" aria-hidden /> {templateLabel}</LinkButton>
          <Button type="submit" loading={pv.pending}><FileSpreadsheet className="h-4 w-4" aria-hidden /> Pratinjau</Button>
        </div>
      </form>

      {data && (
        <section aria-label="Pratinjau impor" className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-700">
              <strong>{data.fileName}</strong> · {data.total} baris dibaca. <span className="text-slate-500">Belum ada data yang disimpan.</span>
            </p>
            <Button size="sm" variant="secondary" onClick={downloadValidation}><Download className="h-4 w-4" aria-hidden /> Unduh Berkas Hasil Validasi</Button>
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(STATUS) as RowStatus[]).map((s) => (
              <div key={s} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">{STATUS[s].label}</dt>
                <dd className="text-lg font-bold text-slate-900" data-count={s}>{data.counts[s]}</dd>
              </div>
            ))}
          </dl>
          {summary?.(data)}
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-100">
            <table className="table-base text-sm">
              <thead><tr><th scope="col">Baris</th>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}<th scope="col">Status</th><th scope="col">Keterangan</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.rowNumber}>
                    <td>{r.rowNumber}</td>
                    {columns.map((c) => <td key={c.key}>{r.display[c.key] || "-"}</td>)}
                    <td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
                    <td className="text-xs text-slate-600">{r.messages.join(" ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.rows.length < data.total && <p className="text-xs text-slate-500">Menampilkan {data.rows.length} dari {data.total} baris (baris bermasalah lebih dulu). Seluruh baris ada di berkas hasil validasi.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setAsking(true)} disabled={data.counts.VALID === 0}>Konfirmasi Impor {data.counts.VALID} Baris Valid</Button>
            {data.counts.VALID < data.total && <span className="text-xs text-slate-500">{data.total - data.counts.VALID} baris lain tidak akan disimpan. Perbaiki lewat berkas hasil validasi lalu impor ulang.</span>}
          </div>
        </section>
      )}

      <ConfirmDialog open={asking} onClose={() => setAsking(false)} loading={cf.pending} title="Konfirmasi impor?"
        confirmLabel="Ya, Impor Sekarang"
        message={data ? <>Sebanyak <strong>{data.counts.VALID}</strong> baris valid akan disimpan dalam satu proses. Bila terjadi kegagalan, seluruh impor dibatalkan otomatis.</> : null}
        onConfirm={() => { const f = fd(); f.set("hash", data!.hash); cf.run(f); }} />
    </div>
  );
}
