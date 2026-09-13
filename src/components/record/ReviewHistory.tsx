type Review = { id: string; toStatus: 'pending' | 'approved' | 'rejected' | 'expired'; reason: string | null; createdAt: string; byOwner: boolean };

function label(r: Review, index: number): string {
  switch (r.toStatus) {
    case 'pending': return index === 0 ? '제출' : r.byOwner ? '보강 후 재제출' : `승인 취소${r.reason ? ` · ${r.reason}` : ''}`;
    case 'approved': return '승인';
    case 'rejected': return `반려${r.reason ? ` · ${r.reason}` : ''}`;
    case 'expired': return '기한 만료';
  }
}

const TONE = { pending: 'bg-amber-400', approved: 'bg-emerald-500', rejected: 'bg-red-500', expired: 'bg-slate-400' } as const;

/** 제출 → 반려 → 재제출 → 승인 같은 검토 이력. 이력이 2건 이상일 때만 표시한다. */
export function ReviewHistory({ reviews }: { reviews: Review[] }) {
  if (reviews.length < 2) return null;
  return (
    <details className="mt-3 text-xs text-slate-600">
      <summary className="cursor-pointer select-none text-slate-500">검토 이력 {reviews.length}건</summary>
      <ol className="mt-2 space-y-1 border-l border-slate-200 pl-3">
        {reviews.map((r, i) => (
          <li key={r.id} className="relative">
            <span className={`absolute -left-[17px] top-1.5 h-2 w-2 rounded-full ${TONE[r.toStatus]}`} aria-hidden />
            <span>{label(r, i)}</span>
            <span className="ml-1 text-slate-400">{new Date(r.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
