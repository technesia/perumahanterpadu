// Logika murni IPL (tanpa database) — mudah diuji.

export interface Period { year: number; month: number }

export const periodIndex = (p: Period) => p.year * 12 + (p.month - 1);
export const fromIndex = (i: number): Period => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });
export const addMonths = (p: Period, n: number) => fromIndex(periodIndex(p) + n);
export const comparePeriod = (a: Period, b: Period) => periodIndex(a) - periodIndex(b);

/** Periode penanda tunggakan awal tanpa rincian periode (OPENING_LUMP). */
export const LUMP_PERIOD: Period = { year: 0, month: 0 };
export const isLumpPeriod = (p: Period) => p.year === 0 && p.month === 0;
export const OPENING_KINDS = ["OPENING_PERIOD", "OPENING_LUMP"] as const;
export const BILL_KIND_LABEL = { REGULAR: "Tagihan Bulanan", OPENING_PERIOD: "Tunggakan Awal", OPENING_LUMP: "Tunggakan Awal Tanpa Rincian" } as const;

/**
 * Nilai baru sebuah tagihan tunggakan awal setelah koreksi. `paidAmount` memuat bagian
 * terbayar sebelum aplikasi (initialPaidAmount) + pembayaran lewat aplikasi; yang terakhir
 * tidak pernah berubah oleh koreksi.
 */
export function correctOpening(
  bill: { amount: number; paidAmount: number; initialPaidAmount: number; status: "UNPAID" | "PARTIAL" | "PAID" | "VOID" },
  next: { amount: number; initialPaidAmount: number },
) {
  if (bill.status === "VOID") throw new Error("Tagihan dibatalkan tidak dapat dikoreksi");
  if (!Number.isInteger(next.amount) || next.amount < 1) throw new Error("Nominal tidak valid");
  if (!Number.isInteger(next.initialPaidAmount) || next.initialPaidAmount < 0) throw new Error("Nominal terbayar tidak valid");
  const appPaid = bill.paidAmount - bill.initialPaidAmount;
  const paidAmount = appPaid + next.initialPaidAmount;
  if (paidAmount > next.amount) throw new Error("Nominal tagihan lebih kecil dari total yang sudah dibayar");
  const status = paidAmount === 0 ? "UNPAID" : paidAmount === next.amount ? "PAID" : "PARTIAL";
  return { amount: next.amount, initialPaidAmount: next.initialPaidAmount, paidAmount, status: status as "UNPAID" | "PARTIAL" | "PAID" };
}

/**
 * Jendela pelacakan tunggakan: `months` periode berakhir di periode acuan (inklusif).
 * Contoh: acuan Oktober 2026, 60 bulan → November 2021 s.d. Oktober 2026.
 */
export function arrearsWindow(ref: Period, months: number): { start: Period; end: Period } {
  if (!Number.isInteger(months) || months < 1) throw new Error("Jumlah bulan jendela tidak valid");
  return { start: addMonths(ref, -(months - 1)), end: ref };
}

export function periodsBetween(start: Period, end: Period): Period[] {
  const out: Period[] = [];
  for (let i = periodIndex(start); i <= periodIndex(end); i++) out.push(fromIndex(i));
  return out;
}

/** Tanggal jatuh tempo (UTC tengah malam, cocok untuk kolom DATE). dueDay dibatasi 1–28. */
export function dueDateFor(p: Period, dueDay: number): Date {
  return new Date(Date.UTC(p.year, p.month - 1, Math.min(Math.max(dueDay, 1), 28)));
}

export type BillDisplayStatus = "NOT_DUE" | "UNPAID" | "PENDING" | "PARTIAL" | "PAID" | "VOID";

export interface BillLike {
  amount: number;
  paidAmount: number;
  status: "UNPAID" | "PARTIAL" | "PAID" | "VOID";
  dueDate: Date;
}

/**
 * Status tampilan tagihan. Urutan prioritas: Lunas > Dibatalkan > Menunggu Verifikasi >
 * Parsial > Belum Jatuh Tempo > Belum Bayar.
 * Sebuah tagihan dihitung tunggakan hanya bila tanggal jatuh tempo SUDAH LEWAT (dueDate < hari ini).
 */
export function billDisplayStatus(bill: BillLike, pendingAmount: number, today: Date): BillDisplayStatus {
  if (bill.status === "PAID") return "PAID";
  if (bill.status === "VOID") return "VOID";
  if (pendingAmount > 0) return "PENDING";
  if (bill.paidAmount > 0) return "PARTIAL";
  if (bill.dueDate >= today) return "NOT_DUE";
  return "UNPAID";
}

export function isArrears(bill: BillLike, pendingAmount: number, today: Date): boolean {
  const s = billDisplayStatus(bill, pendingAmount, today);
  return (s === "UNPAID" || s === "PARTIAL") && bill.dueDate < today;
}

export const outstanding = (b: Pick<BillLike, "amount" | "paidAmount">) => b.amount - b.paidAmount;

/** Status baru tagihan setelah alokasi pembayaran disetujui. */
export function applyAllocation(bill: Pick<BillLike, "amount" | "paidAmount">, amount: number) {
  const paid = bill.paidAmount + amount;
  if (amount <= 0) throw new Error("Nominal alokasi harus positif");
  if (paid > bill.amount) throw new Error("Alokasi melebihi sisa tagihan");
  return { paidAmount: paid, status: paid === bill.amount ? ("PAID" as const) : ("PARTIAL" as const) };
}

export const BILL_STATUS_TONE: Record<BillDisplayStatus, "green" | "yellow" | "red" | "blue" | "gray" | "gold"> = {
  PAID: "green", PENDING: "blue", PARTIAL: "gold", NOT_DUE: "gray", UNPAID: "red", VOID: "gray",
};
