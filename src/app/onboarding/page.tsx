import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { safeReturnTo } from '@/lib/auth/return-to';
import { OnboardingForm } from './OnboardingForm';

export default async function OnboardingPage({ searchParams }: PageProps<'/onboarding'>) {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const returnTo = safeReturnTo(typeof sp.returnTo === 'string' ? sp.returnTo : null);
  if (session.profile?.onboarding_completed_at) redirect(returnTo);
  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <h1 className="text-2xl font-bold">프로필 만들기</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">그룹에서 보일 닉네임과 사진을 등록하세요.</p>
      <OnboardingForm userId={session.user.id} returnTo={returnTo} initialNickname={session.profile?.nickname ?? ''} />
    </main>
  );
}
