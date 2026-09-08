/** 서비스 내부 경로만 허용. 그 외는 '/'. */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  if (/[\\\r\n]/.test(raw)) return '/';
  if (/^\/[a-z0-9+.-]*:/i.test(raw)) return '/';
  return raw;
}
