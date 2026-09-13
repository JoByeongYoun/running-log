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

/** 제출 마감 시각: 주가 끝난 뒤 화요일 00:00 KST — 월요일 하루 동안 지난주 기록을 더 올릴 수 있다 (UTC+9 고정) */
export function weekSubmitDeadline(weekStart: string): Date {
  return new Date(`${addDays(weekStart, 8)}T00:00:00+09:00`);
}

/** 검토 마감 시각: 주가 끝난 뒤 화요일 12:00 KST (UTC+9 고정) */
export function weekCloseDeadline(weekStart: string): Date {
  return new Date(`${addDays(weekStart, 8)}T12:00:00+09:00`);
}

/** 오늘 기준으로 기록 날짜를 고를 수 있는 가장 이른 날: 월요일이면 지난주 월요일, 아니면 이번 주 월요일 */
export function earliestSelectableDate(today: string, now: Date = new Date()): string {
  const thisMonday = mondayOf(today);
  const lastMonday = addDays(thisMonday, -7);
  return now.getTime() < weekSubmitDeadline(lastMonday).getTime() ? lastMonday : thisMonday;
}

/** 본인 기록을 수정·삭제·재제출할 수 있는 창이 열려 있는지 (DB의 app.editable_record와 같은 규칙) */
export function isEditWindowOpen(weekStart: string, state: 'open' | 'closing' | 'finalized', now: Date = new Date()): boolean {
  if (state === 'open') return true;
  if (state === 'closing') return now.getTime() < weekCloseDeadline(weekStart).getTime();
  return false;
}
