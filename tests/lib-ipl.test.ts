import { describe, expect, it } from "vitest";
import { applyAllocation, arrearsWindow, billDisplayStatus, dueDateFor, isArrears, periodsBetween } from "@/lib/ipl";
import { periodLabel } from "@/lib/format";

const today = new Date("2026-10-14T00:00:00Z");

describe("Jendela tunggakan (#11, #12)", () => {
  it("60 bulan dari Oktober 2026 = November 2021 s.d. Oktober 2026", () => {
    const w = arrearsWindow({ year: 2026, month: 10 }, 60);
    expect(w.start).toEqual({ year: 2021, month: 11 });
    expect(w.end).toEqual({ year: 2026, month: 10 });
    expect(periodsBetween(w.start, w.end)).toHaveLength(60);
  });

  it("label periode bulan & tahun tepat", () => {
    expect(periodLabel(2026, 1)).toBe("Januari 2026");
    expect(periodLabel(2021, 11)).toBe("November 2021");
  });

  it("melintasi pergantian tahun", () => {
    const w = arrearsWindow({ year: 2026, month: 2 }, 3);
    expect(periodsBetween(w.start, w.end)).toEqual([{ year: 2025, month: 12 }, { year: 2026, month: 1 }, { year: 2026, month: 2 }]);
  });

  it("dueDay dibatasi ke 28 agar valid untuk Februari", () => {
    expect(dueDateFor({ year: 2026, month: 2 }, 31).toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("Status tagihan", () => {
  const bill = (o: Partial<{ amount: number; paidAmount: number; status: "UNPAID" | "PARTIAL" | "PAID" | "VOID"; dueDate: Date }>) => ({
    amount: 100000, paidAmount: 0, status: "UNPAID" as const, dueDate: new Date("2026-09-10T00:00:00Z"), ...o,
  });

  it("belum jatuh tempo bukan tunggakan", () => {
    const b = bill({ dueDate: new Date("2026-10-20T00:00:00Z") });
    expect(billDisplayStatus(b, 0, today)).toBe("NOT_DUE");
    expect(isArrears(b, 0, today)).toBe(false);
  });

  it("tepat di tanggal jatuh tempo belum dihitung tunggakan", () => {
    const b = bill({ dueDate: today });
    expect(isArrears(b, 0, today)).toBe(false);
  });

  it("lewat jatuh tempo & belum bayar = tunggakan", () => {
    expect(billDisplayStatus(bill({}), 0, today)).toBe("UNPAID");
    expect(isArrears(bill({}), 0, today)).toBe(true);
  });

  it("menunggu verifikasi terpisah, bukan lunas/gagal", () => {
    expect(billDisplayStatus(bill({}), 100000, today)).toBe("PENDING");
    expect(isArrears(bill({}), 100000, today)).toBe(false);
  });

  it("alokasi penuh = lunas, sebagian = parsial, berlebih ditolak", () => {
    expect(applyAllocation({ amount: 100000, paidAmount: 0 }, 100000).status).toBe("PAID");
    expect(applyAllocation({ amount: 100000, paidAmount: 0 }, 40000)).toEqual({ paidAmount: 40000, status: "PARTIAL" });
    expect(() => applyAllocation({ amount: 100000, paidAmount: 80000 }, 40000)).toThrow();
  });
});
