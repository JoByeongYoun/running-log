'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';

const TABLES = ['running_records', 'record_reviews', 'comments', 'notifications', 'join_requests', 'memberships', 'group_weeks'] as const;
const DEBOUNCE_MS = 400;
const FOCUS_MIN_GAP_MS = 5_000;

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
