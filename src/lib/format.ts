import { TIMEZONE } from "./dates";

export const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function rupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

export function periodLabel(year: number, month: number): string {
  return `${MONTHS_ID[month - 1]} ${year}`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("id-ID", { timeZone: TIMEZONE, day: "numeric", month: "long", year: "numeric" }).format(date);
}

/** Untuk kolom @db.Date (disimpan sebagai UTC tengah malam). */
export function formatDateOnly(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TIMEZONE, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date) + " WIB";
}

/** Samarkan identitas sensitif: 3601xxxxxxxx1234 → 3601********1234 */
export function maskId(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.length <= 8) return "*".repeat(value.length);
  return value.slice(0, 4) + "*".repeat(value.length - 8) + value.slice(-4);
}

/** Nomor HP Indonesia → format wa.me (62...). */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return digits || null;
}
