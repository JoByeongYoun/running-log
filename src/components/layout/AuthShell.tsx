import type { ReactNode } from 'react';

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <h1 className="mb-1 text-center text-2xl font-bold">우리들의 러닝일지</h1>
      <p className="mb-8 text-center text-sm text-slate-500">{title}</p>
      {children}
    </main>
  );
}
