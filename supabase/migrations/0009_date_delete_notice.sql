-- 0009_date_delete_notice.sql : 기록 날짜 선택(이번 주 월요일~오늘), 진행 중 주차 내 수정·삭제, 관리자 삭제, 그룹 공지사항

-- ---------------------------------------------------------------------------
-- Group notice (shown above the record form)
-- ---------------------------------------------------------------------------
alter table public.groups add column if not exists notice text check (char_length(notice) <= 500);
alter table public.groups add column if not exists notice_updated_at timestamptz;

create or replace function public.set_group_notice(p_group_id uuid, p_notice text) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_notice text := nullif(btrim(coalesce(p_notice, '')), '');
begin
  perform app.require_user();
  if not app.is_group_admin(p_group_id) then perform app.fail('forbidden'); end if;
  if v_notice is not null and char_length(v_notice) > 500 then perform app.fail('invalid_input'); end if;
  update public.groups set notice = v_notice, notice_updated_at = case when v_notice is null then null else app.now() end where id = p_group_id;
end $$;
grant execute on function public.set_group_notice(uuid, text) to authenticated;

create or replace function public.get_my_group_state() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare uid uuid := auth.uid(); res jsonb;
begin
  if uid is null then return null; end if;
  select jsonb_build_object(
    'membership', (select jsonb_build_object('groupId', m.group_id, 'role', m.role, 'groupName', g.name, 'archived', g.archived_at is not null, 'notice', g.notice, 'noticeUpdatedAt', g.notice_updated_at)
                   from public.memberships m join public.groups g on g.id = m.group_id where m.user_id = uid and m.left_at is null),
    'pendingRequest', (select jsonb_build_object('id', j.id, 'groupId', j.group_id, 'groupName', g.name, 'targetMeters', s.target_meters, 'penalty', s.penalty)
                       from public.join_requests j join public.groups g on g.id = j.group_id
                       join lateral (select gs.target_meters, gs.penalty from public.group_settings gs where gs.group_id = g.id order by gs.effective_week_start desc limit 1) s on true
                       where j.user_id = uid and j.status = 'pending'),
    'lastRejected', (select jsonb_build_object('groupName', g.name, 'reviewedAt', j.reviewed_at)
                     from public.join_requests j join public.groups g on g.id = j.group_id
                     where j.user_id = uid and j.status = 'rejected' order by j.reviewed_at desc limit 1)
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------------------
-- Submit with a chosen activity date (this week's Monday .. today, KST)
-- ---------------------------------------------------------------------------
drop function if exists public.submit_record(text, int, text, uuid[], date);

create or replace function public.submit_record(p_submission_key text, p_distance_meters int, p_memo text, p_upload_ids uuid[], p_client_date date default null, p_activity_date date default null)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_profile();
  gid uuid;
  v_id uuid;
  v_today date := app.kst_today();
  v_week_start date := app.week_start_of(app.now());
  v_date date := coalesce(p_activity_date, v_today);
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
  if v_date > v_today or v_date < v_week_start then perform app.fail('date_out_of_week'); end if;
  if p_distance_meters is null or p_distance_meters not between 1 and 500000 then perform app.fail('invalid_input'); end if;
  if v_memo is not null and char_length(v_memo) > 1000 then perform app.fail('invalid_input'); end if;
  if coalesce(array_length(p_upload_ids, 1), 0) < 1 then perform app.fail('photos_required'); end if;
  if array_length(p_upload_ids, 1) > 5 then perform app.fail('too_many_photos'); end if;
  perform app.rate_limit('record:' || uid::text, 30, interval '1 minute');

  v_week := app.ensure_group_week(gid, v_week_start);
  select state into v_state from public.group_weeks where id = v_week for update;
  if v_state <> 'open' then perform app.fail('week_not_open'); end if;

  insert into public.running_records (group_id, user_id, week_id, activity_date, distance_meters, memo, status, submission_key, created_at, updated_at)
  values (gid, uid, v_week, v_date, p_distance_meters, v_memo, 'pending', p_submission_key, app.now(), app.now())
  returning id into v_id;
  perform app.attach_uploads(v_id, uid, gid, p_upload_ids, 0);
  insert into public.record_reviews (record_id, actor_id, from_status, to_status, created_at) values (v_id, uid, null, 'pending', app.now());

  v_admin := app.group_admin_id(gid);
  if v_admin is not null and v_admin <> uid then
    perform app.notify(v_admin, gid, 'record_submitted:' || v_id::text, 'record_submitted', v_id);
  end if;
  return v_id;
end $$;
grant execute on function public.submit_record(text, int, text, uuid[], date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Edit/delete window: any pending/rejected record while its week is still open
-- ---------------------------------------------------------------------------
create or replace function app.editable_record(p_record_id uuid, p_uid uuid) returns public.running_records
language plpgsql security definer set search_path = public, app as $$
declare r public.running_records%rowtype; v_state public.week_state;
begin
  select * into r from public.running_records where id = p_record_id for update;
  if r.id is null then perform app.fail('not_found'); end if;
  if r.user_id <> p_uid then perform app.fail('forbidden'); end if;
  if r.status not in ('pending', 'rejected') then perform app.fail('invalid_status'); end if;
  select state into v_state from public.group_weeks where id = r.week_id;
  if v_state <> 'open' then perform app.fail('edit_window_closed'); end if;
  return r;
end $$;

-- owner: pending/rejected in an open week. admin: any record while the week is not finalized.
create or replace function public.delete_record(p_record_id uuid) returns setof text
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_user(); r public.running_records%rowtype; v_state public.week_state; removed text[];
begin
  select * into r from public.running_records where id = p_record_id for update;
  if r.id is null then perform app.fail('not_found'); end if;
  if app.is_group_admin(r.group_id) then
    select state into v_state from public.group_weeks where id = r.week_id;
    if v_state = 'finalized' then perform app.fail('week_finalized'); end if;
  else
    r := app.editable_record(p_record_id, uid);
  end if;
  select coalesce(array_agg(storage_path), '{}') into removed from public.record_photos where record_id = r.id;
  delete from public.running_records where id = r.id;
  return query select unnest(removed);
end $$;
