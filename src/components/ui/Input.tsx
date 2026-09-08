import { type InputHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react';

type Common = { label: string; hint?: string; error?: string };

export function Input({ label, hint, error, id, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & Common) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
        className={`block min-h-11 w-full rounded-xl border px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-500 ${error ? 'border-red-500' : 'border-slate-300'} ${className}`}
        {...rest}
      />
      {hint && !error && <p id={`${inputId}-hint`} className="text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${inputId}-err`} className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

export function Textarea({ label, hint, error, id, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & Common) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">{label}</label>
      <textarea
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
        className={`block w-full rounded-xl border px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-slate-500 ${error ? 'border-red-500' : 'border-slate-300'} ${className}`}
        {...rest}
      />
      {hint && !error && <p id={`${inputId}-hint`} className="text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${inputId}-err`} className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}
