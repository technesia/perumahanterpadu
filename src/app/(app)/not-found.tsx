import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="font-semibold text-slate-900">Data tidak ditemukan</h1>
      <p className="mt-2 text-sm text-slate-500">Halaman atau data yang Anda cari tidak tersedia.</p>
      <LinkButton href="/dashboard" className="mt-4">Kembali ke Dashboard</LinkButton>
    </div>
  );
}
