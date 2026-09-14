-- 0014_photo_retention.sql : evidence photo retention.
-- Photos exist to back weekly review. Once a week has been finalized for
-- PHOTO_RETENTION_WEEKS (default 8) the photos are purged from storage while the
-- record itself (distance, status, reviews, comments) is kept. This bounds the
-- Supabase Free storage usage regardless of how long the group runs.

alter table public.running_records add column if not exists photos_purged_at timestamptz;

-- Deletes record_photos rows for records in weeks finalized before app.now() - p_keep
-- and stamps the record. Returns the storage paths so the caller (service role)
-- can remove the objects. Service-role only.
create or replace function public.purge_expired_photos(p_keep interval default interval '8 weeks', p_limit int default 500)
returns setof text
language plpgsql security definer set search_path = public, app as $$
declare v_cutoff timestamptz := app.now() - p_keep;
begin
  return query
  with target as (
    select r.id from public.running_records r
    join public.group_weeks w on w.id = r.week_id
    where w.state = 'finalized' and w.finalized_at < v_cutoff and r.photos_purged_at is null
    order by w.finalized_at
    limit p_limit
  ), stamped as (
    update public.running_records r set photos_purged_at = app.now()
    from target t where r.id = t.id
  )
  delete from public.record_photos p using target t where p.record_id = t.id returning p.storage_path;
end $$;
revoke all on function public.purge_expired_photos(interval, int) from public, anon, authenticated;
