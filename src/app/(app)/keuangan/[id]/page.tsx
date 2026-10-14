import Link from "next/link";
import { FileText } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { getTransaction, listCategories } from "@/server/services/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateOnly, formatDateTime, rupiah } from "@/lib/format";
import { FINANCE_TYPE, PAYMENT_METHOD } from "@/lib/labels";
import { toIsoDate } from "@/lib/dates";
import { CorrectTransactionButton } from "../transaction-form";
import { VoidTransactionButton } from "./void-button";

export const metadata = { title: "Detail Transaksi" };
const ACTION = { CREATED: "Dicatat", CORRECTED: "Dikoreksi", VOIDED: "Dibatalkan" } as Record<string, string>;

export default async function TransactionDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("finance.view");
  const { id } = await params;
  const t = await getTransaction(ctx, id);
  const back = t.type === "INCOME" ? "/keuangan/masuk" : "/keuangan/keluar";
  const editable = t.source === "MANUAL" && t.status === "POSTED" && can(ctx, t.type === "INCOME" ? "finance.income.manage" : "finance.expense.manage");
  const cats = editable ? (await listCategories(ctx, t.type)).filter((c) => c.isActive && !c.isSystem) : [];
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm"><dt className="text-slate-500">{k}</dt><dd className="col-span-2 font-medium text-slate-800">{v || "-"}</dd></div>
  );
  return (
    <>
      <PageHeader title={`${FINANCE_TYPE[t.type]} ${t.number}`} crumbs={[{ label: t.type === "INCOME" ? "Keuangan Masuk" : "Keuangan Keluar", href: back }, { label: t.number }]}
        actions={editable && <>
          <CorrectTransactionButton id={t.id} type={t.type} categories={cats.map((c) => ({ id: c.id, name: c.name }))}
            initial={{ date: toIsoDate(t.date), categoryId: t.categoryId, description: t.description, amount: t.amount, method: t.method ?? "CASH", reference: t.reference ?? "", counterparty: t.counterparty ?? "", notes: t.notes ?? "" }} />
          <VoidTransactionButton id={t.id} number={t.number} />
        </>} />
      {t.status === "VOID" && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">Dibatalkan {formatDateTime(t.voidedAt)} oleh {t.voidedById ? t.actorNames[t.voidedById] : "-"}: {t.voidReason}</p>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Rincian" action={t.source === "IPL_PAYMENT" ? <Badge tone="green">IPL otomatis</Badge> : <Badge tone="gold">Manual</Badge>} />
          <CardBody>
            <dl className="divide-y divide-slate-100">
              {row("Tanggal", formatDateOnly(t.date))}
              {row("Kategori", t.category.name)}
              {row("Deskripsi", t.description)}
              {row("Nominal", <span className="text-lg">{rupiah(t.amount)}</span>)}
              {row("Metode", t.method ? PAYMENT_METHOD[t.method] : null)}
              {row(t.type === "INCOME" ? "Sumber" : "Penerima / Vendor", t.counterparty)}
              {row("Referensi", t.iplPayment ? <Link className="link" href={`/ipl/pembayaran/${t.iplPayment.id}`}>{t.iplPayment.number}</Link> : t.reference)}
              {row("Catatan", t.notes)}
              {row("Petugas Pencatat", t.createdById ? t.actorNames[t.createdById] : "Sistem")}
              {row("Dicatat", formatDateTime(t.createdAt))}
            </dl>
          </CardBody>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Bukti / Lampiran" />
            <CardBody className="text-sm">
              {t.attachment ? (
                <a href={`/api/files/${t.attachment.id}`} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1"><FileText className="h-4 w-4" /> {t.attachment.originalName}</a>
              ) : <p className="text-slate-500">Tidak ada lampiran.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Histori" />
            <ol className="space-y-3 px-5 py-4 text-sm">
              {t.histories.map((h) => {
                const b = h.before as Record<string, unknown> | null, a = h.after as Record<string, unknown> | null;
                const changed = b && a ? Object.keys(a).filter((k) => k !== "category" && JSON.stringify(a[k]) !== JSON.stringify(b[k])) : [];
                return (
                  <li key={h.id} className="border-l-2 border-brand-200 pl-3">
                    <p className="font-medium">{ACTION[h.action] ?? h.action}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(h.createdAt)} · {h.actorId ? t.actorNames[h.actorId] ?? "-" : "Sistem"}</p>
                    {changed.map((k) => <p key={k} className="text-xs text-slate-600">{k === "categoryId" ? "Kategori diubah" : `${k}: ${String(b![k] ?? "-")} → ${String(a![k] ?? "-")}`}</p>)}
                    {h.reason && <p className="text-xs text-slate-600">Alasan: {h.reason}</p>}
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
