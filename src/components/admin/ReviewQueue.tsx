import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { signedUrls } from '@/lib/storage/signed-url';
import { formatMeters } from '@/lib/domain/distance';
import { EmptyState } from '@/components/ui/States';
import { Avatar } from '@/components/ui/Avatar';
import { ReviewActions } from './ReviewActions';
import { ReviewThumbs } from './ReviewThumbs';

export async function ReviewQueue({ groupId }: { groupId: string }) {
  const supabase = await createServerSupabase();
  const { data: recs } = await supabase
    .from('running_records')
    .select('id, user_id, activity_date, distance_meters, memo, version, created_at, profiles!running_records_user_id_fkey(nickname, avatar_path), record_photos(id, storage_path, order_index), group_weeks(week_start, state)')
    .eq('group_id', groupId).eq('status', 'pending').order('created_at');
  if (!recs || recs.length === 0) return <EmptyState title="검토할 기록이 없습니다" />;
  const [photoUrls, avatarUrls] = await Promise.all([
    signedUrls('evidence', recs.flatMap((r) => r.record_photos.map((p) => p.storage_path))),
    signedUrls('avatars', recs.map((r) => r.profiles?.avatar_path).filter((p): p is string => Boolean(p))),
  ]);
  return (
    <ul className="space-y-3">
      {recs.map((r) => (
        <li key={r.id} className="rounded-2xl border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <Avatar src={r.profiles?.avatar_path ? avatarUrls.get(r.profiles.avatar_path) ?? null : null} name={r.profiles?.nickname ?? ''} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.profiles?.nickname ?? '(이름 없음)'} · {formatMeters(r.distance_meters)} km</p>
              <p className="text-xs text-slate-500">{r.activity_date}{r.group_weeks?.state === 'closing' ? ' · 지난주 (12:00 마감)' : ''}{r.version > 1 ? ` · 수정본 v${r.version}` : ''}</p>
            </div>
            <Link href={`/records/${r.id}`} className="text-xs underline">상세</Link>
          </div>
          {r.memo && <p className="mt-2 line-clamp-2 text-xs text-slate-600">{r.memo}</p>}
          <ReviewThumbs photos={[...r.record_photos].sort((a, b) => a.order_index - b.order_index).map((p) => ({ id: p.id, url: photoUrls.get(p.storage_path) ?? '' }))} />
          <div className="mt-2">
            <ReviewActions recordId={r.id} status="pending" version={r.version} compact />
          </div>
        </li>
      ))}
    </ul>
  );
}
