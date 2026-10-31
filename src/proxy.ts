import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

const PUBLIC_PREFIXES = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/', '/offline', '/api/cron/', '/api/push/', '/icons/', '/manifest.webmanifest', '/sw.js', '/join/'];
const AUTH_ONLY_PAGES = ['/login', '/signup'];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, user, onboarded } = await updateSession(request);

  if (!user) {
    if (isPublic(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?returnTo=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (AUTH_ONLY_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (onboarded === false && !pathname.startsWith('/onboarding') && !pathname.startsWith('/auth/') && !pathname.startsWith('/api/') && pathname !== '/reset-password') {
    const url = request.nextUrl.clone();
    url.pathname = '/onboarding';
    url.search = pathname === '/' ? '' : `?returnTo=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // api/* 는 각 라우트가 자체 인증하고, sw.js·manifest 는 공개 정적 응답이므로 proxy(JWT 검증·DB 조회)를 거치지 않는다.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|api/|sw\\.js|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico|json|txt)$).*)'],
};
