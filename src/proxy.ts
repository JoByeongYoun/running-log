import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

const PUBLIC_PREFIXES = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/', '/offline', '/api/cron/', '/icons/', '/manifest.webmanifest', '/sw.js', '/join/'];
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|json|txt)$).*)'],
};
