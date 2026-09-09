'use client';
import Link from 'next/link';
import { formatMeters } from '@/lib/domain/distance';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { OUTCOME_LABEL, STATUS_LABEL, type MemberRow, type Outcome, type WeekDashboard } from '@/lib/dashboard/types';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];

const OUTCOME_STYLE: Record<Outcome, string> = {
  success: 'bg-emerald-500/15 text-emerald-100 ring-emerald-300/40',
  provisional_success: 'bg-emerald-500/15 text-emerald-100 ring-emerald-300/40',
  fail: 'bg-rose-500/20 text-rose-100 ring-rose-300/40',
  provisional_fail: 'bg-rose-500/20 text-rose-100 ring-rose-300/40',
  pending_review: 'bg-amber-400/20 text-amber-100 ring-amber-300/40',
  not_evaluated: 'bg-white/10 text-slate-200 ring-white/20',
};

type Props = { member: MemberRow | null; data: WeekDashboard; isMe: boolean; onClose: () => void };

export function MemberModal({ member, data, isMe, onClose }: Props) {
  const m = member;
  const target = data.week.targetMeters;
  const approved = m?.approvedMeters ?? 0;
  const pending = m?.pendingMeters ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((approved / target) * 100)) : 0;
  const pendingPct = target > 0 ? Math.min(100 - pct, Math.round((pending / target) * 100)) : 0;
  const remaining = Math.max(0, target - approved);
  const over = Math.max(0, approved - target);
  const dayMax = Math.max(1, ...(m?.days.map((d) => d.approvedMeters + d.pendingMeters) ?? [1]));
  const runDays = m?.days.filter((d) => d.approvedMeters > 0).length ?? 0;
  const bestDay = m?.days.reduce((best, d) => (d.approvedMeters > (best?.approvedMeters ?? 0) ? d : best), null as null | MemberRow['days'][number]) ?? null;
  const records = m?.days.flatMap((d) => d.records.map((r) => ({ ...r, date: d.date }))) ?? [];
  const backParam = `?week=${data.week.weekStart}&from=home`;
  const outcomeLabel = m ? (m.joinedThisWeek ? '준비 주간' : OUTCOME_LABEL[m.outcome]) : '';
  const outcomeKey: Outcome = m ? (m.joinedThisWeek ? 'not_evaluated' : m.outcome) : 'not_evaluated';

  return (
    <Modal open={Boolean(m)} onClose={onClose} title={m ? `${m.nickname} 이번 주 기록` : ''} bare>
      {m && (
        <div>
          {/* Hero */}
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-slate-900 px-5 pb-6 pt-5 text-white">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-emerald-300/20 blur-2xl" />
            <button type="button" onClick={onClose} aria-label="닫기" className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white/90 backdrop-blur hover:bg-white/20">×</button>
            <div className="relative flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="rounded-full bg-gradient-to-tr from-amber-300 via-white to-emerald-300 p-[3px] shadow-lg shadow-black/20">
                  <div className="rounded-full bg-slate-900 p-[2px]">
                    <Avatar src={m.avatarUrl ?? null} name={m.nickname} size={72} />
                  </div>
                </div>
                {m.rank != null && (
                  <span className="absolute -bottom-1 -right-1 flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-900 shadow ring-2 ring-slate-900">
                    {m.rank}위
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-bold leading-tight">
                  {m.nickname}
                  {isMe && <span className="ml-1.5 align-middle text-xs font-medium text-emerald-200">나</span>}
                </p>
                <p className="mt-0.5 text-xs text-emerald-100/80">{data.week.groupName} · {data.week.weekStart} 주</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${OUTCOME_STYLE[outcomeKey]}`}>{outcomeLabel}</span>
                  {(m.leftDuringWeek || !m.activeNow) && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200 ring-1 ring-white/20">탈퇴</span>}
                  {data.provisional && !m.joinedThisWeek && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200 ring-1 ring-white/20">잠정</span>}
                </div>
              </div>
            </div>

            {/* Total + progress */}
            <div className="relative mt-5">
              <div className="flex items-end justify-between">
                <p className="text-4xl font-extrabold tracking-tight">
                  {formatMeters(approved)}
                  <span className="ml-1 text-base font-medium text-emerald-100/80">km</span>
                </p>
                <p className="text-right text-xs text-emerald-100/80">
                  목표 {formatMeters(target)} km
                  <br />
                  <span className="font-semibold text-white">
                    {remaining > 0 ? `남은 ${formatMeters(remaining)} km` : over > 0 ? `+${formatMeters(over)} km 초과 달성` : '목표 달성'}
                  </span>
                </p>
              </div>
              <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${m.nickname} 진행률`}>
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-white transition-all" style={{ width: `${pct}%` }} />
                {pendingPct > 0 && <div className="h-full bg-amber-300/70" style={{ width: `${pendingPct}%` }} title="승인 대기" />}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-emerald-100/80">
                <span>{pct}%</span>
                {pending > 0 && <span>승인 대기 +{formatMeters(pending)} km</span>}
              </div>
            </div>
          </div>

          <div className="space-y-5 p-5">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <Stat label="달린 날" value={`${runDays}일`} />
              <Stat label="최고 기록" value={bestDay && bestDay.approvedMeters > 0 ? `${formatMeters(bestDay.approvedMeters)} km` : '-'} sub={bestDay && bestDay.approvedMeters > 0 ? DOW[m.days.indexOf(bestDay)] + '요일' : undefined} />
              <Stat label="기록 수" value={`${records.length}건`} sub={pending > 0 ? `대기 ${records.filter((r) => r.status === 'pending').length}건` : undefined} />
            </div>

            {/* Daily chart */}
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">요일별 거리</p>
              <div className="flex h-24 items-end gap-1.5">
                {m.days.map((d, i) => {
                  const total = d.approvedMeters + d.pendingMeters;
                  const h = total > 0 ? Math.max(6, Math.round((total / dayMax) * 100)) : 0;
                  const approvedH = total > 0 ? Math.round((d.approvedMeters / total) * 100) : 0;
                  const isToday = d.date === data.today;
                  return (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date} · ${formatMeters(total)} km`}>
                      <div className="flex w-full flex-1 items-end">
                        <div className="w-full overflow-hidden rounded-t-md rounded-b-sm bg-slate-100" style={{ height: `${h}%` }}>
                          {total > 0 && (
                            <div className="flex h-full w-full flex-col-reverse">
                              <div className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400" style={{ height: `${approvedH}%` }} />
                              <div className="w-full flex-1 bg-amber-300" />
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] ${isToday ? 'rounded-full bg-emerald-600 px-1.5 font-semibold text-white' : i >= 5 ? 'text-red-400' : 'text-slate-500'}`}>{DOW[i]}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Records */}
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">기록 목록</p>
              {records.length === 0 ? (
                <p className="rounded-xl bg-slate-50 py-6 text-center text-sm text-slate-400">아직 등록된 기록이 없어요</p>
              ) : (
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                  {records.map((r) => (
                    <li key={r.id}>
                      <Link href={`/records/${r.id}${backParam}`} onClick={onClose} className="flex min-h-12 items-center gap-3 px-3 py-2 hover:bg-slate-50">
                        <span className="w-14 shrink-0 text-xs text-slate-500">{r.date.slice(5).replace('-', '/')} <span className="text-slate-400">{DOW[m.days.findIndex((d) => d.date === r.date)]}</span></span>
                        <span className="flex-1 text-sm font-semibold text-slate-900">{formatMeters(r.meters)} km</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : r.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{STATUS_LABEL[r.status]}</span>
                        <span aria-hidden className="text-slate-300">›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-bold text-slate-900">{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}
