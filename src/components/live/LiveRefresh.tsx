'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';

const TABLES = ['running_records', 'record_reviews', 'comments', 'notifications', 'join_requests', 'memberships', 'group_weeks'] as const;
// 한 동작이 여러 테이블에 행을 남기므로(기록+알림, 검토+기록+알림) 넉넉히 묶어서 서버 렌더 1회로 만든다.
const DEBOUNCE_MS = 1_500;
// Realtime 이 변경을 전달하므로 탭 복귀 갱신은 오래 떠나 있었을 때만 한다.
const FOCUS_MIN_GAP_MS = 60_000;

/** DB 변경(Realtime) 또는 탭 복귀 시 서버 컴포넌트를 다시 렌더링한다. 로그인 상태에서만 구독한다. */
export function LiveRefresh() {
  const router = useRouter();
  const lastRefresh = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    let cancelled = false;

    function refresh() {
      if (document.visibilityState !== 'visible') return;
      lastRefresh.current = Date.now();
      router.refresh();
    }
    function scheduleRefresh() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, DEBOUNCE_MS);
    }
    function onVisible() {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > FOCUS_MIN_GAP_MS) refresh();
    }

    document.addEventListener('visibilitychange', onVisible);
    const channel = supabase.channel('live-refresh');

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      for (const table of TABLES) channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh);
      channel.subscribe();
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
