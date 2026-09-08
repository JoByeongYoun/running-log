'use client';
import { useEffect } from 'react';
import { markRead } from '@/actions/notification';

export function MarkReadOnView({ ids }: { ids: string[] }) {
  useEffect(() => { if (ids.length) void markRead(ids); }, [ids]);
  return null;
}
