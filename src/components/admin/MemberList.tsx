'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { transferAdmin, regenerateInvite } from '@/actions/group';
import { setMemberRunnerType } from '@/actions/member';
import { RUNNER_TYPES, RUNNER_TYPE_LABEL, RUNNER_TYPE_DESC, type RunnerType } from '@/lib/domain/runner-type';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

export type MemberItem = { userId: string; nickname: string; avatarUrl: string | null; role: 'admin' | 'member'; joinedAt: string; runnerType: RunnerType };

type Action = { kind: 'transfer'; member: MemberItem } | { kind: 'type'; member: MemberItem; to: RunnerType };

export function MemberList({ groupId, members, myId, initialInvite, siteUrl }: { groupId: string; members: MemberItem[]; myId: string; initialInvite: string | null; siteUrl: string }) {
  const [invite, setInvite] = useState<string | null>(initialInvite);
  const [action, setAction] = useState<Action | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const link = invite ? `${siteUrl}/join/${invite}` : null;
  const counts = RUNNER_TYPES.map((t) => `${RUNNER_TYPE_LABEL[t].slice(0, 2)} ${members.filter((m) => m.runnerType === t).length}`).join(' · ');

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); } catch { toast('복사에 실패했습니다. 길게 눌러 복사하세요.', 'error'); }
  }

  function run(fn: () => Promise<{ error?: string }>, done: string, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (res.error) { toast(res.error, 'error'); return; }
      setAction(null); toast(done);
      if (after) after(); else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h3 className="font-semibold">초대</h3>
        {link ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">초대 코드</p>
            <p className="select-all rounded-xl bg-slate-100 px-3 py-2 font-mono text-lg tracking-wider">{invite}</p>
            <p className="select-all break-all rounded-xl bg-slate-100 px-3 py-2 text-sm">{link}</p>
            <div className="flex gap-2">
              <Button variant="secondary" full onClick={() => copy(invite!)}>코드 복사</Button>
              <Button variant="secondary" full onClick={() => copy(link)}>링크 복사</Button>
            </div>
            <p className="text-xs text-slate-500">이 화면을 벗어나면 코드는 다시 표시되지 않습니다. 필요하면 새로 발급하세요.</p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">초대 코드는 발급 시 한 번만 표시됩니다. 새 코드를 발급하면 이전 코드는 무효가 됩니다.</p>
        )}
        <Button variant={link ? 'ghost' : 'primary'} full loading={pending} onClick={() => start(async () => {
          const res = await regenerateInvite(groupId);
          if (res.error) toast(res.error, 'error'); else setInvite(res.code ?? null);
        })}>{link ? '새 코드 발급 (이전 코드 무효화)' : '초대 코드 발급'}</Button>
      </Card>
      <Card>
        <h3 className="mb-1 font-semibold">멤버 {members.length}명 <span className="ml-1 text-sm font-normal text-slate-500">· {counts}</span></h3>
        <p className="mb-2 text-xs text-slate-500">뱃지는 방장만 바꿀 수 있습니다. 바꾸면 진행 중인 주의 평가부터 적용됩니다.</p>
        <ul className="divide-y divide-slate-200">
          {members.map((m) => (
            <li key={m.userId} className="py-3">
              <div className="flex items-center gap-3">
                <Avatar src={m.avatarUrl} name={m.nickname} badge={m.runnerType} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.nickname}
                    {m.role === 'admin' && <span className="ml-1 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">관리자</span>}
                  </p>
                  <p className="text-xs text-slate-500">참여 {new Date(m.joinedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
                </div>
                {m.userId !== myId && <Button variant="ghost" onClick={() => setAction({ kind: 'transfer', member: m })}>권한 위임</Button>}
              </div>
              <div role="radiogroup" aria-label={`${m.nickname} 러너 유형`} className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                {RUNNER_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={m.runnerType === t}
                    disabled={pending}
                    onClick={() => m.runnerType !== t && setAction({ kind: 'type', member: m, to: t })}
                    className={`min-h-9 rounded-lg text-xs font-semibold transition ${m.runnerType === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    {RUNNER_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Modal open={action?.kind === 'transfer'} onClose={() => setAction(null)} title="관리자 권한 위임">
        <p className="text-sm text-slate-700"><b>{action?.member.nickname}</b>에게 관리자 권한을 넘깁니다. 위임 후에는 참여 요청·기록 검토·설정 변경을 할 수 없습니다.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" full onClick={() => setAction(null)}>취소</Button>
          <Button full loading={pending} onClick={() => action && run(() => transferAdmin(groupId, action.member.userId), '권한을 위임했습니다.', () => router.push('/'))}>위임</Button>
        </div>
      </Modal>

      <Modal open={action?.kind === 'type'} onClose={() => setAction(null)} title="러너 유형 변경">
        {action?.kind === 'type' && (
          <>
            <p className="text-sm text-slate-700"><b>{action.member.nickname}</b>을(를) <b>{RUNNER_TYPE_LABEL[action.to]}</b>로 바꿉니다.</p>
            <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{RUNNER_TYPE_DESC[action.to]}</p>
            <p className="mt-2 text-xs text-slate-500">진행 중인 주의 평가부터 적용됩니다. 이미 마감 집계 중이거나 확정된 주는 바뀌지 않습니다.</p>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" full onClick={() => setAction(null)}>취소</Button>
              <Button full loading={pending} onClick={() => run(() => setMemberRunnerType(groupId, action.member.userId, action.to), `${RUNNER_TYPE_LABEL[action.to]}로 바꿨습니다.`)}>변경</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
