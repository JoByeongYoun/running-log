import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-[#f6f1e8] px-5 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-red-200/60 via-orange-100/40 to-teal-100/50 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark size="lg" className="mb-4 shadow-lg shadow-red-900/10" />
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Running Log</h1>
          <p className="mt-1 text-sm text-slate-500">함께 달리고, 함께 기록해요</p>
        </div>
        <section aria-labelledby="auth-title" className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-900/5 backdrop-blur">
          <h2 id="auth-title" className="mb-5 text-lg font-semibold text-slate-900">{title}</h2>
          {children}
        </section>
      </div>
    </main>
  );
}
