'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestJoin } from '@/actions/join';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export function JoinButton({ code }: { code: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button full loading={pending} onClick={() => start(async () => {
      const res = await requestJoin(code);
      if (res.error) { toast(res.error, 'error'); return; }
      toast('참여를 요청했습니다.');
      router.push('/');
    })}>참여 요청하기</Button>
  );
}
