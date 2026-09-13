-- 0012_monday_submit.sql : 지난주 기록을 월요일 하루 동안(화요일 00:00 KST 전까지) 더 올릴 수 있게 한다.
-- 주차 마감(집계 시작)이 월요일 00:00 → 화요일 00:00으로, 검토 마감이 월요일 12:00 → 화요일 12:00으로 하루 늦춰진다.
-- 주차 자체(월~일)와 week_end_utc(멤버 자격 스냅샷 기준)는 그대로다.

-- 제출 마감: 주가 끝난 뒤 화요일 00:00 KST
create or replace function app.week_submit_deadline(p_week_start date) returns timestamptz
language sql immutable as $$
  select app.week_start_utc(p_week_start + 8);
$$;

-- 검토 마감: 주가 끝난 뒤 화요일 12:00 KST
create or replace function app.week_close_deadline(p_week_start date) returns timestamptz
language sql immutable as $$
  select ((p_week_start + 8)::text || ' 12:00:00')::timestamp at time zone 'Asia/Seoul';
$$;

grant execute on function app.week_submit_deadline(date) to anon, authenticated, service_role;

create or replace function public.app_week_submit_deadline(p date) returns timestamptz
language sql immutable as $$ select app.week_submit_deadline(p); $$;
grant execute on function public.app_week_submit_deadline(date) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Submit: this week's Monday .. today, plus all of last week while its submit window is open (i.e. on Monday)
-- ---------------------------------------------------------------------------
create or replace function public.submit_record(p_submission_key text, p_distance_meters int, p_memo text, p_upload_ids uuid[], p_client_date date default null, p_activity_date date default null)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_profile();
  gid uuid;
  v_id uuid;
  v_today date := app.kst_today();
  v_week_start date := app.week_start_of(app.now());
  v_min date := v_week_start;
  v_date date := coalesce(p_activity_date, v_today);
  v_target_week date;
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
  if app.now() < app.week_submit_deadline(v_week_start - 7) then v_min := v_week_start - 7; end if;
  if v_date > v_today or v_date < v_min then perform app.fail('date_out_of_week'); end if;
  if p_distance_meters is null or p_distance_meters not between 1 and 500000 then perform app.fail('invalid_input'); end if;
  if v_memo is not null and char_length(v_memo) > 1000 then perform app.fail('invalid_input'); end if;
  if coalesce(array_length(p_upload_ids, 1), 0) < 1 then perform app.fail('photos_required'); end if;
  if array_length(p_upload_ids, 1) > 5 then perform app.fail('too_many_photos'); end if;
  perform app.rate_limit('record:' || uid::text, 30, interval '1 minute');

  v_target_week := app.week_start_of(app.week_start_utc(v_date));
  v_week := app.ensure_group_week(gid, v_target_week);
  select state into v_state from public.group_weeks where id = v_week for update;
  if v_state <> 'open' then perform app.fail('week_not_open'); end if;
  -- last week's record needs a membership snapshot in that week (joined before the week ended)
  if v_target_week <> v_week_start and not exists (select 1 from public.week_members where week_id = v_week and user_id = uid) then
    perform app.fail('date_out_of_week');
  end if;

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

-- ---------------------------------------------------------------------------
-- Closing: the week stays open until the submit deadline (Tue 00:00); reminders at Tue 00:00 / 11:00; finalize by Tue 12:00
-- ---------------------------------------------------------------------------
create or replace function app.close_week_if_due(p_week_id uuid) returns text
language plpgsql security definer set search_path = public, app as $$
declare
  w public.group_weeks%rowtype;
  v_now timestamptz := app.now();
  v_end timestamptz;
  v_deadline timestamptz;
  v_pending int;
  v_admin uuid;
begin
  select * into w from public.group_weeks where id = p_week_id for update;
  if w.id is null or w.state = 'finalized' then return 'noop'; end if;
  v_end := app.week_submit_deadline(w.week_start);
  v_deadline := app.week_close_deadline(w.week_start);
  if v_now < v_end then return 'open'; end if;

  select count(*) into v_pending from public.running_records where week_id = w.id and status = 'pending';
  v_admin := app.group_admin_id(w.group_id);

  if w.state = 'open' then
    if v_pending = 0 then
      perform app.finalize_week(w.id);
      return 'finalized';
    end if;
    update public.group_weeks set state = 'closing' where id = w.id;
    if v_admin is not null then perform app.notify(v_admin, w.group_id, 'review_reminder:' || w.id::text || ':00', 'review_reminder', w.id); end if;
  end if;

  if v_pending = 0 or v_now >= v_deadline then
    perform app.finalize_week(w.id);
    return 'finalized';
  end if;
  if v_now >= v_end + interval '11 hours' and v_admin is not null then
    perform app.notify(v_admin, w.group_id, 'review_reminder:' || w.id::text || ':11', 'review_reminder', w.id);
  end if;
  return 'closing';
end $$;

create or replace function app.reconcile_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare rec record; v_archived timestamptz;
begin
  select archived_at into v_archived from public.groups where id = p_group_id;
  if v_archived is null then
    perform app.ensure_group_week(p_group_id, app.week_start_of(app.now()));
  end if;
  for rec in select id from public.group_weeks where group_id = p_group_id and state <> 'finalized' and app.week_submit_deadline(week_start) <= app.now() order by week_start loop
    perform app.close_week_if_due(rec.id);
  end loop;
end $$;

create or replace function public.run_week_maintenance() returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  run_id uuid;
  g record; wk record;
  v_created int := 0; v_finalized int := 0; v_closing int := 0;
  v_ids uuid[] := '{}';
  v_res text;
  v_week date := app.week_start_of(app.now());
begin
  insert into app.maintenance_runs (started_at) values (now()) returning id into run_id;
  begin
    for g in select id, archived_at from public.groups loop
      perform pg_advisory_xact_lock(hashtext('group:' || g.id::text));
      if g.archived_at is null and not exists (select 1 from public.group_weeks where group_id = g.id and week_start = v_week) then
        perform app.ensure_group_week(g.id, v_week);
        v_created := v_created + 1;
      end if;
      for wk in select id from public.group_weeks where group_id = g.id and state <> 'finalized' and app.week_submit_deadline(week_start) <= app.now() order by week_start loop
        v_res := app.close_week_if_due(wk.id);
        if v_res = 'finalized' then v_finalized := v_finalized + 1; v_ids := v_ids || wk.id;
        elsif v_res = 'closing' then v_closing := v_closing + 1; v_ids := v_ids || wk.id; end if;
      end loop;
    end loop;
    delete from public.pending_uploads where expires_at < app.now() - interval '1 day';
  exception when others then
    update app.maintenance_runs set finished_at = now(), error = sqlerrm where id = run_id;
    raise;
  end;
  update app.maintenance_runs set finished_at = now(),
    result = jsonb_build_object('createdWeeks', v_created, 'finalized', v_finalized, 'closing', v_closing, 'weekIds', to_jsonb(v_ids))
  where id = run_id;
  return jsonb_build_object('createdWeeks', v_created, 'finalized', v_finalized, 'closing', v_closing, 'weekIds', to_jsonb(v_ids));
end $$;
