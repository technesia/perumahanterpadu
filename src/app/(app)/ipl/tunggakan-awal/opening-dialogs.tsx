"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { ImportPanel } from "@/components/domain/import-panel";
import { formatDateTime, MONTHS_ID, rupiah } from "@/lib/format";
import { BILL_STATUS } from "@/lib/labels";
import { ResidentSearch, type ResidentInfo } from "../pembayaran/baru/payment-form";
import {
  cancelOpeningAction, confirmOpeningImportAction, correctOpeningAction, createOpeningAction, openingHistoryAction,
  previewOpeningImportAction,
} from "./actions";

interface IplTypeLite { id: string; name: string; amount: number }
interface PeriodRow { year: number; month: number; amount: number; paidAmount: number }

export function AddOpeningButton({ types, currentYear, currentMonth }: { types: IplTypeLite[]; currentYear: number; currentMonth: number }) {
  const [open, setOpen] = useState(false);
  const [resident, setResident] = useState<ResidentInfo | null>(null);
  const [unitId, setUnitId] = useState("");
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [method, setMethod] = useState<"PERIOD" | "LUMP">("PERIOD");
  const typeAmount = types.find((t) => t.id === typeId)?.amount ?? 0;
  const prev = currentMonth === 1 ? { year: currentYear - 1, month: 12 } : { year: currentYear, month: currentMonth - 1 };
  const [rows, setRows] = useState<PeriodRow[]>([{ ...prev, amount: typeAmount, paidAmount: 0 }]);
  const reset = () => { setResident(null); setUnitId(""); setMethod("PERIOD"); setRows([{ ...prev, amount: typeAmount, paidAmount: 0 }]); };
  const { run, pending, errors } = useAction(createOpeningAction, { onSuccess: () => { setOpen(false); reset(); } });
  const years = Array.from({ length: 21 }, (_, i) => currentYear - i);
  const setRow = (i: number, patch: Partial<PeriodRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addRow = () => setRows((r) => {
    const last = r[r.length - 1] ?? prev;
    // Baris baru = bulan sebelum baris terakhir (mengisi mundur).
    const next = last.month === 1 ? { year: last.year - 1, month: 12 } : { year: last.year, month: last.month - 1 };
    return [...r, { ...next, amount: typeAmount, paidAmount: 0 }];
  });
  const outstanding = method === "PERIOD" ? rows.reduce((s, r) => s + Math.max(0, (r.amount || 0) - (r.paidAmount || 0)), 0) : 0;

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={types.length === 0}><Plus className="h-4 w-4" aria-hidden /> Input Tunggakan Manual</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Input Tunggakan Awal">
        <form noValidate className="grid gap-4" onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          const base = { residentId: resident?.id ?? "", unitId, iplTypeId: typeId, notes: f.notes };
          if (method === "LUMP") run({ ...base, method: "LUMP", amount: f.amount as never, asOf: f.asOf });
          else run({ ...base, method: "PERIOD", periods: rows });
        }}>
          <ResidentSearch onSelect={(r) => { setResident(r); setUnitId(r.units[0]?.id ?? ""); }} error={errors.residentId} />
          {resident && (
            <SelectField label="Nomor Rumah" name="unitId" required value={unitId} onChange={(e) => setUnitId(e.target.value)} error={errors.unitId}>
              {resident.units.length === 0 && <option value="">Warga belum terhubung dengan rumah</option>}
              {resident.units.map((u) => <option key={u.id} value={u.id}>{u.houseNumber} — {u.address}</option>)}
            </SelectField>
          )}
          <SelectField label="Jenis Iuran" name="iplTypeId" required value={typeId} error={errors.iplTypeId}
            onChange={(e) => {
              const amount = types.find((t) => t.id === e.target.value)?.amount ?? 0;
              // Nominal baris yang masih sama dengan tarif jenis sebelumnya ikut menyesuaikan.
              setRows((r) => r.map((x) => (x.amount === typeAmount ? { ...x, amount } : x)));
              setTypeId(e.target.value);
            }}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name} ({rupiah(t.amount)}/bulan)</option>)}
          </SelectField>
          <fieldset>
            <legend className="label">Metode Input</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([["PERIOD", "Periode Bulanan", "Rincian per bulan & tahun"], ["LUMP", "Total Nominal", "Tanpa rincian periode"]] as const).map(([v, l, d]) => (
                <label key={v} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${method === v ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
                  <input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v)} className="mt-0.5 accent-brand-700" />
                  <span><span className="font-medium">{l}</span><span className="block text-xs text-slate-500">{d}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {method === "LUMP" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Total Tunggakan (Rp)" name="amount" type="number" min={1} required error={errors.amount} />
              <TextField label="Per Tanggal" name="asOf" type="date" error={errors.asOf} hint="Tanggal saldo tunggakan (opsional)." />
              <p className="text-xs text-slate-500 sm:col-span-2">Disimpan sebagai <strong>Tunggakan Awal Tanpa Rincian Periode</strong>. Pembayaran tidak dialokasikan otomatis ke bulan tertentu; warga/pengurus memilih item ini saat membayar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr,1fr,1fr,1fr,auto] gap-2 text-xs font-medium text-slate-500 sm:grid">
                <span>Bulan</span><span>Tahun</span><span>Nominal Tagihan</span><span>Sudah Dibayar</span><span className="w-9" />
              </div>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-100 p-2 sm:grid-cols-[1fr,1fr,1fr,1fr,auto] sm:border-0 sm:p-0">
                  <select aria-label={`Bulan baris ${i + 1}`} className="input h-10 py-0" value={r.month} onChange={(e) => setRow(i, { month: Number(e.target.value) })}>
                    {MONTHS_ID.map((m, j) => <option key={m} value={j + 1}>{m}</option>)}
                  </select>
                  <select aria-label={`Tahun baris ${i + 1}`} className="input h-10 py-0" value={r.year} onChange={(e) => setRow(i, { year: Number(e.target.value) })}>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <input aria-label={`Nominal baris ${i + 1}`} type="number" min={1} className="input h-10 py-0 text-right" value={r.amount || ""} onChange={(e) => setRow(i, { amount: Number(e.target.value) })} />
                  <input aria-label={`Sudah dibayar baris ${i + 1}`} type="number" min={0} className="input h-10 py-0 text-right" value={r.paidAmount || ""} placeholder="0" onChange={(e) => setRow(i, { paidAmount: Number(e.target.value) })} />
                  <Button type="button" size="sm" variant="ghost" aria-label={`Hapus baris ${i + 1}`} disabled={rows.length === 1}
                    onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  {errors[`periods.${i}`] && <p className="col-span-full text-xs text-red-600" role="alert">{errors[`periods.${i}`]}</p>}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={addRow}><Plus className="h-4 w-4" aria-hidden /> Tambah Periode</Button>
                <span className="text-sm">Sisa tunggakan: <strong>{rupiah(outstanding)}</strong></span>
              </div>
              {errors.periods && <p className="text-xs text-red-600" role="alert">{errors.periods}</p>}
            </div>
          )}
          <TextAreaField label="Keterangan (opsional)" name="notes" error={errors.notes} />
          <p className="rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-700">Tunggakan awal adalah saldo piutang dan <strong>tidak dicatat sebagai pemasukan kas</strong>. Periode yang sudah tercatat akan ditolak.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={pending} disabled={!resident || !unitId}>Simpan Tunggakan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export interface OpeningItem {
  id: string; label: string; status: string; amount: number; initialPaidAmount: number; paidViaApp: number; outstanding: number;
  lump: boolean; pending: boolean;
}

