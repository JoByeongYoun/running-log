import { NextResponse } from 'next/server';
import { SW_SOURCE } from './source';

export const dynamic = 'force-static';

export function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SW_VERSION ?? 'dev';
  const body = SW_SOURCE.replace("self.__SW_VERSION__ || 'dev'", JSON.stringify(version.slice(0, 12)));
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
