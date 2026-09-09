import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
    const { data } = await supabase.from('profiles').select('onboarding_completed_at').eq('id', user.id).maybeSingle();
    onboarded = Boolean(data?.onboarding_completed_at);
  }
  return { response, user, onboarded };
}
