import { TZ } from './constants';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** KST 날짜 YYYY-MM-DD */
export function kstDateOf(instant: Date): string {
  return fmt.format(instant);
}

function toUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  const d = toUtcDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtcDate(d);
}

/** 주어진 시각이 속한 KST 주의 월요일 날짜 */
export function weekStartOf(instant: Date): string {
  const ymd = kstDateOf(instant);
  return mondayOf(ymd);
}

/** 임의 날짜가 속한 주의 월요일 */
export function mondayOf(ymd: string): string {
  const dow = toUtcDate(ymd).getUTCDay(); // 0=Sun
  const back = (dow + 6) % 7; // Mon=0
  return addDays(ymd, -back);
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUtcDate(toUtcDate(s)) === s;
}

export function weekRange(weekStart: string): { start: string; end: string } {
  return { start: weekStart, end: addDays(weekStart, 6) };
}

export function addWeeks(weekStart: string, n: number): string {
  return addDays(weekStart, 7 * n);
}

export function formatWeekRange(weekStart: string): string {
  const { start, end } = weekRange(weekStart);
  const [, sm, sd] = start.split('-');
  const [, em, ed] = end.split('-');
  return `${Number(sm)}.${Number(sd)} ~ ${Number(em)}.${Number(ed)}`;
}
