'use client';
import { Button } from '@/components/ui/Button';

export function OfflineRetry() {
  return <Button className="mt-6" onClick={() => { window.location.href = '/'; }}>다시 시도</Button>;
}
