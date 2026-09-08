-- 0004_records.sql : evidence uploads, record submission/edit/delete, admin review, comments

-- placeholder; replaced in 0006_weeks.sql with the real early-finalize logic
create or replace function app.after_review_check_week(p_week_id uuid) returns void
language plpgsql as $$ begin return; end $$;

create or replace function app.my_active_group() returns uuid
language plpgsql stable security definer set search_path = public, app as $$
declare gid uuid;
begin
  select group_id into gid from public.memberships where user_id = auth.uid() and left_at is null;
  if gid is null then perform app.fail('not_member'); end if;
  return gid;
end $$;

-- ---------------------------------------------------------------------------
-- Uploads
-- ---------------------------------------------------------------------------
create or replace function public.create_upload_slot(p_content_type text, p_byte_size int)
returns table (upload_id uuid, storage_path text)
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_profile(); gid uuid := app.my_active_group(); v_id uuid := gen_random_uuid(); v_path text;
begin
  perform app.rate_limit('upload:' || uid::text, 60, interval '1 minute');
  if p_content_type not in ('image/jpeg', 'image/png', 'image/webp') then perform app.fail('invalid_content_type'); end if;
  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760 then perform app.fail('file_too_large'); end if;
  if exists (select 1 from public.groups where id = gid and archived_at is not null) then perform app.fail('group_archived'); end if;
  v_path := gid::text || '/' || uid::text || '/' || v_id::text || case p_content_type when 'image/png' then '.png' when 'image/webp' then '.webp' else '.jpg' end;
  insert into public.pending_uploads (id, user_id, group_id, storage_path, byte_size, content_type, expires_at)
  values (v_id, uid, gid, v_path, p_byte_size, p_content_type, app.now() + interval '1 hour');
  upload_id := v_id; storage_path := v_path;
  return next;
end $$;

