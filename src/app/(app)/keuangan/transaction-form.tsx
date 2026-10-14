"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { createTransactionAction, correctTransactionAction } from "./actions";

export interface TxValues { date: string; categoryId: string; description: string; amount: number; method: string; reference: string; counterparty: string; notes: string }

function Fields({ type, categories, initial, errors }: {
  type: "INCOME" | "EXPENSE"; categories: { id: string; name: string }[]; initial?: Partial<TxValues>; errors: Record<string, string>;
}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={type === "INCOME" ? "Tanggal Transaksi" : "Tanggal Pengeluaran"} name="date" type="date" required max={today} defaultValue={initial?.date ?? today} error={errors.date} />
        <SelectField label="Kategori" name="categoryId" required defaultValue={initial?.categoryId ?? ""} error={errors.categoryId}>
          <option value="">— Pilih kategori —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
      </div>
      <TextField label="Deskripsi" name="description" required defaultValue={initial?.description} error={errors.description} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nominal (Rp)" name="amount" type="number" min={1} step={1} required defaultValue={initial?.amount} error={errors.amount} />
        <SelectField label="Metode Pembayaran" name="method" required defaultValue={initial?.method ?? "CASH"} error={errors.method}>
          <option value="CASH">Tunai</option><option value="BANK_TRANSFER">Transfer Bank</option><option value="QRIS">QRIS</option>
        </SelectField>
        <TextField label={type === "INCOME" ? "Sumber Pemasukan" : "Penerima / Vendor"} name="counterparty" defaultValue={initial?.counterparty} error={errors.counterparty} />
        <TextField label="Referensi" name="reference" defaultValue={initial?.reference} placeholder="No. nota / bukti" error={errors.reference} />
      </div>
      <TextAreaField label="Catatan" name="notes" defaultValue={initial?.notes} error={errors.notes} />
      <div>
        <label htmlFor="attachment" className="label">{type === "INCOME" ? "Lampiran" : "Bukti / Nota"}</label>
        <input id="attachment" name="attachment" type="file" accept=".jpg,.jpeg,.png,.pdf"
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-800" />
        <p className="mt-1 text-xs text-slate-500">JPG, PNG, atau PDF. Opsional.</p>
      </div>
    </>
  );
}

export function NewTransactionButton({ type, categories }: { type: "INCOME" | "EXPENSE"; categories: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { run, pending, errors } = useAction(createTransactionAction, { onSuccess: (d) => { setOpen(false); router.push(`/keuangan/${(d as { id: string }).id}`); } });
  const label = type === "INCOME" ? "Tambah Pemasukan" : "Tambah Pengeluaran";
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={label}>
        <form noValidate className="grid gap-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("type", type); run(fd); }}>
          <Fields type={type} categories={categories} errors={errors} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={pending}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function CorrectTransactionButton({ id, type, categories, initial }: {
  id: string; type: "INCOME" | "EXPENSE"; categories: { id: string; name: string }[]; initial: TxValues;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, errors } = useAction(correctTransactionAction.bind(null, id), { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Koreksi</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Koreksi Transaksi">
        <form noValidate className="grid gap-4" onSubmit={(e) => { e.preventDefault(); run(new FormData(e.currentTarget)); }}>
          <Fields type={type} categories={categories} initial={initial} errors={errors} />
          <TextAreaField label="Alasan Koreksi" name="reason" required error={errors.reason} hint="Nilai sebelum dan sesudah koreksi disimpan di histori." />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={pending}>Simpan Koreksi</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
