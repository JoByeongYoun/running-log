'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatMeters } from '@/lib/domain/distance';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { OUTCOME_LABEL, STATUS_LABEL, type DayCell, type MemberRow, type WeekDashboard } from '@/lib/dashboard/types';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];

export function WeekCalendar({ data, myId }: { data: WeekDashboard; myId: string }) {
  const [open, setOpen] = useState<{ member: MemberRow; day: DayCell } | null>(null);
  const backParam = `?week=${data.week.weekStart}&from=home`;

  function openCell(member: MemberRow, day: DayCell, href: (id: string) => string, go: (href: string) => void) {
    if (day.records.length === 1) go(href(day.records[0].id));
    else if (day.records.length > 1) setOpen({ member, day });
  }

  return (
    <section className="rounded-2xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">멤버별 주간 기록</h2>
        {data.provisional && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{data.week.state === 'closing' ? '집계 중' : '잠정'}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] table-fixed border-separate border-spacing-y-1 text-xs">
          <thead>
            <tr className="text-slate-500">
              <th scope="col" className="sticky left-0 z-10 w-28 bg-white text-left font-normal">멤버</th>
              <th scope="col" className="sticky left-28 z-10 w-12 bg-white pr-1 text-right font-normal">합계</th>
              {DOW.map((d, i) => <th key={d} scope="col" className={`font-normal ${i >= 5 ? 'text-red-400' : ''}`}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.userId} className={m.userId === myId ? 'bg-emerald-50' : ''}>
                <th scope="row" className={`sticky left-0 z-10 rounded-l-lg py-1 pr-1 text-left font-normal ${m.userId === myId ? 'bg-emerald-50' : 'bg-white'}`}>
                  <div className="flex items-center gap-1">
                    <span className="w-4 shrink-0 text-right text-[11px] font-semibold text-slate-500">{m.rank ?? '-'}</span>
                    <Avatar src={m.avatarUrl ?? null} name={m.nickname} size={24} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.nickname}</p>
                      <p className="truncate text-[10px] text-slate-500">
                        {m.joinedThisWeek ? '준비 주간' : OUTCOME_LABEL[m.outcome]}
                        {(m.leftDuringWeek || !m.activeNow) && ' · 탈퇴'}
                      </p>
                    </div>
                  </div>
                </th>
                <td className={`sticky left-28 z-10 pr-1 text-right font-semibold ${m.userId === myId ? 'bg-emerald-50' : 'bg-white'}`}>
                  {formatMeters(m.approvedMeters)}
                  {m.pendingMeters > 0 && <span className="block text-[10px] font-normal text-amber-600" title="승인 대기">+{formatMeters(m.pendingMeters)}</span>}
                </td>
                {m.days.map((d) => {
                  const has = d.records.length > 0;
                  const single = d.records.length === 1 ? d.records[0] : null;
                  const inner = (
                    <>
                      {d.approvedMeters > 0 && <span className="block font-medium text-emerald-700">{formatMeters(d.approvedMeters)}</span>}
                      {d.pendingMeters > 0 && <span className="block text-amber-600">+{formatMeters(d.pendingMeters)}</span>}
                      {!d.approvedMeters && !d.pendingMeters && has && <span className="block text-slate-400">{STATUS_LABEL[d.records[0].status]}</span>}
                      {!has && <span className="text-slate-300">·</span>}
                    </>
                  );
                  return (
                    <td key={d.date} className="text-center align-top last:rounded-r-lg">
                      {single ? (
                        <Link href={`/records/${single.id}${backParam}`} className="block min-h-9 rounded-lg px-0.5 py-1 hover:bg-slate-100" aria-label={`${m.nickname} ${d.date} 기록`}>{inner}</Link>
                      ) : has ? (
                        <button type="button" onClick={() => openCell(m, d, (id) => `/records/${id}${backParam}`, () => {})} className="block min-h-9 w-full rounded-lg px-0.5 py-1 hover:bg-slate-100" aria-label={`${m.nickname} ${d.date} 기록 ${d.records.length}건`}>{inner}</button>
                      ) : (
                        <div className="min-h-9 py-1">{inner}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.members.length === 0 && <p className="py-4 text-center text-sm text-slate-500">이 주에는 멤버가 없습니다.</p>}
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `${open.member.nickname} · ${open.day.date}` : ''}>
        <ul className="divide-y divide-slate-200">
          {open?.day.records.map((r, i) => (
            <li key={r.id}>
              <Link href={`/records/${r.id}${backParam}`} className="flex min-h-11 items-center justify-between py-2" onClick={() => setOpen(null)}>
                <span>기록 {i + 1} · {formatMeters(r.meters)} km</span>
                <span className="text-xs text-slate-500">{STATUS_LABEL[r.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Modal>
    </section>
  );
}
