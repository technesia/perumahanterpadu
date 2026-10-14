import Link from "next/link";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { listCategories, listTransactions } from "@/server/services/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { formatDateOnly, rupiah } from "@/lib/format";
import { PAYMENT_METHOD } from "@/lib/labels";
import { NewTransactionButton } from "./transaction-form";

type SP = Record<string, string | string[] | undefined>;

export async function FinanceList({ type, searchParams }: { type: "INCOME" | "EXPENSE"; searchParams: SP }) {
  const ctx = await requirePage("finance.view");
  const s = searchParams;
  const f = { q: sp(s.q), categoryId: sp(s.categoryId), from: sp(s.from), to: sp(s.to), status: sp(s.status), source: sp(s.source), page: parsePage(s.page) };
  const [{ items, total, sumPosted }, cats] = await Promise.all([listTransactions(ctx, type, f), listCategories(ctx, type)]);
  const isIncome = type === "INCOME";
  const base = isIncome ? "/keuangan/masuk" : "/keuangan/keluar";
  const canManage = can(ctx, isIncome ? "finance.income.manage" : "finance.expense.manage");
  return (
    <>
      <PageHeader title={isIncome ? "Keuangan Masuk" : "Keuangan Keluar"} crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: isIncome ? "Keuangan Masuk" : "Keuangan Keluar" }]}
        description={`${total} transaksi · total tercatat ${rupiah(sumPosted)} (sesuai filter)`}
        actions={canManage && <NewTransactionButton type={type} categories={cats.filter((c) => c.isActive && !c.isSystem).map((c) => ({ id: c.id, name: c.name }))} />} />
      {isIncome && <p className="mb-4 rounded-lg bg-sky-50 px-4 py-2 text-sm text-sky-800">Pemasukan IPL tercatat otomatis saat pembayaran diverifikasi. Pemasukan manual ditandai terpisah.</p>}
      <Card>
        <FilterBar action={base} q={f.q} placeholder="Nomor, deskripsi, atau penerima" resetHref={base}>
          <FilterSelect name="categoryId" label="Kategori" value={f.categoryId} options={cats.map((c) => ({ value: c.id, label: c.name }))} />
          {isIncome && <FilterSelect name="source" label="Sumber" value={f.source} options={[{ value: "IPL_PAYMENT", label: "IPL otomatis" }, { value: "MANUAL", label: "Manual" }]} />}
          <FilterSelect name="status" label="Status" value={f.status} options={[{ value: "POSTED", label: "Tercatat" }, { value: "VOID", label: "Dibatalkan" }]} />
          <div><label htmlFor="from" className="sr-only">Dari tanggal</label><input id="from" name="from" type="date" defaultValue={f.from} className="input h-10 py-0" /></div>
          <div><label htmlFor="to" className="sr-only">Sampai tanggal</label><input id="to" name="to" type="date" defaultValue={f.to} className="input h-10 py-0" /></div>
        </FilterBar>
        <DataTable rows={items} rowKey={(t) => t.id}
          mobileTitle={(t) => <Link href={`/keuangan/${t.id}`} className="link">{t.number}</Link>}
          empty={{ title: "Belum ada transaksi", description: canManage ? `Gunakan tombol ${isIncome ? "Tambah Pemasukan" : "Tambah Pengeluaran"}.` : undefined }}
          columns={[
            { header: "Nomor", hideOnMobile: true, cell: (t) => <Link href={`/keuangan/${t.id}`} className="link">{t.number}</Link> },
            { header: "Tanggal", cell: (t) => formatDateOnly(t.date) },
            { header: "Kategori", cell: (t) => t.category.name },
            { header: "Deskripsi", cell: (t) => t.description },
            ...(isIncome ? [{ header: "Sumber", cell: (t: (typeof items)[number]) => (t.source === "IPL_PAYMENT" ? <Badge tone="green">IPL otomatis</Badge> : <Badge tone="gold">Manual</Badge>) }] : [{ header: "Penerima", cell: (t: (typeof items)[number]) => t.counterparty ?? "-" }]),
            { header: "Metode", cell: (t) => (t.method ? PAYMENT_METHOD[t.method] : "-") },
            { header: "Nominal", cell: (t) => <span className={t.status === "VOID" ? "text-slate-400 line-through" : "font-medium"}>{rupiah(t.amount)}</span> },
            { header: "Status", cell: (t) => (t.status === "VOID" ? <Badge tone="red">Dibatalkan</Badge> : <Badge tone="green">Tercatat</Badge>) },
          ]} />
        <Pagination page={f.page} pageSize={25} total={total} baseHref={base} params={{ q: f.q, categoryId: f.categoryId, from: f.from, to: f.to, status: f.status, source: f.source }} />
      </Card>
    </>
  );
}
