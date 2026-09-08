import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { getGroupState } from '@/lib/group-state';
import { signedUrls } from '@/lib/storage/signed-url';
import { formatMeters } from '@/lib/domain/distance';
import { kstDateOf, isValidYmd, mondayOf } from '@/lib/domain/week';
import { AppHeader } from '@/components/layout/AppHeader';
import { Avatar } from '@/components/ui/Avatar';
import { STATUS_LABEL } from '@/lib/dashboard/types';
import { PhotoGallery } from '@/components/record/PhotoGallery';
import { CommentList } from '@/components/record/CommentList';
import { RecordOwnerActions } from '@/components/record/RecordOwnerActions';
import { ReviewActions } from '@/components/admin/ReviewActions';

export default async function RecordPage({ params, searchParams }: PageProps<'/records/[id]'>) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await getSessionUser();
  if (!session) redirect('/login');
  const supabase = session.supabase;
  const state = await getGroupState(supabase);
  if (!state.membership) redirect('/');

  const { data: rec } = await supabase
    .from('running_records')
    .select('id, user_id, activity_date, distance_meters, memo, status, version, created_at, updated_at, group_weeks(week_start, state), profiles!running_records_user_id_fkey(nickname, avatar_path), record_photos(id, storage_path, order_index), record_reviews(id, to_status, reason, created_at, actor_id)')
    .eq('id', id)
    .maybeSingle();
  if (!rec) notFound();

  const back = typeof sp.week === 'string' && isValidYmd(sp.week) && sp.from === 'home' ? `/?week=${mondayOf(sp.week)}` : '/';
  const photos = [...rec.record_photos].sort((a, b) => a.order_index - b.order_index);
  const [photoUrls, avatarUrls] = await Promise.all([
    signedUrls('evidence', photos.map((p) => p.storage_path)),
    signedUrls('avatars', rec.profiles?.avatar_path ? [rec.profiles.avatar_path] : []),
  ]);
  const reviews = [...rec.record_reviews].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = reviews[reviews.length - 1];
  const isOwner = rec.user_id === session.user.id;
  const isAdmin = state.membership.role === 'admin';
  const today = kstDateOf(new Date());
  const canEdit = isOwner && (rec.status === 'pending' || rec.status === 'rejected') && rec.activity_date === today && rec.group_weeks?.state === 'open';
  const weekFinal = rec.group_weeks?.state === 'finalized';

  const { data: comments } = await supabase
    .from('comments').select('id, user_id, body, created_at, deleted_at, profiles!comments_user_id_fkey(nickname, avatar_path)')
    .eq('record_id', id).is('deleted_at', null).order('created_at');
  const commentAvatars = await signedUrls('avatars', (comments ?? []).map((c) => c.profiles?.avatar_path).filter((p): p is string => Boolean(p)));

  const statusTone = { pending: 'bg-amber-100 text-amber-800', approved: 'bg-emerald-100 text-emerald-800', rejected: 'bg-red-100 text-red-700', expired: 'bg-slate-200 text-slate-600' }[rec.status];

  return (
    <>
      <AppHeader title="기록 상세" back={back} />
      <main className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
        <section className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <Avatar src={rec.profiles?.avatar_path ? avatarUrls.get(rec.profiles.avatar_path) ?? null : null} name={rec.profiles?.nickname ?? ''} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{rec.profiles?.nickname ?? '(이름 없음)'}</p>
              <p className="text-xs text-slate-500">{rec.activity_date}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone}`}>{STATUS_LABEL[rec.status]}</span>
          </div>
          <p className="mt-3 text-3xl font-bold">{formatMeters(rec.distance_meters)} <span className="text-base font-normal text-slate-500">km</span></p>
          {rec.memo && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{rec.memo}</p>}
          {rec.status === 'rejected' && last?.reason && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">반려 사유: {last.reason}</p>}
          {rec.status === 'pending' && last?.to_status === 'pending' && reviews.some((r) => r.to_status === 'approved') && last.reason && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">승인 취소됨: {last.reason}</p>
          )}
          {rec.status === 'expired' && <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600">검토 기한(월요일 12:00)이 지나 합계에 포함되지 않았습니다.</p>}
          {rec.status === 'pending' && rec.version > 1 && <p className="mt-2 text-xs text-slate-500">수정된 기록입니다 (v{rec.version}).</p>}
        </section>

        <PhotoGallery photos={photos.map((p) => ({ id: p.id, url: photoUrls.get(p.storage_path) ?? '' }))} />

        {canEdit && (
          <RecordOwnerActions
            record={{ id: rec.id, distance: formatMeters(rec.distance_meters), memo: rec.memo ?? '', version: rec.version, status: rec.status }}
            photos={photos.map((p) => ({ id: p.id, url: photoUrls.get(p.storage_path) ?? '' }))}
          />
        )}
        {isAdmin && !weekFinal && (rec.status === 'pending' || rec.status === 'approved') && (
          <ReviewActions recordId={rec.id} status={rec.status} version={rec.version} />
        )}

        <CommentList
          recordId={rec.id}
          myId={session.user.id}
          isAdmin={isAdmin}
          comments={(comments ?? []).map((c) => ({
            id: c.id, userId: c.user_id, body: c.body, createdAt: c.created_at,
            nickname: c.profiles?.nickname ?? '(이름 없음)',
            avatarUrl: c.profiles?.avatar_path ? commentAvatars.get(c.profiles.avatar_path) ?? null : null,
          }))}
        />
        <p className="pb-6 text-center"><Link href={back} className="text-sm underline">메인으로</Link></p>
      </main>
    </>
  );
}
