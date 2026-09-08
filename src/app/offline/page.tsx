import { OfflineRetry } from './OfflineRetry';

export const metadata = { title: '오프라인' };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl" aria-hidden>📡</p>
      <h1 className="mt-4 text-xl font-bold">인터넷에 연결되어 있지 않습니다</h1>
      <p className="mt-2 text-sm text-slate-600">기록 등록, 댓글, 승인은 온라인에서만 할 수 있습니다. 연결 후 다시 시도하세요.</p>
      <OfflineRetry />
    </main>
  );
}
