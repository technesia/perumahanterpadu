// Semua tanggal operasional mengikuti zona waktu WIB (Asia/Jakarta).
export const TIMEZONE = "Asia/Jakarta";

/** Tanggal kalender hari ini di WIB, sebagai Date UTC tengah malam (cocok untuk kolom @db.Date). */
export function todayDate(now = new Date()): Date {
  return dateOnly(isoDateInJakarta(now));
}

export function isoDateInJakarta(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "2026-10-14" → Date UTC 2026-10-14T00:00:00Z. Melempar error bila format salah. */
export function dateOnly(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Tanggal tidak valid: ${iso}`);
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) throw new Error(`Tanggal tidak valid: ${iso}`);
  return d;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Gabungkan tanggal "YYYY-MM-DD" + jam "HH:mm" WIB menjadi instant UTC. */
export function jakartaDateTime(isoDate: string, hhmm: string): Date {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) throw new Error(`Jam tidak valid: ${hhmm}`);
  const d = new Date(`${isoDate}T${hhmm}:00+07:00`);
  if (Number.isNaN(d.getTime())) throw new Error("Tanggal/jam tidak valid");
  return d;
}

/** Jam "HH:mm" WIB dari sebuah instant. */
export function jakartaTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function addYears(d: Date, years: number): Date {
  const r = new Date(d);
  r.setUTCFullYear(r.getUTCFullYear() + years);
  return r;
}

/** Nilai untuk <input type="datetime-local"> dalam WIB. */
export function toLocalInput(d: Date | null | undefined): string {
  if (!d) return "";
  return `${isoDateInJakarta(d)}T${jakartaTime(d)}`;
}

/** Tambah/kurangi hari pada tanggal (UTC tengah malam). */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
