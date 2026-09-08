import { MAX_RECORD_METERS } from './constants';

export type ParsedDistance =
  | { ok: true; meters: number }
  | { ok: false; error: 'invalid' | 'too_many_decimals' | 'out_of_range' };

/** "12.34" → 12340 (m). 소수 셋째 자리 이상은 반올림하지 않고 오류. */
export function parseDistanceToMeters(input: string, max = MAX_RECORD_METERS): ParsedDistance {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: 'invalid' };
  const [whole, frac = ''] = s.split('.');
  if (frac.length > 2) return { ok: false, error: 'too_many_decimals' };
  const meters = Number(whole) * 1000 + Number(frac.padEnd(3, '0'));
  if (!Number.isSafeInteger(meters) || meters <= 0 || meters > max) {
    return { ok: false, error: 'out_of_range' };
  }
  return { ok: true, meters };
}

/** 12340 → "12.34" */
export function formatMeters(meters: number): string {
  const sign = meters < 0 ? '-' : '';
  const abs = Math.abs(meters);
  const km = Math.floor(abs / 1000);
  const rest = Math.round((abs % 1000) / 10);
  return `${sign}${km}.${String(rest).padStart(2, '0')}`;
}
