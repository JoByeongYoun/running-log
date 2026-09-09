import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/db/types';

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Component에서 호출된 경우: proxy가 세션을 갱신하므로 무시
          }
        },
      },
    },
  );
}

/** 로그인 사용자와 프로필. 미로그인 시 null. */
export async function getSessionUser() {
  const supabase = await createServerSupabase();
  // 로컬 JWT 검증(JWKS 캐시). 세션 갱신은 proxy가 담당하므로 여기서는 Auth 서버 왕복을 피한다.
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return null;
  const user = { id: claims.claims.sub, email: claims.claims.email as string | undefined };
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_path, onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle();
  return { user, profile, supabase };
}
