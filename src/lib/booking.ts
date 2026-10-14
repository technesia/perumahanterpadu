// Logika murni slot booking (tanpa database).
import { minutesOfDay } from "./dates";

export interface Interval { start: number; end: number } // menit sejak 00:00 WIB

/** Dua rentang [a,b) bertabrakan bila a.start < b.end && b.start < a.end. */
export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Slot-slot pada satu hari berdasarkan jam operasional dan durasi slot. */
export function daySlots(openTime: string, closeTime: string, slotMinutes: number): Interval[] {
  const open = minutesOfDay(openTime);
  const close = minutesOfDay(closeTime);
  const out: Interval[] = [];
  for (let t = open; t + slotMinutes <= close; t += slotMinutes) out.push({ start: t, end: t + slotMinutes });
  return out;
}

export function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Validasi rentang terhadap jam operasional & kelipatan slot. Mengembalikan pesan error atau null. */
export function validateRange(r: Interval, openTime: string, closeTime: string, slotMinutes: number): string | null {
  const open = minutesOfDay(openTime);
  const close = minutesOfDay(closeTime);
  if (r.end <= r.start) return "Jam selesai harus setelah jam mulai.";
  if (r.start < open || r.end > close) return `Di luar jam operasional (${openTime}–${closeTime}).`;
  if ((r.start - open) % slotMinutes !== 0 || (r.end - open) % slotMinutes !== 0) {
    return `Jam harus mengikuti slot ${slotMinutes} menit mulai ${openTime}.`;
  }
  return null;
}

/** Hari dianggap penuh hanya jika SEMUA slot terisi. */
export function isFullyBooked(slots: Interval[], taken: Interval[]): boolean {
  return slots.length > 0 && slots.every((s) => taken.some((t) => overlaps(s, t)));
}