export function OpeningRowActions({ item }: { item: OpeningItem }) {
  const [mode, setMode] = useState<"correct" | "cancel" | "history" | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<typeof openingHistoryAction>> | null>(null);
  const close = () => { setMode(null); setReason(""); };
  const correct = useAction(correctOpeningAction, { onSuccess: close });
  const cancel = useAction(cancelOpeningAction, { onSuccess: close });
  const editable = item.status !== "VOID" && !item.pending;
  return (
    <div className="flex w-44 flex-wrap gap-1">
      {editable && <Button size="sm" variant="secondary" onClick={() => setMode("correct")}>Koreksi</Button>}
      <Button size="sm" variant="ghost" onClick={async () => { setMode("history"); setHistory(null); setHistory(await openingHistoryAction(item.id)); }}>Riwayat</Button>
      {editable && item.paidViaApp === 0 && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setMode("cancel")}>Batalkan</Button>}

      <Modal open={mode === "correct"} onClose={close} title={`Koreksi — ${item.label}`}>
        <form noValidate className="grid gap-4" onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          correct.run(item.id, { amount: f.amount as never, initialPaidAmount: (f.initialPaidAmount || "0") as never, reason: f.reason });
        }}>
          <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm">
            <dt className="text-slate-500">Nominal saat ini</dt><dd className="text-right font-medium">{rupiah(item.amount)}</dd>
            {!item.lump && <><dt className="text-slate-500">Dibayar sebelum aplikasi</dt><dd className="text-right">{rupiah(item.initialPaidAmount)}</dd></>}
            <dt className="text-slate-500">Dibayar lewat aplikasi</dt><dd className="text-right">{rupiah(item.paidViaApp)}</dd>
            <dt className="text-slate-500">Sisa piutang</dt><dd className="text-right font-semibold">{rupiah(item.outstanding)}</dd>
          </dl>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nominal Tagihan Baru (Rp)" name="amount" type="number" min={1} required defaultValue={item.amount} error={correct.errors.amount} />
            {!item.lump && <TextField label="Dibayar Sebelum Aplikasi (Rp)" name="initialPaidAmount" type="number" min={0} defaultValue={item.initialPaidAmount} error={correct.errors.initialPaidAmount} />}
          </div>
          <TextAreaField label="Alasan Koreksi" name="reason" required error={correct.errors.reason} hint="Wajib. Tercatat di riwayat koreksi dan Activity Log." />
          <p className="text-xs text-slate-500">Pembayaran yang sudah dikonfirmasi lewat aplikasi tidak berubah dan kas tidak disentuh oleh koreksi.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>Batal</Button>
            <Button type="submit" loading={correct.pending}>Simpan Koreksi</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={mode === "cancel"} onClose={close} danger loading={cancel.pending} title="Batalkan tunggakan awal?"
        message={`${item.label} (${rupiah(item.outstanding)}) akan dibatalkan dan tidak lagi dihitung sebagai piutang. Riwayat tetap tersimpan.`}
        confirmLabel="Batalkan Tunggakan" onConfirm={() => cancel.run(item.id, reason)}>
        <TextField label="Alasan" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} error={cancel.errors.reason} />
      </ConfirmDialog>

      <Modal open={mode === "history"} onClose={close} title={`Riwayat Koreksi — ${item.label}`}>
        {!history ? <p className="text-sm text-slate-500">Memuat…</p>
          : !history.ok ? <p className="text-sm text-red-600">{history.error}</p>
            : !history.data?.length ? <p className="text-sm text-slate-500">Belum pernah dikoreksi.</p>
              : (
                <ol className="space-y-3">
                  {history.data.map((h) => (
                    <li key={h.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <p className="text-xs text-slate-500">{formatDateTime(h.createdAt)} · {h.actorName}</p>
                      <p className="mt-1">Nominal: {rupiah(h.amountBefore)} → <strong>{rupiah(h.amountAfter)}</strong>
                        {h.initialPaidBefore !== h.initialPaidAfter && <> · Dibayar sebelum aplikasi: {rupiah(h.initialPaidBefore)} → <strong>{rupiah(h.initialPaidAfter)}</strong></>}
                      </p>
                      <p>Status: {label(h.statusBefore)} → <strong>{label(h.statusAfter)}</strong></p>
                      <p className="mt-1 text-slate-600">Alasan: {h.reason}</p>
                    </li>
                  ))}
                </ol>
              )}
      </Modal>
    </div>
  );
}

const label = (s: string) => BILL_STATUS[s as keyof typeof BILL_STATUS] ?? s;

export function OpeningImport({ types }: { types: IplTypeLite[] }) {
  return (
    <ImportPanel
      templateHref="/api/templates/tunggakan-ipl" templateLabel="Template Riwayat Tunggakan"
      preview={previewOpeningImportAction} confirm={confirmOpeningImportAction}
      fields={(
        <SelectField label="Jenis Iuran" name="iplTypeId" required>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </SelectField>
      )}
      columns={[{ key: "house", label: "No Rumah" }, { key: "name", label: "Nama Warga" }, { key: "period", label: "Periode" }, { key: "amount", label: "Nominal" }, { key: "paid", label: "Sudah Dibayar" }]}
      summary={(p) => p.extra ? <p className="text-sm text-slate-700">Jenis iuran: <strong>{p.extra.iplType}</strong> · Sisa piutang dari baris valid: <strong>{rupiah(Number(p.extra.outstanding))}</strong></p> : null}
    />
  );
}
