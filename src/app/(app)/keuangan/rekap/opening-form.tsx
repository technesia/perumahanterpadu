"use client";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { setOpeningBalanceAction } from "../actions";

export function OpeningBalanceForm() {
  const ref = useRef<HTMLFormElement>(null);
  const { run, pending, errors } = useAction(setOpeningBalanceAction, { onSuccess: () => ref.current?.reset() });
  return (
    <form ref={ref} noValidate className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      run({ amount: f.amount as never, effectiveDate: f.effectiveDate, note: f.note });
    }}>
      <TextField label="Saldo Awal (Rp)" name="amount" type="number" step={1} required error={errors.amount} />
      <TextField label="Berlaku Sejak" name="effectiveDate" type="date" required error={errors.effectiveDate}
        hint="Transaksi sebelum tanggal ini tidak dihitung dalam saldo." />
      <TextField label="Keterangan" name="note" required placeholder="mis. Serah terima kas pengurus" error={errors.note} />
      <div><Button type="submit" loading={pending}>Simpan Saldo Awal</Button></div>
    </form>
  );
}
