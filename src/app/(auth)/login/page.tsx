import Link from 'next/link';
import { AuthShell } from '@/components/layout/AuthShell';
import { LoginForm } from './LoginForm';
import { safeReturnTo } from '@/lib/auth/return-to';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams;
  const returnTo = safeReturnTo(typeof sp.returnTo === 'string' ? sp.returnTo : null);
  const linkError = sp.error === 'link';
  return (
    <AuthShell title="로그인">
      {linkError && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">링크가 만료되었거나 올바르지 않습니다.</p>}
      <LoginForm returnTo={returnTo} />
      <div className="mt-6 flex justify-between text-sm text-slate-600">
        <Link href={`/signup?returnTo=${encodeURIComponent(returnTo)}`} className="underline">회원가입</Link>
        <Link href="/forgot-password" className="underline">비밀번호를 잊으셨나요?</Link>
      </div>
    </AuthShell>
  );
}
