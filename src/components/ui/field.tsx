import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

interface Base { label: string; name: string; error?: string; hint?: string; required?: boolean }

function Wrap({ label, name, error, hint, required, children }: Base & { children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label} {required && <span className="text-red-600" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${name}-error`} className="mt-1 text-xs font-medium text-red-600" role="alert">{error}</p>}
    </div>
  );
}

export function TextField({ label, name, error, hint, required, className, ...rest }: Base & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Wrap {...{ label, name, error, hint, required }}>
      <input id={name} name={name} required={required} aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        className={cn("input", error && "input-error", className)} {...rest} />
    </Wrap>
  );
}

export function SelectField({ label, name, error, hint, required, className, children, ...rest }: Base & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Wrap {...{ label, name, error, hint, required }}>
      <select id={name} name={name} required={required} aria-invalid={!!error}
        className={cn("input", error && "input-error", className)} {...rest}>{children}</select>
    </Wrap>
  );
}

export function TextAreaField({ label, name, error, hint, required, className, ...rest }: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Wrap {...{ label, name, error, hint, required }}>
      <textarea id={name} name={name} required={required} aria-invalid={!!error} rows={3}
        className={cn("input", error && "input-error", className)} {...rest} />
    </Wrap>
  );
}
