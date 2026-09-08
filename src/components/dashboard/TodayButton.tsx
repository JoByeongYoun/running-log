'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export function TodayButton({ isCurrent }: { isCurrent: boolean }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <Button variant="secondary" onClick={() => {
      if (isCurrent) { document.getElementById('today')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      toast('오늘 기록은 이번 주에 등록됩니다');
      router.push('/#today');
    }}>오늘 기록 올리기</Button>
  );
}
