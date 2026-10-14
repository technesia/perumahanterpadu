"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { TextAreaField } from "@/components/ui/field";
import { useAction } from "@/components/ui/use-action";
import { approveBookingAction, cancelBookingAction, rejectBookingAction } from "../actions";

export function BookingActions({ id, canReview, canCancel, ownerCancel }: { id: string; canReview: boolean; canCancel: boolean; ownerCancel: boolean }) {
  const [dlg, setDlg] = useState<null | "approve" | "reject" | "cancel">(null);
  const [text, setText] = useState("");
  const close = () => { setDlg(null); setText(""); };
  const approve = useAction(approveBookingAction, { onSuccess: close });
  const reject = useAction(rejectBookingAction, { onSuccess: close });
  const cancel = useAction(cancelBookingAction, { onSuccess: close });
  return (
    <div className="flex flex-wrap gap-2">
      {canReview && <>
        <Button onClick={() => setDlg("approve")}>Setujui</Button>
        <Button variant="danger" onClick={() => setDlg("reject")}>Tolak</Button>
      </>}
      {canCancel && <Button variant="secondary" onClick={() => setDlg("cancel")}>Batalkan Booking</Button>}
      <ConfirmDialog open={dlg === "approve"} onClose={close} loading={approve.pending} title="Setujui booking?" confirmLabel="Setujui"
        message="Pengajuan lain yang bertabrakan pada slot ini akan ditolak otomatis." onConfirm={() => approve.run(id, text)}>
        <TextAreaField label="Catatan untuk pemohon (opsional)" name="note" value={text} onChange={(e) => setText(e.target.value)} />
      </ConfirmDialog>
      <ConfirmDialog open={dlg === "reject"} onClose={close} loading={reject.pending} danger title="Tolak booking?" confirmLabel="Tolak"
        message="Slot akan dilepas dan dapat dipesan warga lain." onConfirm={() => reject.run(id, text)}>
        <TextAreaField label="Alasan penolakan" name="reason" required value={text} onChange={(e) => setText(e.target.value)} error={reject.errors.reason} />
      </ConfirmDialog>
      <ConfirmDialog open={dlg === "cancel"} onClose={close} loading={cancel.pending} danger title="Batalkan booking?" confirmLabel="Batalkan Booking"
        message="Slot akan dilepas dan dapat dipesan warga lain." onConfirm={() => cancel.run(id, text)}>
        {!ownerCancel && <TextAreaField label="Alasan pembatalan" name="reason" required value={text} onChange={(e) => setText(e.target.value)} error={cancel.errors.reason} />}
      </ConfirmDialog>
    </div>
  );
}
