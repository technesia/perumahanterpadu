import type { ReactNode } from "react";
import { EmptyState } from "./empty-state";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Sembunyikan di tampilan kartu mobile. */
  hideOnMobile?: boolean;
}

/** Tabel di layar ≥ md, daftar kartu di mobile. */
export function DataTable<T>({ rows, columns, rowKey, empty, mobileTitle }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string;
  empty?: { title: string; description?: string; action?: ReactNode };
  mobileTitle?: (r: T) => ReactNode;
}) {
  if (rows.length === 0) return <EmptyState title={empty?.title ?? "Belum ada data"} description={empty?.description} action={empty?.action} />;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="table-base">
          <thead><tr>{columns.map((c, i) => <th key={i} scope="col" className={c.className}>{c.header}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="hover:bg-slate-50/60">
                {columns.map((c, i) => <td key={i} className={c.className}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="px-4 py-3">
            {mobileTitle && <div className="mb-1.5 font-medium text-slate-900">{mobileTitle(r)}</div>}
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
              {columns.filter((c) => !c.hideOnMobile).map((c, i) => (
                <div key={i} className="contents">
                  <dt className="text-slate-500">{c.header}</dt>
                  <dd className="min-w-0 break-words text-slate-800">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
