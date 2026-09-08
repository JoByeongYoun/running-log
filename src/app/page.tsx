import { getSessionUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  return <main className="p-5">대시보드 (구현 예정)</main>;
}
