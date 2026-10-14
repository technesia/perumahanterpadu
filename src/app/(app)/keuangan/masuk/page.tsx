import { FinanceList } from "../finance-list";

export const metadata = { title: "Keuangan Masuk" };

export default async function IncomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FinanceList type="INCOME" searchParams={await searchParams} />;
}
