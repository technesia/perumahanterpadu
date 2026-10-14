"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="font-semibold text-slate-900">Terjadi kesalahan</h1>
      <p className="mt-2 text-sm text-slate-500">Halaman tidak dapat dimuat. Silakan coba lagi.</p>
      <Button className="mt-4" onClick={reset}>Coba Lagi</Button>
    </div>
  );
}
