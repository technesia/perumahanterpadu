"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { OCCUPANCY_STATUS } from "@/lib/labels";
import { MONTHS_ID, rupiah } from "@/lib/format";
import { payableBillsAction, submitPaymentAction } from "../../actions";

export interface ResidentInfo {
  id: string; fullName: string; phone: string | null; occupancyStatus: keyof typeof OCCUPANCY_STATUS;
  units: { id: string; houseNumber: string; address: string }[];
}
interface Payable { id: string; label: string; year: number; month: number; typeName: string; amount: number; outstanding: number; arrears: boolean; status: string }

export function PaymentForm({ staff, self, qrisEnabled, allowPartial, maxUploadMb }: {
  staff: boolean; self: ResidentInfo | null; qrisEnabled: boolean; allowPartial: boolean; maxUploadMb: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [resident, setResident] = useState<ResidentInfo | null>(self);
  const [unitId, setUnitId] = useState(self?.units[0]?.id ?? "");
  const [bills, setBills] = useState<Payable[] | null>(null);
  const [pendingLabels, setPendingLabels] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [year, setYear] = useState<string>("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [loadingBills, setLoadingBills] = useState(false);
  const idem = useRef(crypto.randomUUID());

  const { run, pending, errors } = useAction(submitPaymentAction, {
    refresh: false,
    onSuccess: (d) => router.push(`/ipl/pembayaran/${(d as { id: string }).id}`),
  });

  useEffect(() => {
    setBills(null); setSelected(new Set()); setAmounts({});
    if (!unitId) return;
    setLoadingBills(true);
    payableBillsAction(unitId).then((r) => {
      if (r.ok && r.data) { setBills(r.data.payable); setPendingLabels(r.data.pending); }
      else if (!r.ok) toast.error(r.error);
    }).finally(() => setLoadingBills(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  const years = useMemo(() => [...new Set((bills ?? []).map((b) => b.year).filter((y) => y > 0))], [bills]);
  // Tunggakan awal tanpa rincian periode (tahun 0) selalu ditampilkan.
  const visible = (bills ?? []).filter((b) => !year || b.year === 0 || String(b.year) === year);
  const amountFor = (b: Payable) => (allowPartial && amounts[b.id] ? amounts[b.id] : b.outstanding);
  const total = (bills ?? []).filter((b) => selected.has(b.id)).reduce((s, b) => s + amountFor(b), 0);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <form noValidate className="space-y-6" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      fd.delete("billIds");
      for (const id of selected) {
        fd.append("billIds", id);
        if (allowPartial && amounts[id]) fd.set(`amount_${id}`, String(amounts[id]));
      }
      fd.set("idempotencyKey", idem.current);
      if (resident && staff) fd.set("residentId", resident.id);
      run(fd);
    }}>
      {/* 1. Data warga (autofill dari database, tidak dapat diubah di sini) */}
      <section aria-labelledby="s1" className="space-y-4">
        <h2 id="s1" className="text-sm font-semibold text-slate-900">1. Data Warga</h2>
        {staff && <ResidentSearch onSelect={(r) => { setResident(r); setUnitId(r.units[0]?.id ?? ""); }} error={errors.residentId} />}
        {resident ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nama Warga" name="residentName" value={resident.fullName} readOnly />
            <TextField label="Nomor HP" name="residentPhone" value={resident.phone ?? "-"} readOnly />
            <TextField label="Status Penghuni" name="occ" value={OCCUPANCY_STATUS[resident.occupancyStatus]} readOnly />
            <SelectField label="Nomor Rumah / Alamat" name="unitId" required value={unitId} onChange={(e) => setUnitId(e.target.value)} error={errors.unitId}>
              {resident.units.length === 0 && <option value="">Tidak ada rumah aktif</option>}
              {resident.units.map((u) => <option key={u.id} value={u.id}>{u.houseNumber} — {u.address}</option>)}
            </SelectField>
            <p className="text-xs text-slate-500 sm:col-span-2">Data identitas diambil dari database warga. Perubahan dilakukan pengurus melalui modul Data Warga.</p>
          </div>
        ) : !staff ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Akun Anda belum terhubung dengan data warga. Hubungi pengurus.</p>
        ) : null}
      </section>

      {/* 2. Periode */}
      {resident && unitId && (
        <section aria-labelledby="s2" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="s2" className="text-sm font-semibold text-slate-900">2. Pilih Periode yang Dibayar</h2>
            <div className="flex gap-2">
              <div>
                <label htmlFor="payYear" className="label text-xs">Tahun Pembayaran</label>
                <select id="payYear" className="input h-10 py-0" value={year} onChange={(e) => setYear(e.target.value)}>
                  <option value="">Semua tahun</option>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              {visible.length > 0 && (
                <Button type="button" size="sm" variant="secondary" className="self-end"
                  onClick={() => setSelected(new Set(visible.filter((b) => b.arrears).map((b) => b.id)))}>Pilih semua tunggakan</Button>
              )}
            </div>
          </div>
          {loadingBills && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat tagihan…</p>}
          {pendingLabels.length > 0 && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">Sedang menunggu verifikasi: {pendingLabels.join(", ")}.</p>}
          {bills && bills.length === 0 && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Tidak ada tagihan yang perlu dibayar untuk rumah ini.</p>}
          {visible.length > 0 && (
            <fieldset>
              <legend className="sr-only">Daftar bulan belum dibayar</legend>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {visible.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <input id={`b-${b.id}`} type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} className="h-5 w-5 accent-brand-700" />
                    <label htmlFor={`b-${b.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                      <span className="font-medium">{b.year === 0 ? b.label : `${MONTHS_ID[b.month - 1]} ${b.year}`}</span> <span className="text-slate-500">· {b.typeName}</span>
                      {" "}{b.arrears ? <Badge tone="red">Tunggakan</Badge> : b.status === "NOT_DUE" ? <Badge>Belum jatuh tempo</Badge> : b.status === "PARTIAL" ? <Badge tone="gold">Parsial</Badge> : null}
                    </label>
                    {allowPartial && selected.has(b.id) ? (
                      <input aria-label={`Nominal ${b.label}`} type="number" min={1} max={b.outstanding} className="input h-9 w-32 py-0 text-right"
                        value={amounts[b.id] ?? b.outstanding} onChange={(e) => setAmounts((a) => ({ ...a, [b.id]: Number(e.target.value) }))} />
                    ) : (
                      <span className="text-sm font-medium">{rupiah(b.outstanding)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          {errors.billIds && <p className="text-xs font-medium text-red-600" role="alert">{errors.billIds}</p>}
          <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
            <span className="text-sm text-brand-900">{selected.size} periode dipilih</span>
            <span className="text-lg font-bold text-brand-900">Total {rupiah(total)}</span>
          </div>
        </section>
      )}

      {/* 3. Metode & bukti */}
      {resident && unitId && (
        <section aria-labelledby="s3" className="grid gap-4 sm:grid-cols-2">
          <h2 id="s3" className="text-sm font-semibold text-slate-900 sm:col-span-2">3. Metode Pembayaran</h2>
          <SelectField label="Metode Pembayaran" name="method" required value={method} onChange={(e) => setMethod(e.target.value)} error={errors.method}>
            <option value="BANK_TRANSFER">Transfer Bank</option>
            <option value="CASH">Tunai</option>
            <option value="QRIS" disabled={!qrisEnabled}>QRIS{qrisEnabled ? "" : " (belum aktif)"}</option>
          </SelectField>
          <div>
            <label htmlFor="proof" className="label">Bukti Transfer {method === "BANK_TRANSFER" && <span className="text-red-600">*</span>}</label>
            <input id="proof" name="proof" type="file" accept=".jpg,.jpeg,.png,.pdf" required={method === "BANK_TRANSFER"}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-800" />
            <p className="mt-1 text-xs text-slate-500">JPG, PNG, atau PDF. Maks. {maxUploadMb} MB.</p>
            {errors.proof && <p className="mt-1 text-xs font-medium text-red-600" role="alert">{errors.proof}</p>}
          </div>
          <div className="sm:col-span-2"><TextAreaField label="Catatan (opsional)" name="notes" error={errors.notes} /></div>
          <p className="text-xs text-slate-500 sm:col-span-2">Pembayaran akan berstatus <strong>Menunggu Verifikasi</strong> sampai diperiksa pengurus. Mengunggah bukti tidak otomatis melunasi tagihan.</p>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} disabled={!resident || selected.size === 0}>Kirim Pengajuan Pembayaran</Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>Batal</Button>
      </div>
    </form>
  );
}

export function ResidentSearch({ onSelect, error }: { onSelect: (r: ResidentInfo) => void; error?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ResidentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const picked = useRef<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    // Teks berasal dari warga yang baru dipilih: jangan buka daftar lagi.
    if (picked.current === q) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/residents/search?q=${encodeURIComponent(q)}`);
        if (r.ok) { setResults(await r.json()); setOpen(true); }
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative">
      <label htmlFor="resident-search" className="label">Cari Warga <span className="text-red-600">*</span></label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input id="resident-search" className="input pl-9" placeholder="Ketik nama, ID warga, atau nomor rumah" value={q}
          onChange={(e) => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)} autoComplete="off"
          role="combobox" aria-expanded={open} aria-controls="resident-results" aria-invalid={!!error} />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>
      {error && <p className="mt-1 text-xs font-medium text-red-600" role="alert">{error}</p>}
      {open && q.length >= 2 && (
        <ul id="resident-results" role="listbox" className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {results.length === 0 && !loading && <li className="px-4 py-3 text-sm text-slate-500">Warga tidak ditemukan. Data warga baru ditambahkan melalui menu Data Warga.</li>}
          {results.map((r) => (
            <li key={r.id} role="option" aria-selected={false}>
              <button type="button" className="block w-full px-4 py-2.5 text-left text-sm hover:bg-brand-50"
                onClick={() => { onSelect(r); picked.current = r.fullName; setQ(r.fullName); setOpen(false); }}>
                <span className="font-medium">{r.fullName}</span> <span className="text-slate-500">· {r.units.map((u) => u.houseNumber).join(", ") || "tanpa rumah"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
