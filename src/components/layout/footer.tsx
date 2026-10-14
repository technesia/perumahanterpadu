export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-t border-slate-200 bg-white px-4 py-5 text-center text-xs leading-relaxed text-slate-500 ${className}`}>
      <p className="font-semibold text-brand-800">Taman Pesona Rajeg Mulya</p>
      <p>RT 004 RW 04</p>
      <p>Desa Rajeg Mulya</p>
      <p>Kab Tangerang</p>
    </footer>
  );
}