create or replace function public.mark_upload_ready(p_upload_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_user(); u public.pending_uploads%rowtype; v_size bigint;
begin
  select * into u from public.pending_uploads where id = p_upload_id and user_id = uid for update;
  if u.id is null then perform app.fail('upload_not_owned'); end if;
  select (metadata ->> 'size')::bigint into v_size from storage.objects where bucket_id = 'evidence' and name = u.storage_path;
  if v_size is null then perform app.fail('upload_missing'); end if;
  if v_size > 10485760 then perform app.fail('file_too_large'); end if;
  update public.pending_uploads set ready = true, byte_size = least(v_size, 10485760)::int where id = u.id;
end $$;

-- paths returned so the caller (service role) can remove orphaned objects
create or replace function public.cleanup_expired_uploads() returns setof text
language plpgsql security definer set search_path = public, app as $$
begin
  return query delete from public.pending_uploads where expires_at < app.now() returning storage_path;
end $$;
revoke all on function public.cleanup_expired_uploads() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Records
-- ---------------------------------------------------------------------------
create or replace function app.attach_uploads(p_record_id uuid, p_uid uuid, p_gid uuid, p_upload_ids uuid[], p_start_index int) returns void
language plpgsql security definer set search_path = public, app as $$
declare i int; u public.pending_uploads%rowtype;
begin
  for i in 1 .. coalesce(array_length(p_upload_ids, 1), 0) loop
    select * into u from public.pending_uploads where id = p_upload_ids[i] for update;
    if u.id is null or u.user_id <> p_uid or u.group_id <> p_gid then perform app.fail('upload_not_owned'); end if;
    if not u.ready then perform app.fail('upload_not_ready'); end if;
    if u.expires_at < app.now() then perform app.fail('upload_expired'); end if;
    if not exists (select 1 from storage.objects where bucket_id = 'evidence' and name = u.storage_path) then perform app.fail('upload_missing'); end if;
    insert into public.record_photos (record_id, storage_path, order_index) values (p_record_id, u.storage_path, p_start_index + i - 1);
    delete from public.pending_uploads where id = u.id;
  end loop;
end $$;

create or replace function public.submit_record(p_submission_key text, p_distance_meters int, p_memo text, p_upload_ids uuid[], p_client_date date default null)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_profile();
  gid uuid;
  v_id uuid;
  v_today date := app.kst_today();
  v_week_start date := app.week_start_of(app.now());
  v_week uuid;
  v_state public.week_state;
  v_admin uuid;
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
begin
  if p_submission_key is null or char_length(p_submission_key) not between 8 and 64 then perform app.fail('invalid_input'); end if;
  perform pg_advisory_xact_lock(hashtext('submit:' || uid::text || ':' || p_submission_key));
  select id into v_id from public.running_records where user_id = uid and submission_key = p_submission_key;
  if v_id is not null then return v_id; end if;

  gid := app.my_active_group();
  if exists (select 1 from public.groups where id = gid and archived_at is not null) then perform app.fail('group_archived'); end if;
  if p_client_date is not null and p_client_date <> v_today then perform app.fail('date_changed'); end if;
  if p_distance_meters is null or p_distance_meters not between 1 and 500000 then perform app.fail('invalid_input'); end if;
  if v_memo is not null and char_length(v_memo) > 1000 then perform app.fail('invalid_input'); end if;
  if coalesce(array_length(p_upload_ids, 1), 0) < 1 then perform app.fail('photos_required'); end if;
  if array_length(p_upload_ids, 1) > 5 then perform app.fail('too_many_photos'); end if;
  perform app.rate_limit('record:' || uid::text, 30, interval '1 minute');

  v_week := app.ensure_group_week(gid, v_week_start);
  select state into v_state from public.group_weeks where id = v_week for update;
  if v_state <> 'open' then perform app.fail('week_not_open'); end if;

  insert into public.running_records (group_id, user_id, week_id, activity_date, distance_meters, memo, status, submission_key, created_at, updated_at)
  values (gid, uid, v_week, v_today, p_distance_meters, v_memo, 'pending', p_submission_key, app.now(), app.now())
  returning id into v_id;
  perform app.attach_uploads(v_id, uid, gid, p_upload_ids, 0);
  insert into public.record_reviews (record_id, actor_id, from_status, to_status, created_at) values (v_id, uid, null, 'pending', app.now());

  v_admin := app.group_admin_id(gid);
  if v_admin is not null and v_admin <> uid then
    perform app.notify(v_admin, gid, 'record_submitted:' || v_id::text, 'record_submitted', v_id);
  end if;
  return v_id;
end $$;

create or replace function app.editable_record(p_record_id uuid, p_uid uuid) returns public.running_records
language plpgsql security definer set search_path = public, app as $$
declare r public.running_records%rowtype; v_state public.week_state;
begin
  select * into r from public.running_records where id = p_record_id for update;
  if r.id is null then perform app.fail('not_found'); end if;
  if r.user_id <> p_uid then perform app.fail('forbidden'); end if;
  if r.status not in ('pending', 'rejected') then perform app.fail('invalid_status'); end if;
  select state into v_state from public.group_weeks where id = r.week_id;
  if r.activity_date <> app.kst_today() or v_state <> 'open' then perform app.fail('edit_window_closed'); end if;
  return r;
end $$;

-- returns storage paths removed so the caller can delete objects
create or replace function public.update_record(p_record_id uuid, p_distance_meters int, p_memo text, p_keep_photo_ids uuid[], p_upload_ids uuid[], p_expected_version int)
returns setof text
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_profile();
  r public.running_records;
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
  v_keep int := coalesce(array_length(p_keep_photo_ids, 1), 0);
  v_new int := coalesce(array_length(p_upload_ids, 1), 0);
  removed text[];
  i int; pid uuid;
begin
  r := app.editable_record(p_record_id, uid);
  if r.version <> p_expected_version then perform app.fail('stale_version'); end if;
  if p_distance_meters is null or p_distance_meters not between 1 and 500000 then perform app.fail('invalid_input'); end if;
  if v_memo is not null and char_length(v_memo) > 1000 then perform app.fail('invalid_input'); end if;
  if v_keep + v_new < 1 then perform app.fail('photos_required'); end if;
  if v_keep + v_new > 5 then perform app.fail('too_many_photos'); end if;
  if v_keep > 0 and exists (select 1 from unnest(p_keep_photo_ids) k where not exists (select 1 from public.record_photos p where p.id = k and p.record_id = r.id)) then
    perform app.fail('invalid_input');
  end if;

  select coalesce(array_agg(storage_path), '{}') into removed from public.record_photos where record_id = r.id and not (id = any (coalesce(p_keep_photo_ids, '{}')));
  delete from public.record_photos where record_id = r.id and not (id = any (coalesce(p_keep_photo_ids, '{}')));
  -- renumber kept photos in given order (temporarily offset to avoid unique clash)
  update public.record_photos set order_index = order_index + 1000 where record_id = r.id;
  for i in 1 .. v_keep loop
    pid := p_keep_photo_ids[i];
    update public.record_photos set order_index = i - 1 where id = pid;
  end loop;
  perform app.attach_uploads(r.id, uid, r.group_id, p_upload_ids, v_keep);

  update public.running_records set distance_meters = p_distance_meters, memo = v_memo, status = 'pending', version = version + 1, updated_at = app.now()
  where id = r.id;
  insert into public.record_reviews (record_id, actor_id, from_status, to_status, created_at) values (r.id, uid, r.status, 'pending', app.now());
  return query select unnest(removed);
end $$;

create or replace function public.delete_record(p_record_id uuid) returns setof text
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_user(); r public.running_records; removed text[];
begin
  r := app.editable_record(p_record_id, uid);
  select coalesce(array_agg(storage_path), '{}') into removed from public.record_photos where record_id = r.id;
  delete from public.running_records where id = r.id;
  return query select unnest(removed);
end $$;

-- ---------------------------------------------------------------------------
-- Admin review
-- ---------------------------------------------------------------------------
create or replace function public.review_record(p_record_id uuid, p_action text, p_reason text, p_expected_version int) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_user();
  r public.running_records%rowtype;
  w public.group_weeks%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_to public.record_status;
begin
  select * into r from public.running_records where id = p_record_id for update;
  if r.id is null then perform app.fail('not_found'); end if;
  if not app.is_group_admin(r.group_id) then perform app.fail('forbidden'); end if;
  select * into w from public.group_weeks where id = r.week_id for update;
  if w.state = 'finalized' then perform app.fail('week_finalized'); end if;
  if w.state = 'closing' and app.now() >= app.week_close_deadline(w.week_start) then perform app.fail('review_closed'); end if;
  if r.version <> p_expected_version then perform app.fail('stale_version'); end if;

  if p_action = 'approve' then
    if r.status <> 'pending' then perform app.fail('invalid_status'); end if;
    v_to := 'approved';
  elsif p_action = 'reject' then
    if r.status <> 'pending' then perform app.fail('invalid_status'); end if;
    if v_reason is null then perform app.fail('reason_required'); end if;
    v_to := 'rejected';
  elsif p_action = 'unapprove' then
    if r.status <> 'approved' then perform app.fail('invalid_status'); end if;
    if v_reason is null then perform app.fail('reason_required'); end if;
    v_to := 'pending';
  else
    perform app.fail('invalid_input');
  end if;

  update public.running_records set status = v_to, updated_at = app.now() where id = r.id;
  insert into public.record_reviews (record_id, actor_id, from_status, to_status, reason, created_at) values (r.id, uid, r.status, v_to, v_reason, app.now());
  if r.user_id <> uid then
    perform app.notify(r.user_id, r.group_id, 'record_review:' || r.id::text || ':' || r.version::text || ':' || v_to::text || ':' || extract(epoch from app.now())::bigint::text, 'record_review', r.id);
  end if;
  perform app.after_review_check_week(r.week_id);
end $$;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
create or replace function public.add_comment(p_record_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_profile(); gid uuid; v_body text := btrim(coalesce(p_body, '')); v_id uuid;
begin
  select group_id into gid from public.running_records where id = p_record_id;
  if gid is null then perform app.fail('not_found'); end if;
  if not app.is_active_member(gid) then perform app.fail('forbidden'); end if;
  if char_length(v_body) not between 1 and 1000 then perform app.fail('invalid_input'); end if;
  perform app.rate_limit('comment:' || uid::text, 30, interval '1 minute');
  insert into public.comments (record_id, user_id, body, created_at) values (p_record_id, uid, v_body, app.now()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_comment(p_comment_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_user(); c public.comments%rowtype; gid uuid;
begin
  select * into c from public.comments where id = p_comment_id for update;
  if c.id is null then perform app.fail('not_found'); end if;
  select group_id into gid from public.running_records where id = c.record_id;
  if c.user_id <> uid and not app.is_group_admin(gid) then perform app.fail('forbidden'); end if;
  if c.deleted_at is not null then return; end if;
  update public.comments set deleted_at = app.now(), deleted_by = uid, body = '' where id = c.id;
end $$;

grant execute on function public.create_upload_slot(text, int), public.mark_upload_ready(uuid),
  public.submit_record(text, int, text, uuid[], date), public.update_record(uuid, int, text, uuid[], uuid[], int),
  public.delete_record(uuid), public.review_record(uuid, text, text, int), public.add_comment(uuid, text), public.delete_comment(uuid)
  to authenticated;
