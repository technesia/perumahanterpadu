"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { MONTHS_ID, rupiah } from "@/lib/format";
import { createBookingAction, dayAvailabilityAction, monthAvailabilityAction } from "./actions";

interface Facility { id: string; name: string; openTime: string; closeTime: string; slotMinutes: number; capacity: number | null; fee: number; rules: string | null; location: string | null }
type MonthData = Record<string, { pending: number; approved: number; full: boolean }>;
interface DayBooking { id: string | null; start: string; end: string; status: "PENDING" | "APPROVED"; mine: boolean; name: string | null }

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function slotLabel(s: { status: string; mine: boolean; name: string | null }) {
  if (s.status === "FREE") return "Tersedia";
  if (s.status === "PAST") return "Sudah lewat";
  if (s.mine) return s.status === "PENDING" ? "Pengajuan Anda" : "Booking Anda";
  const base = s.status === "PENDING" ? "Sedang diajukan" : "Sudah dipesan";
  return s.name ? `${base} · ${s.name}` : base;
}

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

export function BookingCalendar({ facilities, canBook, staff }: { facilities: Facility[]; canBook: boolean; staff: boolean }) {
  const toast = useToast();
  const now = todayIso();
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? "");
  const [ym, setYm] = useState({ y: Number(now.slice(0, 4)), m: Number(now.slice(5, 7)) });
  const [month, setMonth] = useState<MonthData>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [day, setDay] = useState<DayBooking[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const facility = facilities.find((f) => f.id === facilityId);

  const loadMonth = useCallback(async () => {
    if (!facilityId) return;
    const r = await monthAvailabilityAction(facilityId, ym.y, ym.m);
    if (r.ok) setMonth(r.data ?? {}); else toast.error(r.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId, ym]);
  const loadDay = useCallback(async (date: string) => {
    setLoading(true);
    const r = await dayAvailabilityAction(facilityId, date);
    setLoading(false);
    if (r.ok && r.data) setDay(r.data.bookings as DayBooking[]); else if (!r.ok) toast.error(r.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId]);

  useEffect(() => { loadMonth(); }, [loadMonth]);
  useEffect(() => { setSelected(null); setDay(null); }, [facilityId]);
  useEffect(() => { setStart(""); setEnd(""); if (selected) loadDay(selected); }, [selected, loadDay]);

  const { run, pending, errors } = useAction(createBookingAction, {
    onSuccess: () => { setStart(""); setEnd(""); loadMonth(); if (selected) loadDay(selected); },
  });

  // Grid bulan, minggu dimulai Senin.
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(ym.y, ym.m - 1, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
    const out: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= days; d++) out.push(`${ym.y}-${String(ym.m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    while (out.length % 7) out.push(null);
    return out;
  }, [ym]);

  // Slot hari terpilih.
  const slots = useMemo(() => {
    if (!facility || !day) return [];
    const out: { start: number; end: number; status: "FREE" | "PENDING" | "APPROVED" | "PAST"; mine: boolean; name: string | null }[] = [];
    const nowMin = selected === now ? toMin(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour12: false }).slice(0, 5)) : -1;
    for (let t = toMin(facility.openTime); t + facility.slotMinutes <= toMin(facility.closeTime); t += facility.slotMinutes) {
      const b = day.find((x) => toMin(x.start) < t + facility.slotMinutes && t < toMin(x.end));
      const past = selected! < now || t <= nowMin;
      out.push({ start: t, end: t + facility.slotMinutes, status: b ? b.status : past ? "PAST" : "FREE", mine: !!b?.mine, name: b?.name ?? null });
    }
    return out;
  }, [facility, day, selected, now]);
  const startOptions = slots.filter((s) => s.status === "FREE");
  const endOptions = useMemo(() => {
    if (!start) return [];
    const out: number[] = [];
    let i = slots.findIndex((s) => s.start === toMin(start));
    while (i >= 0 && i < slots.length && slots[i].status === "FREE") { out.push(slots[i].end); i++; }
    return out;
  }, [start, slots]);

  const shift = (d: number) => setYm(({ y, m }) => { const i = y * 12 + (m - 1) + d; return { y: Math.floor(i / 12), m: (i % 12) + 1 }; });
  if (facilities.length === 0) return <p className="p-5 text-sm text-slate-500">Belum ada gedung/fasilitas aktif yang dapat dipesan.</p>;

  return (
    <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <SelectField label="Gedung / Fasilitas" name="facility" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </SelectField>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" aria-label="Bulan sebelumnya" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <label htmlFor="cal-month" className="sr-only">Bulan</label>
            <select id="cal-month" className="input h-9 w-auto py-0" value={ym.m} onChange={(e) => setYm((v) => ({ ...v, m: Number(e.target.value) }))}>
              {MONTHS_ID.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <label htmlFor="cal-year" className="sr-only">Tahun</label>
            <select id="cal-year" className="input h-9 w-auto py-0" value={ym.y} onChange={(e) => setYm((v) => ({ ...v, y: Number(e.target.value) }))}>
              {[0, 1].map((d) => Number(now.slice(0, 4)) + d).map((y) => <option key={y}>{y}</option>)}
            </select>
            <Button size="sm" variant="secondary" aria-label="Bulan berikutnya" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        {facility && (
          <p className="mb-3 text-xs text-slate-500">
            {facility.location ? `${facility.location} · ` : ""}Jam operasional {facility.openTime}–{facility.closeTime} · slot {facility.slotMinutes} menit
            {facility.capacity ? ` · kapasitas ${facility.capacity} orang` : ""} · {facility.fee ? `biaya ${rupiah(facility.fee)}` : "tanpa biaya"}
          </p>
        )}
        <div role="grid" aria-label={`Kalender ${MONTHS_ID[ym.m - 1]} ${ym.y}`} className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => <div key={w} role="columnheader" className="py-1 text-xs font-semibold text-slate-500">{w}</div>)}
          {cells.map((iso, i) => {
            if (!iso) return <div key={i} />;
            const info = month[iso];
            const past = iso < now;
            const isSel = iso === selected;
            return (
              <button key={iso} type="button" role="gridcell" aria-selected={isSel} onClick={() => setSelected(iso)}
                aria-label={`${Number(iso.slice(8))} ${MONTHS_ID[ym.m - 1]}${info ? `, ${info.full ? "tidak tersedia" : `${info.approved} disetujui, ${info.pending} menunggu review`}` : ", tersedia"}`}
                className={cn("flex min-h-[52px] flex-col items-center justify-start rounded-lg border p-1 text-sm transition sm:min-h-[64px]",
                  isSel ? "border-brand-600 ring-2 ring-brand-200" : "border-slate-200 hover:border-brand-300",
                  past ? "bg-slate-50 text-slate-400" : info?.full ? "bg-red-50" : info ? "bg-amber-50/60" : "bg-white",
                  iso === now && "font-bold")}>
                <span>{Number(iso.slice(8))}</span>
                {info?.full ? <span className="mt-0.5 text-[10px] font-medium text-red-700">Penuh</span> : (
                  <span className="mt-0.5 flex gap-0.5">
                    {info?.approved ? <span className="rounded bg-emerald-600 px-1 text-[10px] text-white">{info.approved}</span> : null}
                    {info?.pending ? <span className="rounded bg-amber-500 px-1 text-[10px] text-white">{info.pending}</span> : null}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
          <li className="flex items-center gap-1"><span className="h-3 w-3 rounded border bg-white" /> Tersedia</li>
          <li className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-500" /> Menunggu Review</li>
          <li className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-600" /> Disetujui</li>
          <li className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-200" /> Tidak Tersedia (penuh)</li>
          <li className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-200" /> Sudah lewat</li>
        </ul>
      </div>

      <div className="lg:col-span-2">
        {!selected ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Pilih tanggal pada kalender untuk melihat slot waktu.</p>
        ) : (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900">{Number(selected.slice(8))} {MONTHS_ID[Number(selected.slice(5, 7)) - 1]} {selected.slice(0, 4)}</h3>
            {loading ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat slot…</p> : (
              <ul className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
                {slots.map((s) => (
                  <li key={s.start} className={cn("rounded-lg border px-2 py-1.5",
                    s.status === "FREE" ? "border-slate-200 bg-white" : s.status === "PENDING" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-100 text-slate-500")}>
                    <span className="font-medium">{toHHMM(s.start)}–{toHHMM(s.end)}</span><br />
                    {slotLabel(s)}
                  </li>
                ))}
              </ul>
            )}
            {canBook && selected >= now && !loading && (
              startOptions.length === 0 ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Tidak ada slot tersedia pada tanggal ini.</p> : (
                <form noValidate className="grid gap-3 rounded-xl border border-slate-200 p-4" onSubmit={(e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
                  run({ facilityId, date: selected, startTime: start, endTime: end, purpose: f.purpose, participants: f.participants as never, notes: f.notes });
                }}>
                  <p className="text-sm font-semibold">Ajukan Booking</p>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField label="Jam Mulai" name="startTime" required value={start} onChange={(e) => { setStart(e.target.value); setEnd(""); }} error={errors.startTime}>
                      <option value="">—</option>
                      {startOptions.map((s) => <option key={s.start} value={toHHMM(s.start)}>{toHHMM(s.start)}</option>)}
                    </SelectField>
                    <SelectField label="Jam Selesai" name="endTime" required value={end} onChange={(e) => setEnd(e.target.value)} disabled={!start} error={errors.endTime}>
                      <option value="">—</option>
                      {endOptions.map((m) => <option key={m} value={toHHMM(m)}>{toHHMM(m)}</option>)}
                    </SelectField>
                  </div>
                  <TextField label="Tujuan Acara" name="purpose" required error={errors.purpose} />
                  <TextField label="Jumlah Peserta" name="participants" type="number" min={1} max={facility?.capacity ?? undefined} error={errors.participants} />
                  <TextAreaField label="Catatan Tambahan" name="notes" rows={2} error={errors.notes} />
                  {facility?.rules && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-2 text-xs text-slate-600"><strong>Aturan:</strong> {facility.rules}</p>}
                  <p className="text-xs text-slate-500">Nama, rumah, dan nomor HP diambil otomatis dari data warga Anda.</p>
                  <Button type="submit" loading={pending} disabled={!start || !end}>Kirim Pengajuan Booking</Button>
                </form>
              )
            )}
            {staff && !canBook && <p className="text-xs text-slate-500">Nama pemesan hanya terlihat oleh pengurus.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
