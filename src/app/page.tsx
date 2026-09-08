import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { getGroupState } from '@/lib/group-state';
import { NoGroupHome } from '@/components/group/NoGroupHome';
import { AppHeader } from '@/components/layout/AppHeader';

export default async function HomePage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  const state = await getGroupState(session.supabase);

  if (!state.membership) {
    return (
      <>
        <AppHeader title="우리들의 러닝일지" right={<HeaderLinks />} />
        <main className="mx-auto w-full max-w-md px-4 py-6"><NoGroupHome state={state} /></main>
      </>
    );
  }

  return (
    <>
      <AppHeader title={state.membership.groupName} right={<HeaderLinks admin={state.membership.role === 'admin'} />} />
      <main className="mx-auto w-full max-w-md px-4 py-6">대시보드 (단계 4에서 구현)</main>
    </>
  );
}

function HeaderLinks({ admin }: { admin?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {admin && <Link href="/admin" className="flex min-h-11 items-center rounded-full px-3 text-sm font-medium hover:bg-slate-100">관리</Link>}
      <Link href="/profile" aria-label="프로필" className="flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-slate-100">👤</Link>
    </div>
  );
}
