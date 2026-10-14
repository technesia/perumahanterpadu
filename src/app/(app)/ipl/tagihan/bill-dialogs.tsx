"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { SelectField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { MONTHS_ID } from "@/lib/format";
import { generateBillsAction, voidBillAction } from "../actions";

export function GenerateBillsButton({ types, defaultYear, defaultMonth, minYear }: {
  types: { id: string; name: string; amount: number }[]; defaultYear: number; defaultMonth: number; minYear: number;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, errors } = useAction(generateBillsAction, { onSuccess: () => setOpen(false) });
  const years = Array.from({ length: defaultYear + 2 - minYear }, (_, i) => minYear + i);
  const monthSel = (name: string, label: string) => (
    <SelectField label={label} name={name} defaultValue={String(defaultMonth)} error={errors[name]}>
      {MONTHS_ID.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
    </SelectField>
  );
  const yearSel = (name: string, label: string) => (
    <SelectField label={label} name={name} defaultValue={String(defaultYear)} error={errors[name]}>
      {years.map((y) => <option key={y} value={y}>{y}</option>)}
    </SelectField>
  );
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={types.length === 0}>Terbitkan Tagihan</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Terbitkan Tagihan IPL">
        <form noValidate className="grid gap-4" onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          run({ iplTypeId: f.iplTypeId, fromYear: f.fromYear as never, fromMonth: f.fromMonth as never, toYear: f.toYear as never, toMonth: f.toMonth as never });
        }}>
          <SelectField label="Jenis Iuran" name="iplTypeId" required error={errors.iplTypeId}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </SelectField>
          <div className="grid grid-cols-2 gap-4">{monthSel("fromMonth", "Dari Bulan")}{yearSel("fromYear", "Tahun")}</div>
          <div className="grid grid-cols-2 gap-4">{monthSel("toMonth", "Sampai Bulan")}{yearSel("toYear", "Tahun")}</div>
          <p className="text-xs text-slate-500">
            Tagihan dibuat untuk setiap rumah aktif yang tidak berstatus Kosong. Tagihan yang sudah ada untuk rumah, jenis, dan periode yang sama dilewati (tidak digandakan).
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={pending}>Terbitkan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function VoidBillButton({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending, errors } = useAction(voidBillAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Batalkan</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} danger loading={pending} title="Batalkan tagihan?"
        message={`Tagihan ${label} akan dibatalkan dan tidak dihitung sebagai tunggakan.`} confirmLabel="Batalkan Tagihan" onConfirm={() => run(id, reason)}>
        <TextField label="Alasan" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
      </ConfirmDialog>
    </>
  );
}
