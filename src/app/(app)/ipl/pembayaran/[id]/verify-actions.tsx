"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { TextAreaField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { approvePaymentAction, cancelPaymentAction, rejectPaymentAction } from "../../actions";

export function VerifyActions({ id, total }: { id: string; total: string }) {
  const [dlg, setDlg] = useState<null | "approve" | "reject">(null);
  const [text, setText] = useState("");
  const close = () => { setDlg(null); setText(""); };
  const approve = useAction(approvePaymentAction, { onSuccess: close });
  const reject = useAction(rejectPaymentAction, { onSuccess: close });
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setDlg("approve")}>Setujui Pembayaran</Button>
      <Button variant="danger" onClick={() => setDlg("reject")}>Tolak</Button>
      <ConfirmDialog open={dlg === "approve"} onClose={close} loading={approve.pending} title="Setujui pembayaran?"
        message={`Periode terkait akan ditandai lunas dan ${total} dicatat sebagai pemasukan kas. Pastikan bukti dan nominal sudah sesuai.`}
        confirmLabel="Ya, Setujui" onConfirm={() => approve.run(id, text)}>
        <TextAreaField label="Catatan verifikasi (opsional)" name="note" value={text} onChange={(e) => setText(e.target.value)} />
      </ConfirmDialog>
      <ConfirmDialog open={dlg === "reject"} onClose={close} loading={reject.pending} danger title="Tolak pembayaran?"
        message="Status periode tidak berubah. Warga dapat mengajukan ulang." confirmLabel="Tolak Pembayaran" onConfirm={() => reject.run(id, text)}>
        <TextAreaField label="Alasan penolakan" name="reason" required value={text} onChange={(e) => setText(e.target.value)} error={reject.errors.reason} />
      </ConfirmDialog>
    </div>
  );
}

export function CancelPaymentButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const a = useAction(cancelPaymentAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Batalkan Pengajuan</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} loading={a.pending} danger title="Batalkan pengajuan?"
        message="Pengajuan ini akan dibatalkan. Anda dapat mengajukan ulang kapan saja." confirmLabel="Batalkan" onConfirm={() => a.run(id)} />
    </>
  );
}
