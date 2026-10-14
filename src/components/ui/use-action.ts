"use client";
import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./toast";

export type ClientActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Menjalankan server action dengan pencegahan double submit, toast, dan
 * error per-field. Input form tidak di-reset saat validasi gagal.
 */
export function useAction<A extends unknown[], T>(
  action: (...args: A) => Promise<ClientActionResult<T>>,
  opts: { onSuccess?: (data: T | undefined) => void; successMessage?: string; refresh?: boolean } = {},
) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(false);
  const toast = useToast();
  const router = useRouter();

  const run = useCallback(
    (...args: A) => {
      if (inFlight.current) return;
      inFlight.current = true;
      startTransition(async () => {
        try {
          const res = await action(...args);
          if (res.ok) {
            setErrors({});
            const msg = res.message ?? opts.successMessage;
            if (msg) toast.success(msg);
            if (opts.refresh !== false) router.refresh();
            opts.onSuccess?.(res.data);
          } else {
            setErrors(res.fieldErrors ?? {});
            toast.error(res.error);
          }
        } catch {
          toast.error("Koneksi terputus atau server tidak merespons. Silakan coba lagi.");
        } finally {
          inFlight.current = false;
        }
      });
    },
    [action, opts, router, toast],
  );

  return { run, pending, errors, setErrors };
}
