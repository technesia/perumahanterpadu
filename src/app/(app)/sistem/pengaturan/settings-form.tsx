"use client";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { withAuthAction } from "./actions";

export function SettingsForm({ initial }: { initial: { arrearsWindowMonths: number; deathRecordMaxYears: number; allowPartialPayment: boolean; holdPendingBookings: boolean } }) {
  const { run, pending, errors } = useAction(withAuthAction, { successMessage: "Pengaturan disimpan." });
  return (
    <form noValidate className="grid max-w-xl gap-4" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      run({
        arrearsWindowMonths: f.get("arrearsWindowMonths") as never, deathRecordMaxYears: f.get("deathRecordMaxYears") as never,
        allowPartialPayment: f.get("allowPartialPayment") === "on", holdPendingBookings: f.get("holdPendingBookings") === "on",
      });
    }}>
      <TextField label="Jendela Pelacakan Tunggakan (bulan)" name="arrearsWindowMonths" type="number" min={12} max={120} defaultValue={initial.arrearsWindowMonths}
        hint="Default 60 bulan (5 tahun), berakhir di bulan berjalan." error={errors.arrearsWindowMonths} />
      <TextField label="Batas Pencatatan Tanggal Meninggal (tahun)" name="deathRecordMaxYears" type="number" min={1} max={30} defaultValue={initial.deathRecordMaxYears}
        hint="Default 10 tahun ke belakang untuk input normal." error={errors.deathRecordMaxYears} />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="allowPartialPayment" defaultChecked={initial.allowPartialPayment} className="mt-0.5 accent-brand-700" />
        <span><span className="font-medium">Izinkan pembayaran IPL parsial</span><br /><span className="text-slate-500">Warga dapat membayar sebagian nominal satu periode.</span></span></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="holdPendingBookings" defaultChecked={initial.holdPendingBookings} className="mt-0.5 accent-brand-700" />
        <span><span className="font-medium">Tahan slot booking yang menunggu review</span><br /><span className="text-slate-500">Slot yang sedang diajukan tidak dapat dipesan warga lain.</span></span></label>
      <div><Button type="submit" loading={pending}>Simpan Pengaturan</Button></div>
    </form>
  );
}
