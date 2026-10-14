import { FinanceList } from "../finance-list";

export const metadata = { title: "Keuangan Keluar" };

export default async function ExpensePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FinanceList type="EXPENSE" searchParams={await searchParams} />;
}
