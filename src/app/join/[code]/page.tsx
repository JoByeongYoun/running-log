import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { getGroupState } from '@/lib/group-state';
import { formatMeters } from '@/lib/domain/distance';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card, ErrorState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { JoinButton } from './JoinButton';

export default async function JoinPage({ params }: PageProps<'/join/[code]'>) {
  const { code } = await params;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('lookup_invite', { p_code: code });
  const invite = data?.[0];
  const session = await getSessionUser();
  const returnTo = encodeURIComponent(`/join/${code}`);

  return (
    <>
      <AppHeader title="그룹 초대" back={session ? '/' : undefined} />
      <main className="mx-auto w-full max-w-md px-5 py-6">
        {error || !invite ? (
          <ErrorState title="초대 코드를 확인할 수 없습니다" description={error ? '잠시 후 다시 시도하세요.' : '코드가 잘못되었거나 새로 발급되었습니다.'} />
        ) : (
          <Card className="space-y-4">
            <div>
              <p className="text-sm text-slate-500">초대받은 그룹</p>
              <h2 className="text-xl font-bold">{invite.name}</h2>
            </div>
            <dl className="space-y-1 text-sm text-slate-700">
              <div className="flex justify-between"><dt>1인당 주간 목표</dt><dd>{formatMeters(invite.target_meters)} km</dd></div>
              <div className="flex justify-between gap-4"><dt className="shrink-0">실패 시 벌칙</dt><dd className="text-right">{invite.penalty}</dd></div>
            </dl>
            {invite.archived ? (
              <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm">보관된 그룹이라 참여할 수 없습니다.</p>
            ) : !session ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">참여하려면 로그인 또는 가입이 필요합니다.</p>
                <Link href={`/login?returnTo=${returnTo}`} className="block"><Button full>로그인</Button></Link>
                <Link href={`/signup?returnTo=${returnTo}`} className="block"><Button full variant="secondary">회원가입</Button></Link>
              </div>
            ) : !session.profile?.onboarding_completed_at ? (
              <Link href={`/onboarding?returnTo=${returnTo}`} className="block"><Button full>프로필 완성하고 계속</Button></Link>
            ) : (
              <JoinSection code={code} groupId={invite.group_id} />
            )}
          </Card>
        )}
      </main>
    </>
  );
}

async function JoinSection({ code, groupId }: { code: string; groupId: string }) {
  const supabase = await createServerSupabase();
  const state = await getGroupState(supabase);
  if (state.membership?.groupId === groupId) return <p className="text-sm">이미 이 그룹의 멤버입니다. <Link href="/" className="underline">홈으로</Link></p>;
  if (state.membership) return <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">이미 참여 중인 그룹이 있습니다. 한 번에 한 그룹에만 참여할 수 있습니다.</p>;
  if (state.pendingRequest?.groupId === groupId) return <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">이미 참여를 요청했습니다. 관리자 승인을 기다려 주세요.</p>;
  if (state.pendingRequest) return <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">다른 그룹에 대기 중인 요청이 있습니다. <Link href="/" className="underline">홈에서 취소</Link>한 뒤 다시 시도하세요.</p>;
  return <JoinButton code={code} />;
}
