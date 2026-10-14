"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Bilah progres tipis saat berpindah halaman (indikator loading navigasi). */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);

  useEffect(() => setActive(false), [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setActive(true);
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      // getAttribute: properti form.method dapat tertimpa input bernama "method".
      if ((f.getAttribute("method") ?? "").toLowerCase() === "get") setActive(true);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("submit", onSubmit); };
  }, []);

  if (!active) return null;
  return (
    <div role="progressbar" aria-label="Memuat halaman" className="fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden bg-brand-100">
      <div className="h-full w-1/3 animate-[progress_1.2s_ease-in-out_infinite] bg-brand-600" />
    </div>
  );
}
