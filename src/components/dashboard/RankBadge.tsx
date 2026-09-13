/** 순위 배지. 1·2·3위는 금·은·동으로 확실히 구분한다. */
export function rankTone(rank: number): string {
  if (rank === 1) return 'bg-gradient-to-br from-yellow-300 to-amber-500 text-amber-950 ring-2 ring-amber-600 shadow-sm';
  if (rank === 2) return 'bg-gradient-to-br from-slate-100 to-slate-400 text-slate-800 ring-2 ring-slate-500 shadow-sm';
  if (rank === 3) return 'bg-gradient-to-br from-orange-400 to-amber-800 text-white ring-2 ring-amber-900 shadow-sm';
  return 'bg-slate-100 text-slate-600';
}

export const RANK_LABEL: Record<number, string> = { 1: '금메달', 2: '은메달', 3: '동메달' };

export function RankBadge({ rank, size = 'sm', suffix = '' }: { rank: number | null | undefined; size?: 'sm' | 'lg'; suffix?: string }) {
  if (rank == null) return <span className="text-slate-300">-</span>;
  const dims = size === 'lg' ? 'h-7 min-w-7 px-1.5 text-xs' : 'h-5 min-w-5 px-1 text-[11px]';
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-bold tabular-nums ${dims} ${rankTone(rank)}`} aria-label={`${rank}위${RANK_LABEL[rank] ? ` ${RANK_LABEL[rank]}` : ''}`}>
      {rank}{suffix}
    </span>
  );
}
