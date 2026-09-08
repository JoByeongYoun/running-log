-- 0006_dashboard.sql : weekly dashboard read model

create or replace function public.get_available_weeks(p_group_id uuid) returns date[]
language plpgsql stable security definer set search_path = public, app as $$
declare v_from date; v_to date := app.week_start_of(app.now()); out date[] := '{}'; d date;
begin
  if not app.is_active_member(p_group_id) then perform app.fail('forbidden'); end if;
  select app.week_start_of(created_at) into v_from from public.groups where id = p_group_id;
  d := v_from;
  while d <= v_to loop out := out || d; d := d + 7; end loop;
  return out;
end $$;

create or replace function public.get_week_dashboard(p_group_id uuid, p_week_start date) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_user();
  w public.group_weeks%rowtype;
  v_current date := app.week_start_of(app.now());
  v_created date;
  v_days date[];
  members jsonb;
  me jsonb;
  v_pending int;
  v_name text;
begin
  if not app.is_active_member(p_group_id) then perform app.fail('forbidden'); end if;
  if extract(isodow from p_week_start) <> 1 then perform app.fail('invalid_input'); end if;
  if p_week_start > v_current then perform app.fail('invalid_input'); end if;
  select app.week_start_of(created_at) into v_created from public.groups where id = p_group_id;
  if p_week_start < v_created then perform app.fail('before_group_created'); end if;

  perform app.reconcile_group(p_group_id);
  select * into w from public.group_weeks where group_id = p_group_id and week_start = p_week_start;
  if w.id is null then
    perform app.ensure_group_week(p_group_id, p_week_start);
    perform app.close_week_if_due((select id from public.group_weeks where group_id = p_group_id and week_start = p_week_start));
    select * into w from public.group_weeks where group_id = p_group_id and week_start = p_week_start;
  end if;

  select array_agg(d::date order by d) into v_days from generate_series(p_week_start, p_week_start + 6, interval '1 day') d;
  select count(*) into v_pending from public.running_records where week_id = w.id and status = 'pending';
  select case when w.state = 'finalized' then w.group_name_snapshot else name end into v_name from public.groups where id = p_group_id;

  with base as (
    select wm.user_id, wm.eligible, wm.joined_this_week, wm.left_during_week,
           coalesce(wr.nickname_snapshot, p.nickname, '(이름 없음)') as nickname,
           p.avatar_path,
           (select coalesce(sum(r.distance_meters), 0)::int from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'approved') as approved,
           (select coalesce(sum(r.distance_meters), 0)::int from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'pending') as pending,
           wr.rank as final_rank, wr.outcome as final_outcome, wr.total_meters as final_total,
           exists (select 1 from public.memberships m where m.group_id = p_group_id and m.user_id = wm.user_id and m.left_at is null) as active_now
    from public.week_members wm
    join public.profiles p on p.id = wm.user_id
    left join public.weekly_results wr on wr.week_id = w.id and wr.user_id = wm.user_id
    where wm.week_id = w.id
  ), ranked as (
    select b.*,
           case when w.state = 'finalized' then b.final_rank
                when b.eligible then rank() over (partition by b.eligible order by b.approved desc) end as rank_now,
           case when w.state = 'finalized' then b.final_outcome::text
                when not b.eligible then 'not_evaluated'
                when b.pending > 0 then 'pending_review'
                when b.approved >= w.target_meters then 'provisional_success'
                else 'provisional_fail' end as outcome_now
    from base b
  )
  select jsonb_agg(jsonb_build_object(
    'userId', r.user_id, 'nickname', r.nickname, 'avatarPath', r.avatar_path,
    'eligible', r.eligible, 'joinedThisWeek', r.joined_this_week, 'leftDuringWeek', r.left_during_week, 'activeNow', r.active_now,
    'approvedMeters', case when w.state = 'finalized' then coalesce(r.final_total, r.approved) else r.approved end,
    'pendingMeters', r.pending, 'rank', r.rank_now, 'outcome', r.outcome_now,
    'days', (
      select jsonb_agg(jsonb_build_object(
        'date', d,
        'approvedMeters', coalesce((select sum(distance_meters) from public.running_records x where x.week_id = w.id and x.user_id = r.user_id and x.activity_date = d and x.status = 'approved'), 0),
        'pendingMeters', coalesce((select sum(distance_meters) from public.running_records x where x.week_id = w.id and x.user_id = r.user_id and x.activity_date = d and x.status = 'pending'), 0),
        'records', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'meters', x.distance_meters) order by x.created_at)
                             from public.running_records x where x.week_id = w.id and x.user_id = r.user_id and x.activity_date = d), '[]'::jsonb)
      ) order by d) from unnest(v_days) d
    )
  ) order by (r.rank_now is null), r.rank_now, r.approved desc, r.nickname) into members from ranked r;

  select jsonb_build_object(
    'approvedMeters', coalesce((select sum(distance_meters) from public.running_records x where x.week_id = w.id and x.user_id = uid and x.status = 'approved'), 0),
    'pendingMeters', coalesce((select sum(distance_meters) from public.running_records x where x.week_id = w.id and x.user_id = uid and x.status = 'pending'), 0),
    'eligible', coalesce((select eligible from public.week_members where week_id = w.id and user_id = uid), false),
    'inWeek', exists (select 1 from public.week_members where week_id = w.id and user_id = uid)
  ) into me;

  return jsonb_build_object(
    'week', jsonb_build_object('id', w.id, 'weekStart', w.week_start, 'state', w.state, 'targetMeters', w.target_meters, 'penalty', w.penalty,
                               'finalizedAt', w.finalized_at, 'groupName', v_name, 'groupTotalMeters', w.group_total_meters, 'isCurrent', w.week_start = v_current),
    'me', me,
    'members', coalesce(members, '[]'::jsonb),
    'pendingCount', v_pending,
    'provisional', w.state <> 'finalized',
    'today', app.kst_today()
  );
end $$;

grant execute on function public.get_available_weeks(uuid), public.get_week_dashboard(uuid, date) to authenticated;
