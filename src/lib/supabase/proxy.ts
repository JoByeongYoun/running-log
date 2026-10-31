import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ONBOARDED_COOKIE, ONBOARDED_COOKIE_OPTIONS } from '@/lib/auth/onboarded-cookie';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  // getClaims()는 JWKS(ES256)로 토큰을 로컬 검증한다. Auth 서버 왕복(getUser)보다 훨씬 빠르다.
  const { data: claims } = await supabase.auth.getClaims();
  const user = claims?.claims.sub ? { id: claims.claims.sub } : null;
  let onboarded: boolean | null = null;
  if (user) {
    // 매 요청마다 DB 를 조회하지 않도록 쿠키로 캐시한다. 온보딩은 한 번 끝나면 되돌리지 않는다.
    if (request.cookies.get(ONBOARDED_COOKIE)?.value === user.id) {
      onboarded = true;
    } else {
      const { data } = await supabase.from('profiles').select('onboarding_completed_at').eq('id', user.id).maybeSingle();
      onboarded = Boolean(data?.onboarding_completed_at);
      if (onboarded) response.cookies.set(ONBOARDED_COOKIE, user.id, ONBOARDED_COOKIE_OPTIONS);
    }
  }
  return { response, user, onboarded };
}
