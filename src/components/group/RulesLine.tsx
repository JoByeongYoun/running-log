import { formatMeters } from '@/lib/domain/distance';
import { formatWon } from '@/lib/domain/penalty';
import type { GroupRules } from '@/lib/group-state';

/** "열정 15km · 자유 5km · 미달 1km당 10,000원 · 0km 100,000원" + 선택 메모 */
export function RulesLine({ rules, className = '' }: { rules: GroupRules; className?: string }) {
  return (
    <div className={`text-sm text-slate-700 ${className}`}>
      <p>열정 {formatMeters(rules.targetMeters)}km · 자유 {formatMeters(rules.freeMinMeters)}km · 미달 1km당 {formatWon(rules.penaltyPerKmWon)} · 0km {formatWon(rules.zeroKmPenaltyWon)}</p>
      {rules.penalty && <p className="mt-0.5 text-xs text-slate-500">메모: {rules.penalty}</p>}
    </div>
  );
}
