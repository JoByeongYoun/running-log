import { RunnerBadge } from '@/components/ui/RunnerBadge';
import { RUNNER_TYPE_LABEL, RUNNER_TYPE_DESC, type RunnerType } from '@/lib/domain/runner-type';

export function MyRunnerType({ groupName, type }: { groupName: string | null; type: RunnerType | null }) {
  if (!groupName || !type) return null;
  return (
    <section className="rounded-2xl border border-slate-200 p-4">
      <h3 className="mb-2 font-semibold">내 러너 유형</h3>
      <div className="flex items-center gap-3">
        <RunnerBadge type={type} size={40} />
        <div>
          <p className="font-semibold">{RUNNER_TYPE_LABEL[type]}</p>
          <p className="text-xs text-slate-500">{RUNNER_TYPE_DESC[type]}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">유형은 {groupName} 방장만 바꿀 수 있어요. 바꾸고 싶으면 방장에게 말해 주세요.</p>
    </section>
  );
}
