'use client';
import { useActionState } from 'react';
import { renameGroup, scheduleSettings } from '@/actions/group';
import type { ActionState } from '@/actions/auth';
import { Input, Textarea } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormMessage } from '@/components/ui/FormMessage';
import { Card } from '@/components/ui/States';
import { formatMeters } from '@/lib/domain/distance';

type Props = {
  groupId: string; name: string;
  current: { targetMeters: number; penalty: string; weekStart: string };
  scheduled: { targetMeters: number; penalty: string; weekStart: string } | null;
};

export function GroupSettings({ groupId, name, current, scheduled }: Props) {
  const [nameState, nameAction] = useActionState<ActionState, FormData>(renameGroup, {});
  const [setState, setAction] = useActionState<ActionState, FormData>(scheduleSettings, {});
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
      <Card className="space-y-3">
        <h3 className="font-semibold">목표·벌칙</h3>
        <dl className="rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">이번 주 목표</dt><dd>{formatMeters(current.targetMeters)} km</dd></div>
          <div className="flex justify-between gap-4"><dt className="shrink-0 text-slate-500">이번 주 벌칙</dt><dd className="text-right">{current.penalty}</dd></div>
        </dl>
        {scheduled && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {scheduled.weekStart}부터 목표 {formatMeters(scheduled.targetMeters)} km, 벌칙 “{scheduled.penalty}” 적용 예정
          </p>
        )}
        <form action={setAction} className="space-y-3">
          <input type="hidden" name="groupId" value={groupId} />
          <Input label="다음 주 목표 거리 (km)" name="target" inputMode="decimal" required defaultValue={formatMeters(scheduled?.targetMeters ?? current.targetMeters)} hint="0.01 ~ 1,000km" />
          <Textarea label="다음 주 벌칙" name="penalty" required maxLength={500} rows={3} defaultValue={scheduled?.penalty ?? current.penalty} />
          <p className="text-xs text-slate-500">변경은 다음 주 월요일부터 적용됩니다. 같은 주에 다시 저장하면 예약을 대체합니다.</p>
          <FormMessage error={setState.error} success={setState.success} />
          <SubmitButton full>다음 주부터 적용</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
