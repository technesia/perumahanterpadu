import Image from "next/image";

/** Logo asli dari pemesan (hanya margin putih yang dipangkas; rasio & warna dipertahankan). */
export function Logo({ className = "h-12 w-auto", priority }: { className?: string; priority?: boolean }) {
  return (
    <Image src="/brand/logo.jpg" alt="Perumahan Taman Pesona Rajeg Mulya RT 004" width={861} height={574}
      className={className} priority={priority} />
  );
}
