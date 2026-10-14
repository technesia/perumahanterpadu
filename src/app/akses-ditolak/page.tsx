import { ShieldX } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

export const metadata = { title: "Akses Ditolak" };

export default function Forbidden() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <ShieldX className="h-12 w-12 text-red-500" aria-hidden />
      <h1 className="mt-4 text-xl font-bold">Akses Ditolak</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">Anda tidak memiliki izin untuk membuka halaman ini.</p>
      <LinkButton href="/dashboard" className="mt-6">Kembali ke Dashboard</LinkButton>
    </main>
  );
}
