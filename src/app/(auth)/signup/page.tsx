import Link from 'next/link';
import { AuthShell } from '@/components/layout/AuthShell';
import { SignupForm } from './SignupForm';
import { safeReturnTo } from '@/lib/auth/return-to';

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const sp = await searchParams;
  const returnTo = safeReturnTo(typeof sp.returnTo === 'string' ? sp.returnTo : null);
  return (
    <AuthShell title="회원가입">
      <SignupForm returnTo={returnTo} />
      <p className="mt-6 text-center text-sm text-slate-600">
        이미 계정이 있나요? <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="underline">로그인</Link>
      </p>
    </AuthShell>
  );
}
