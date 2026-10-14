"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/**
 * Peringatan tunggakan untuk warga. Toast hanya muncul sekali per sesi browser;
 * indikator tetap tampil di dashboard selama tunggakan masih ada.
 * Komponen ini tidak dirender sama sekali bila tidak ada tunggakan.
 */
export function ArrearsWarning({ name, houseNumber, months, periods, total }: {
  name: string; houseNumber: string; months: number; periods: string[]; total: string;
}) {
  const toast = useToast();
  useEffect(() => {
    try {
      const key = `arrears-toast:${months}:${total}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* storage tidak tersedia: tetap tampilkan sekali */ }
    toast.warning(`Anda memiliki tunggakan IPL ${months} bulan (${total}).`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Tunggakan IPL — {name}, rumah {houseNumber}</p>
          <p className="mt-1 text-sm">
            {months} bulan belum dibayar, total <strong>{total}</strong>.
          </p>
          <p className="mt-1 text-sm">Periode: {periods.slice(0, 6).join(", ")}{periods.length > 6 ? ` dan ${periods.length - 6} lainnya` : ""}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/tagihan-saya" className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium hover:bg-amber-100">Lihat Detail</Link>
            <Link href="/ipl/pembayaran/baru" className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800">Bayar Sekarang</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
