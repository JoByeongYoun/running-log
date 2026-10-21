'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleLike } from '@/actions/like';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';

export type Liker = { userId: string; nickname: string; avatarUrl: string | null };

const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];
const SPARK_COLORS = ['#f43f5e', '#fb923c', '#facc15', '#f472b6'];

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <defs>
        <linearGradient id="like-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
      </defs>
      <path
        d="M12 20.5s-7.5-4.6-9.5-9.3C1.1 7.9 3.2 4.5 6.6 4.5c2 0 3.6 1.1 4.4 2.6h2c.8-1.5 2.4-2.6 4.4-2.6 3.4 0 5.5 3.4 4.1 6.7-2 4.7-9.5 9.3-9.5 9.3z"
        fill={filled ? 'url(#like-grad)' : 'none'}
        stroke={filled ? '#e11d48' : '#94a3b8'}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LikeButton({ recordId, myId, initialLiked, likers }: { recordId: string; myId: string; initialLiked: boolean; likers: Liker[] }) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(likers.length);
  const [burst, setBurst] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const others = likers.filter((l) => l.userId !== myId);
  const faces = others.slice(0, 3);
  const summary = (() => {
    if (count === 0) return '첫 번째로 응원해 주세요';
    if (liked && count === 1) return '내가 응원했어요';
    const lead = liked ? '나' : others[0] ? `${others[0].nickname}님` : null;
    const rest = count - 1;
    if (!lead) return `${count}명이 응원해요`;
    return rest > 0 ? `${lead} 외 ${rest}명이 응원해요` : `${lead}이 응원해요`;
  })();

  const onClick = () => {
    const next = !liked;
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    if (next) setBurst((b) => b + 1);
    if (typeof navigator !== 'undefined' && next) navigator.vibrate?.(15);
    start(async () => {
      const res = await toggleLike(recordId);
      if ('error' in res) {
        setLiked(!next);
        setCount((c) => c + (next ? -1 : 1));
        toast(res.error, 'error');
        return;
      }
      setLiked(res.liked);
      setCount(res.count);
      router.refresh();
    });
  };

  return (
    <section className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={liked}
        aria-label={liked ? '좋아요 취소' : '좋아요'}
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${liked ? 'bg-rose-50' : 'bg-slate-50 hover:bg-rose-50'} active:scale-95`}
      >
        <span key={`h${burst}`} className={burst > 0 ? 'like-pop' : ''}><Heart filled={liked} /></span>
        {burst > 0 && liked && (
          <span key={`b${burst}`} className="pointer-events-none absolute inset-0" aria-hidden>
            <span className="like-ring absolute inset-0 rounded-full border-rose-400" style={{ borderStyle: 'solid' }} />
            {SPARKS.map((a, i) => (
              <span
                key={a}
                className="like-spark absolute left-1/2 top-1/2 -ml-1 -mt-1 h-2 w-2 rounded-full"
                style={{ ['--a' as string]: `${a}deg`, background: SPARK_COLORS[i % SPARK_COLORS.length] }}
              />
            ))}
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1">
          <span key={count} className={`like-count text-lg font-bold tabular-nums ${liked ? 'text-rose-600' : 'text-slate-800'}`}>{count}</span>
          <span className="text-xs text-slate-500">좋아요</span>
        </p>
        <p className="truncate text-xs text-slate-500">{summary}</p>
      </div>
      {faces.length > 0 && (
        <div className="flex -space-x-2">
          {faces.map((l) => (
            <span key={l.userId} className="rounded-full ring-2 ring-white"><Avatar src={l.avatarUrl} name={l.nickname} size={24} /></span>
          ))}
        </div>
      )}
    </section>
  );
}
