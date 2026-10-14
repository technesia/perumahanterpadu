import Link from "next/link";
import { FileText, Phone } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { getPayment } from "@/server/services/ipl-payments";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PaymentStatusBadge } from "@/components/domain/status-badges";
import { formatDateTime, periodLabel, rupiah, waNumber } from "@/lib/format";
import { OCCUPANCY_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/labels";
import { CancelPaymentButton, VerifyActions } from "./verify-actions";

export const metadata = { title: "Detail Pembayaran" };

export default async function PaymentDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["ipl.view", "ipl.self_view"]);
  const { id } = await params;
  const p = await getPayment(ctx, id);
  const staff = can(ctx, "ipl.view");
  const mine = p.submittedById === ctx.userId || p.residentId === ctx.residentId;
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm"><dt className="text-slate-500">{k}</dt><dd className="col-span-2 font-medium text-slate-800">{v ?? "-"}</dd></div>
  );
  const wa = waNumber(p.resident.phone);
  return (
    <>
      <PageHeader title={`Pembayaran ${p.number}`}
        crumbs={[{ label: staff ? "Pembayaran IPL" : "Riwayat Pembayaran", href: staff ? "/ipl/pembayaran" : "/riwayat-pembayaran" }, { label: p.number }]}
        actions={<>
          {p.status === "PENDING_VERIFICATION" && p.canVerify && <VerifyActions id={p.id} total={rupiah(p.totalAmount)} />}
          {p.status === "PENDING_VERIFICATION" && !p.canVerify && mine && <CancelPaymentButton id={p.id} />}
        </>} />
      {p.status === "REJECTED" && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Pembayaran ditolak</p>
          <p>Alasan: {p.rejectionReason}</p>
          {mine && <Link href="/ipl/pembayaran/baru" className="mt-2 inline-block font-medium underline">Ajukan ulang pembayaran</Link>}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Rincian" action={<PaymentStatusBadge status={p.status} />} />
          <CardBody>
            <dl className="divide-y divide-slate-100">
              {row("Warga", p.resident.fullName)}
              {row("Rumah", `${p.unit.houseNumber} — ${p.unit.address}`)}
              {row("Nomor HP", p.resident.phone ? (
                <span className="flex flex-wrap items-center gap-2">{p.resident.phone}
                  {staff && wa && <a className="link inline-flex items-center gap-1 text-xs" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><Phone className="h-3 w-3" /> Hubungi Warga</a>}
                </span>) : "-")}
              {row("Status Penghuni", OCCUPANCY_STATUS[p.resident.occupancyStatus])}
              {row("Metode", PAYMENT_METHOD[p.method])}
              {row("Diajukan", `${formatDateTime(p.createdAt)} oleh ${p.actorNames[p.submittedById] ?? "-"}`)}
              {p.verifiedAt && row(p.status === "APPROVED" ? "Disetujui" : "Diputuskan", `${formatDateTime(p.verifiedAt)} oleh ${p.verifiedById ? p.actorNames[p.verifiedById] ?? "Sistem" : "Sistem (provider)"}`)}
              {p.providerTransactionId && row("ID Transaksi Provider", <span className="font-mono text-xs">{p.providerName}: {p.providerTransactionId}</span>)}
              {p.financeTransaction && staff && row("Pemasukan Kas", p.financeTransaction.number)}
              {p.notes && row("Catatan", p.notes)}
            </dl>
            <h3 className="mb-2 mt-5 text-sm font-semibold">Alokasi per Periode</h3>
            <table className="table-base rounded-lg border">
              <thead><tr><th>Periode</th><th>Jenis</th><th className="text-right">Nominal</th></tr></thead>
              <tbody>
                {p.allocations.map((a) => (
                  <tr key={a.id}><td>{periodLabel(a.bill.periodYear, a.bill.periodMonth)}</td><td>{a.bill.iplType.name}</td><td className="text-right">{rupiah(a.amount)}</td></tr>
                ))}
                <tr><td colSpan={2} className="font-semibold">Total</td><td className="text-right font-bold">{rupiah(p.totalAmount)}</td></tr>
              </tbody>
            </table>
          </CardBody>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Bukti Pembayaran" />
            <CardBody>
              {p.proofs.length === 0 ? <p className="text-sm text-slate-500">Tidak ada bukti diunggah.</p> : p.proofs.map((pr) => (
                <div key={pr.id} className="space-y-2">
                  {pr.file.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a href={`/api/files/${pr.file.id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/files/${pr.file.id}`} alt="Bukti transfer" className="max-h-96 w-full rounded-lg border object-contain" /></a>
                  ) : (
                    <a href={`/api/files/${pr.file.id}`} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1"><FileText className="h-4 w-4" /> {pr.file.originalName}</a>
                  )}
                  <a href={`/api/files/${pr.file.id}?download=1`} className="link block text-xs">Unduh berkas</a>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Riwayat Status" />
            <ol className="space-y-3 px-5 py-4 text-sm">
              {p.histories.map((h) => (
                <li key={h.id} className="border-l-2 border-brand-200 pl-3">
                  <p className="font-medium">{PAYMENT_STATUS[h.toStatus]}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(h.createdAt)}{h.actorId ? ` · ${p.actorNames[h.actorId] ?? ""}` : ""}</p>
                  {h.note && <p className="text-xs text-slate-600">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
