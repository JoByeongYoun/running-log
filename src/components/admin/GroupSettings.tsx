'use client';
import { useActionState } from 'react';
import { renameGroup, scheduleSettings, setGroupNotice } from '@/actions/group';
import type { ActionState } from '@/actions/auth';
import { Input, Textarea } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormMessage } from '@/components/ui/FormMessage';
import { Card } from '@/components/ui/States';
import { formatMeters } from '@/lib/domain/distance';
import { formatWon } from '@/lib/domain/penalty';

type Rules = { targetMeters: number; penalty: string | null; freeMinMeters: number; penaltyPerKmWon: number; zeroKmPenaltyWon: number; weekStart: string };
type Props = { groupId: string; name: string; current: Rules; scheduled: Rules | null; notice: string | null };

export function GroupSettings({ groupId, name, current, scheduled, notice }: Props) {
  const [noticeState, noticeAction] = useActionState<ActionState, FormData>(setGroupNotice, {});
  const [nameState, nameAction] = useActionState<ActionState, FormData>(renameGroup, {});
  const [setState, setAction] = useActionState<ActionState, FormData>(scheduleSettings, {});
  const base = scheduled ?? current;
  return (
    <div className="space-y-4">
      <Card>
        <form action={nameAction} className="space-y-3">
          <input type="hidden" name="groupId" value={groupId} />
          <Input label="그룹명" name="name" defaultValue={name} required minLength={2} maxLength={30} hint="즉시 변경됩니다. 확정된 과거 결과의 그룹명은 바뀌지 않습니다." />
          <FormMessage error={nameState.error} success={nameState.success} />
          <SubmitButton variant="secondary" full>그룹명 변경</SubmitButton>
        </form>
      </Card>
      <Card>
        <form action={noticeAction} className="space-y-3">
          <input type="hidden" name="groupId" value={groupId} />
          <h3 className="font-semibold">공지사항</h3>
          <Textarea label="기록 등록 화면에 표시할 공지" name="notice" defaultValue={notice ?? ''} maxLength={500} rows={3} placeholder="예: 사진은 러닝 앱 기록 화면 캡처로 올려주세요." hint="멤버가 기록을 올릴 때 폼 위에 표시됩니다. 비우고 저장하면 공지가 사라집니다." />
          <FormMessage error={noticeState.error} success={noticeState.success} />
          <SubmitButton full>공지 저장</SubmitButton>
        </form>
      </Card>
      <Card className="space-y-3">
        <h3 className="font-semibold">목표·벌금 규칙</h3>
        <RulesSummary title="이번 주" r={current} />
        {scheduled && (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p className="mb-1 font-semibold">{scheduled.weekStart}부터 적용 예정</p>
            <RulesSummary r={scheduled} compact />
          </div>
        )}
        <form action={setAction} className="space-y-3">
          <input type="hidden" name="groupId" value={groupId} />
          <Input label="열정러너 주간 목표 (km)" name="target" inputMode="decimal" required defaultValue={formatMeters(base.targetMeters)} hint="0.01 ~ 1,000km" />
          <Input label="자유러너 주간 최소 거리 (km)" name="freeMin" inputMode="decimal" required defaultValue={formatMeters(base.freeMinMeters)} hint="0.01 ~ 1,000km" />
          <Input label="미달 1km당 벌금 (원)" name="perKmWon" inputMode="numeric" required defaultValue={base.penaltyPerKmWon.toLocaleString('ko-KR')} hint="미달 거리는 1km 단위로 올림" />
          <Input label="0km 벌금 (원)" name="zeroWon" inputMode="numeric" required defaultValue={base.zeroKmPenaltyWon.toLocaleString('ko-KR')} hint="한 번도 안 달리면 km당 벌금 대신 이 금액" />
          <Textarea label="벌칙 메모 (선택)" name="penalty" maxLength={500} rows={2} defaultValue={base.penalty ?? ''} placeholder="예: 정산은 일요일 밤, 계좌는 공지 참고" />
          <p className="text-xs text-slate-500">변경은 다음 주 월요일부터 적용됩니다. 같은 주에 다시 저장하면 예약을 대체합니다.</p>
          <FormMessage error={setState.error} success={setState.success} />
          <SubmitButton full>다음 주부터 적용</SubmitButton>
        </form>
      </Card>
    </div>
  );
}

function RulesSummary({ r, title, compact = false }: { r: Rules; title?: string; compact?: boolean }) {
  const row = (k: string, v: string) => <div key={k} className="flex justify-between gap-4"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="text-right">{v}</dd></div>;
  return (
    <dl className={compact ? 'space-y-0.5 text-xs' : 'space-y-0.5 rounded-xl bg-slate-50 p-3 text-sm'}>
      {title && <p className="mb-1 text-xs font-semibold text-slate-500">{title}</p>}
      {row('열정 목표', `${formatMeters(r.targetMeters)} km`)}
      {row('자유 최소', `${formatMeters(r.freeMinMeters)} km`)}
      {row('1km당', formatWon(r.penaltyPerKmWon))}
      {row('0km', formatWon(r.zeroKmPenaltyWon))}
      {r.penalty && row('메모', r.penalty)}
    </dl>
  );
}
