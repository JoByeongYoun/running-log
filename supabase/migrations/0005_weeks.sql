-- 0005_weeks.sql : week closing, expiry, finalization, maintenance (idempotent, server-time based)

create or replace function app.finalize_week(p_week_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  w public.group_weeks%rowtype;
  v_pending int;
  v_now timestamptz := app.now();
  v_group_name text;
  v_total int;
  rec record;
begin
  select * into w from public.group_weeks where id = p_week_id for update;
  if w.id is null then perform app.fail('not_found'); end if;
  if w.state = 'finalized' then perform app.fail('already_finalized'); end if;

  select count(*) into v_pending from public.running_records where week_id = w.id and status = 'pending';
  if v_pending > 0 then
    if v_now < app.week_close_deadline(w.week_start) then perform app.fail('pending_remaining'); end if;
    for rec in select id, user_id, group_id from public.running_records where week_id = w.id and status = 'pending' loop
      update public.running_records set status = 'expired', updated_at = v_now where id = rec.id;
      insert into public.record_reviews (record_id, actor_id, from_status, to_status, reason, created_at)
      values (rec.id, null, 'pending', 'expired', '검토 기한 만료', v_now);
      perform app.notify(rec.user_id, rec.group_id, 'record_expired:' || rec.id::text, 'record_expired', rec.id);
    end loop;
  end if;

  select name into v_group_name from public.groups where id = w.group_id;

  insert into public.weekly_results (week_id, user_id, total_meters, rank, outcome, eligible, nickname_snapshot)
  select w.id, t.user_id, t.total,
         case when t.eligible then rank() over (partition by t.eligible order by t.total desc) end,
         case when not t.eligible then 'not_evaluated'::public.result_outcome
              when t.total >= w.target_meters then 'success'::public.result_outcome
              else 'fail'::public.result_outcome end,
         t.eligible,
         coalesce(p.nickname, '(이름 없음)')
  from (
    select wm.user_id, wm.eligible,
           coalesce((select sum(r.distance_meters) from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'approved'), 0)::int as total
    from public.week_members wm where wm.week_id = w.id
  ) t
  join public.profiles p on p.id = t.user_id
  on conflict (week_id, user_id) do nothing;

  select coalesce(sum(distance_meters), 0)::int into v_total from public.running_records where week_id = w.id and status = 'approved';

  update public.group_weeks
     set state = 'finalized', finalized_at = v_now, group_name_snapshot = v_group_name, group_total_meters = v_total
   where id = w.id;

  perform app.notify(wm.user_id, w.group_id, 'week_final:' || w.id::text, 'week_final', w.id)
  from public.week_members wm where wm.week_id = w.id;
end $$;

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
  v_end := app.week_end_utc(w.week_start);
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

-- called at the end of review_record
create or replace function app.after_review_check_week(p_week_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.close_week_if_due(p_week_id);
end $$;

-- per-group reconciliation used on reads: ensure current week, close due weeks
create or replace function app.reconcile_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare rec record; v_archived timestamptz;
begin
  select archived_at into v_archived from public.groups where id = p_group_id;
  if v_archived is null then
    perform app.ensure_group_week(p_group_id, app.week_start_of(app.now()));
  end if;
  for rec in select id from public.group_weeks where group_id = p_group_id and state <> 'finalized' and app.week_end_utc(week_start) <= app.now() order by week_start loop
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
      for wk in select id from public.group_weeks where group_id = g.id and state <> 'finalized' and app.week_end_utc(week_start) <= app.now() order by week_start loop
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
revoke all on function public.run_week_maintenance() from public, anon, authenticated;
grant execute on function public.run_week_maintenance() to service_role;
