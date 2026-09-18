import { AppHeader } from '@/components/layout/AppHeader';

/** 기록 상세 스켈레톤. 동적 라우트를 부분 프리페치하게 하여 탭 즉시 화면이 전환된다. */
export default function RecordLoading() {
  return (
    <>
      <AppHeader title="기록 상세" back="/" />
      <main role="status" aria-label="기록 불러오는 중" className="mx-auto w-full max-w-md animate-pulse space-y-4 px-4 py-4">
        <section className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="h-3 w-16 rounded bg-slate-100" />
            </div>
            <div className="h-5 w-12 rounded-full bg-slate-100" />
          </div>
          <div className="mt-4 h-8 w-32 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-full rounded bg-slate-100" />
          <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
        </section>
        <section className="grid grid-cols-3 gap-2">
          <div className="aspect-square rounded-xl bg-slate-100" />
          <div className="aspect-square rounded-xl bg-slate-100" />
          <div className="aspect-square rounded-xl bg-slate-100" />
        </section>
        <section className="rounded-2xl border border-slate-200 p-4">
          <div className="h-4 w-16 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-full rounded bg-slate-100" />
          <div className="mt-2 h-3 w-3/4 rounded bg-slate-100" />
        </section>
      </main>
    </>
  );
}
