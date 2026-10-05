-- 0015_runner_types.sql : 러너 유형(열정/자유/부상)과 벌금 계산. 휴식 기능은 부상 유형으로 흡수.
--
-- 규칙
--  * memberships.runner_type 이 현재 유형, week_members.runner_type 은 주차 스냅샷. 유형 변경은 open 주에 즉시 반영.
--  * eligible = 주 시작 전 가입 and runner_type <> 'injured'. 순위는 eligible and passion 끼리만.
--  * 판정·벌금은 app.evaluate 한 곳에서. finalize_week 와 get_week_dashboard 가 같이 쓴다.
--  * 0m 는 km당 계산 대신 zero_km_penalty_won 고정액.

-- ---------------------------------------------------------------------------
-- 1. 타입·컬럼
-- ---------------------------------------------------------------------------
create type public.runner_type as enum ('passion', 'free', 'injured');

alter table public.memberships add column runner_type public.runner_type not null default 'passion';
alter table public.week_members add column runner_type public.runner_type not null default 'passion';

alter table public.group_settings
  add column free_min_meters     integer not null default 5000   check (free_min_meters between 1 and 1000000),
  add column penalty_per_km_won  integer not null default 10000  check (penalty_per_km_won between 0 and 1000000),
  add column zero_km_penalty_won integer not null default 100000 check (zero_km_penalty_won between 0 and 10000000);
alter table public.group_settings alter column penalty drop not null;
alter table public.group_settings drop constraint if exists group_settings_penalty_check;
alter table public.group_settings add constraint group_settings_penalty_check
  check (penalty is null or char_length(penalty) between 1 and 500);

alter table public.group_weeks
  add column free_min_meters     integer not null default 5000,
  add column penalty_per_km_won  integer not null default 10000,
  add column zero_km_penalty_won integer not null default 100000;
alter table public.group_weeks alter column penalty drop not null;

alter table public.weekly_results add column penalty_won integer not null default 0;

-- ---------------------------------------------------------------------------
-- 2. 휴식 → 부상 이전, 휴식 기능 제거
-- ---------------------------------------------------------------------------
update public.memberships set runner_type = 'injured' where rest_started_at is not null and left_at is null;
update public.week_members set runner_type = 'injured' where resting;

drop function if exists public.request_rest(text);
drop function if exists public.cancel_rest_request(uuid);
drop function if exists public.end_my_rest();
drop function if exists public.review_rest_request(uuid, boolean);
drop function if exists public.set_member_rest(uuid, uuid, boolean);
drop function if exists app.set_rest(uuid, uuid, boolean);
drop table if exists public.rest_requests;
alter table public.memberships drop column rest_started_at;
alter table public.week_members drop column resting;

-- ---------------------------------------------------------------------------
-- 3. 판정·벌금 단일 출처
-- ---------------------------------------------------------------------------
create or replace function app.evaluate(
  p_type public.runner_type, p_total int, p_target int, p_free_min int, p_per_km int, p_zero_won int
) returns table (outcome public.result_outcome, penalty_won int, ranked boolean)
language sql immutable as $$
  with g as (select case when p_type = 'free' then p_free_min else p_target end as goal)
  select
    case when p_type = 'injured' then 'not_evaluated'::public.result_outcome
         when p_total >= g.goal then 'success'::public.result_outcome
         else 'fail'::public.result_outcome end,
    case when p_type = 'injured' or p_total >= g.goal then 0
         when p_total <= 0 then p_zero_won
         else (ceil((g.goal - p_total) / 1000.0)::int) * p_per_km end,
    (p_type = 'passion')
  from g;
$$;

-- 테스트에서 TS 구현과 교차 검증하기 위한 공개 래퍼
create or replace function public.test_evaluate(
  p_type public.runner_type, p_total int, p_target int, p_free_min int, p_per_km int, p_zero_won int
) returns table (outcome public.result_outcome, penalty_won int, ranked boolean)
language sql stable security definer set search_path = public, app as $$
  select * from app.evaluate(p_type, p_total, p_target, p_free_min, p_per_km, p_zero_won);
$$;
grant execute on function public.test_evaluate(public.runner_type, int, int, int, int, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. 주 생성 스냅샷: 유형 복사, 부상은 평가 제외
-- ---------------------------------------------------------------------------
create or replace function app.ensure_group_week(p_group_id uuid, p_week_start date) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_id uuid;
  v_created timestamptz;
  s record;
  v_ws timestamptz := app.week_start_utc(p_week_start);
begin
  select id into v_id from public.group_weeks where group_id = p_group_id and week_start = p_week_start;
  if v_id is not null then return v_id; end if;

  perform pg_advisory_xact_lock(hashtext('week:' || p_group_id::text || ':' || p_week_start::text));
  select id into v_id from public.group_weeks where group_id = p_group_id and week_start = p_week_start;
  if v_id is not null then return v_id; end if;

  select created_at into v_created from public.groups where id = p_group_id;
  if v_created is null then perform app.fail('not_found'); end if;
  if app.week_start_of(v_created) > p_week_start then perform app.fail('before_group_created'); end if;

  select target_meters, penalty, free_min_meters, penalty_per_km_won, zero_km_penalty_won into s from public.group_settings
  where group_id = p_group_id and effective_week_start <= p_week_start
  order by effective_week_start desc limit 1;
  if s.target_meters is null then
    select target_meters, penalty, free_min_meters, penalty_per_km_won, zero_km_penalty_won into s from public.group_settings
    where group_id = p_group_id order by effective_week_start asc limit 1;
  end if;

  insert into public.group_weeks (group_id, week_start, target_meters, penalty, free_min_meters, penalty_per_km_won, zero_km_penalty_won, state)
  values (p_group_id, p_week_start, s.target_meters, s.penalty, s.free_min_meters, s.penalty_per_km_won, s.zero_km_penalty_won, 'open')
  returning id into v_id;

  insert into public.week_members (week_id, user_id, eligible, joined_this_week, left_during_week, runner_type)
  select v_id, m.user_id,
         (m.joined_at < v_ws and m.runner_type <> 'injured'),
         (m.joined_at >= v_ws),
         (m.left_at is not null),
         m.runner_type
  from public.memberships m
  where m.group_id = p_group_id
    and m.joined_at < app.week_end_utc(p_week_start)
    and (m.left_at is null or m.left_at >= v_ws)
  on conflict (week_id, user_id) do nothing;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 5. 유형 변경 (관리자 전용). open 주에 즉시 반영, 본인에게 알림.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_runner_type(p_group_id uuid, p_user_id uuid, p_type public.runner_type) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_user();
  m public.memberships%rowtype;
  v_now timestamptz := app.now();
  v_week date := app.week_start_of(v_now);
  v_ws timestamptz := app.week_start_utc(v_week);
  w public.group_weeks%rowtype;
begin
  if not app.is_group_admin(p_group_id) then perform app.fail('forbidden'); end if;
  select * into m from public.memberships where group_id = p_group_id and user_id = p_user_id and left_at is null for update;
  if m.id is null then perform app.fail('not_member'); end if;
  if m.runner_type = p_type then perform app.fail('same_runner_type'); end if;

  update public.memberships set runner_type = p_type where id = m.id;

  perform app.ensure_group_week(p_group_id, v_week);
  select * into w from public.group_weeks where group_id = p_group_id and week_start = v_week;
  if w.state = 'open' then
    update public.week_members
       set runner_type = p_type,
           eligible = (p_type <> 'injured') and (m.joined_at < v_ws)
     where week_id = w.id and user_id = p_user_id;
  end if;

  if p_user_id <> uid then
    perform app.notify(p_user_id, p_group_id,
      'runner_type_changed:' || m.id::text || ':' || p_type::text || ':' || extract(epoch from v_now)::bigint::text,
      'runner_type_changed', m.id);
  end if;
end $$;
grant execute on function public.set_member_runner_type(uuid, uuid, public.runner_type) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. 그룹 생성·설정 예약·초대 조회: 숫자 3개 추가, 메모는 선택
-- ---------------------------------------------------------------------------
drop function if exists public.create_group(text, int, text);
create or replace function public.create_group(
  p_name text, p_target_meters int, p_penalty text default null,
  p_free_min_meters int default 5000, p_penalty_per_km_won int default 10000, p_zero_km_penalty_won int default 100000
) returns table (group_id uuid, invite_code text)
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_profile();
  v_name text := btrim(p_name);
  v_penalty text := nullif(btrim(coalesce(p_penalty, '')), '');
  v_gid uuid;
  v_code text := app.new_invite_code();
  v_week date := app.week_start_of(app.now());
begin
  if v_name is null or char_length(v_name) not between 2 and 30 then perform app.fail('invalid_input'); end if;
  if v_penalty is not null and char_length(v_penalty) > 500 then perform app.fail('invalid_input'); end if;
  if p_target_meters is null or p_target_meters not between 1 and 1000000 then perform app.fail('invalid_input'); end if;
  if p_free_min_meters is null or p_free_min_meters not between 1 and 1000000 then perform app.fail('invalid_input'); end if;
  if p_penalty_per_km_won is null or p_penalty_per_km_won not between 0 and 1000000 then perform app.fail('invalid_input'); end if;
  if p_zero_km_penalty_won is null or p_zero_km_penalty_won not between 0 and 10000000 then perform app.fail('invalid_input'); end if;

  perform pg_advisory_xact_lock(hashtext('user:' || uid::text));
  if exists (select 1 from public.memberships m where m.user_id = uid and m.left_at is null) then perform app.fail('already_in_group'); end if;
  if exists (select 1 from public.join_requests j where j.user_id = uid and j.status = 'pending') then perform app.fail('pending_request_exists'); end if;

  insert into public.groups (name, created_at) values (v_name, app.now()) returning id into v_gid;
  insert into public.group_settings (group_id, effective_week_start, target_meters, penalty, free_min_meters, penalty_per_km_won, zero_km_penalty_won)
  values (v_gid, v_week, p_target_meters, v_penalty, p_free_min_meters, p_penalty_per_km_won, p_zero_km_penalty_won);
  insert into public.memberships (group_id, user_id, role, joined_at) values (v_gid, uid, 'admin', app.now());
  insert into public.group_invites (group_id, code_hash) values (v_gid, app.hash_code(v_code));
  perform app.ensure_group_week(v_gid, v_week);

  group_id := v_gid; invite_code := v_code;
  return next;
end $$;
grant execute on function public.create_group(text, int, text, int, int, int) to authenticated;

drop function if exists public.schedule_group_settings(uuid, int, text);
create or replace function public.schedule_group_settings(
  p_group_id uuid, p_target_meters int, p_penalty text default null,
  p_free_min_meters int default 5000, p_penalty_per_km_won int default 10000, p_zero_km_penalty_won int default 100000
) returns date
language plpgsql security definer set search_path = public, app as $$
declare
  v_next date := app.week_start_of(app.now()) + 7;
  v_penalty text := nullif(btrim(coalesce(p_penalty, '')), '');
begin
  perform app.require_user();
  if not app.is_group_admin(p_group_id) then perform app.fail('forbidden'); end if;
  if p_target_meters is null or p_target_meters not between 1 and 1000000 then perform app.fail('invalid_input'); end if;
  if p_free_min_meters is null or p_free_min_meters not between 1 and 1000000 then perform app.fail('invalid_input'); end if;
  if p_penalty_per_km_won is null or p_penalty_per_km_won not between 0 and 1000000 then perform app.fail('invalid_input'); end if;
  if p_zero_km_penalty_won is null or p_zero_km_penalty_won not between 0 and 10000000 then perform app.fail('invalid_input'); end if;
  if v_penalty is not null and char_length(v_penalty) > 500 then perform app.fail('invalid_input'); end if;
  insert into public.group_settings (group_id, effective_week_start, target_meters, penalty, free_min_meters, penalty_per_km_won, zero_km_penalty_won)
  values (p_group_id, v_next, p_target_meters, v_penalty, p_free_min_meters, p_penalty_per_km_won, p_zero_km_penalty_won)
  on conflict (group_id, effective_week_start) do update
    set target_meters = excluded.target_meters, penalty = excluded.penalty,
        free_min_meters = excluded.free_min_meters, penalty_per_km_won = excluded.penalty_per_km_won, zero_km_penalty_won = excluded.zero_km_penalty_won;
  return v_next;
end $$;
grant execute on function public.schedule_group_settings(uuid, int, text, int, int, int) to authenticated;

drop function if exists public.lookup_invite(text);
create or replace function public.lookup_invite(p_code text)
returns table (group_id uuid, name text, target_meters int, penalty text, archived boolean, free_min_meters int, penalty_per_km_won int, zero_km_penalty_won int)
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.rate_limit('invite:' || coalesce(auth.uid()::text, app.request_ip()), 20, interval '1 minute');
  return query
    select g.id, g.name, s.target_meters, s.penalty, (g.archived_at is not null), s.free_min_meters, s.penalty_per_km_won, s.zero_km_penalty_won
    from public.group_invites i
    join public.groups g on g.id = i.group_id
    join lateral (
      select gs.target_meters, gs.penalty, gs.free_min_meters, gs.penalty_per_km_won, gs.zero_km_penalty_won from public.group_settings gs
      where gs.group_id = g.id and gs.effective_week_start <= app.week_start_of(app.now())
      order by gs.effective_week_start desc limit 1
    ) s on true
    where i.code_hash = app.hash_code(p_code);
end $$;
grant execute on function public.lookup_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. 내 상태
-- ---------------------------------------------------------------------------
create or replace function public.get_my_group_state() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare uid uuid := auth.uid(); res jsonb;
begin
  if uid is null then return null; end if;
  select jsonb_build_object(
    'membership', (select jsonb_build_object('groupId', m.group_id, 'role', m.role, 'groupName', g.name, 'archived', g.archived_at is not null,
                                             'notice', g.notice, 'noticeUpdatedAt', g.notice_updated_at, 'runnerType', m.runner_type)
                   from public.memberships m join public.groups g on g.id = m.group_id where m.user_id = uid and m.left_at is null),
    'pendingRequest', (select jsonb_build_object('id', j.id, 'groupId', j.group_id, 'groupName', g.name, 'targetMeters', s.target_meters, 'penalty', s.penalty,
                                                 'freeMinMeters', s.free_min_meters, 'penaltyPerKmWon', s.penalty_per_km_won, 'zeroKmPenaltyWon', s.zero_km_penalty_won)
                       from public.join_requests j join public.groups g on g.id = j.group_id
                       join lateral (select gs.target_meters, gs.penalty, gs.free_min_meters, gs.penalty_per_km_won, gs.zero_km_penalty_won
                                     from public.group_settings gs where gs.group_id = g.id order by gs.effective_week_start desc limit 1) s on true
                       where j.user_id = uid and j.status = 'pending'),
    'lastRejected', (select jsonb_build_object('groupName', g.name, 'reviewedAt', j.reviewed_at)
                     from public.join_requests j join public.groups g on g.id = j.group_id
                     where j.user_id = uid and j.status = 'rejected' order by j.reviewed_at desc limit 1)
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------------------
-- 8. 마감: app.evaluate 로 결과·벌금, 순위는 eligible 열정끼리
-- ---------------------------------------------------------------------------
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

  insert into public.weekly_results (week_id, user_id, total_meters, rank, outcome, eligible, nickname_snapshot, penalty_won)
  select w.id, t.user_id, t.total,
         case when t.eligible and t.ranked then rank() over (partition by (t.eligible and t.ranked) order by t.total desc) end,
         case when not t.eligible then 'not_evaluated'::public.result_outcome else t.outcome end,
         t.eligible,
         coalesce(p.nickname, '(이름 없음)'),
         case when t.eligible then t.penalty_won else 0 end
  from (
    select wm.user_id, wm.eligible, e.outcome, e.penalty_won, e.ranked, x.total
    from public.week_members wm
    cross join lateral (
      select coalesce((select sum(r.distance_meters) from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'approved'), 0)::int as total
    ) x
    cross join lateral app.evaluate(wm.runner_type, x.total, w.target_meters, w.free_min_meters, w.penalty_per_km_won, w.zero_km_penalty_won) e
    where wm.week_id = w.id
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

-- ---------------------------------------------------------------------------
-- 9. 대시보드: runnerType / goalMeters / penaltyWon, 정렬 열정→자유→부상→탈퇴
-- ---------------------------------------------------------------------------
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
    select wm.user_id, wm.eligible, wm.joined_this_week, wm.left_during_week, wm.runner_type,
           coalesce(wr.nickname_snapshot, p.nickname, '(이름 없음)') as nickname,
           p.avatar_path,
           (select coalesce(sum(r.distance_meters), 0)::int from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'approved') as approved,
           (select coalesce(sum(r.distance_meters), 0)::int from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'pending') as pending,
           wr.rank as final_rank, wr.outcome as final_outcome, wr.total_meters as final_total, wr.penalty_won as final_penalty,
           exists (select 1 from public.memberships m where m.group_id = p_group_id and m.user_id = wm.user_id and m.left_at is null) as active_now,
           case when wm.runner_type = 'injured' then null when wm.runner_type = 'free' then w.free_min_meters else w.target_meters end as goal_meters
    from public.week_members wm
    join public.profiles p on p.id = wm.user_id
    left join public.weekly_results wr on wr.week_id = w.id and wr.user_id = wm.user_id
    where wm.week_id = w.id
  ), evaluated as (
    select b.*, e.outcome as eval_outcome, e.penalty_won as eval_penalty, e.ranked
    from base b
    cross join lateral app.evaluate(b.runner_type, b.approved, w.target_meters, w.free_min_meters, w.penalty_per_km_won, w.zero_km_penalty_won) e
  ), ranked as (
    select b.*,
           case when w.state = 'finalized' then b.final_rank
                when b.eligible and b.ranked then rank() over (partition by (b.eligible and b.ranked) order by b.approved desc) end as rank_now,
           case when w.state = 'finalized' then b.final_outcome::text
                when not b.eligible then 'not_evaluated'
                when b.pending > 0 then 'pending_review'
                when b.eval_outcome = 'success' then 'provisional_success'
                else 'provisional_fail' end as outcome_now,
           case when w.state = 'finalized' then coalesce(b.final_penalty, 0)
                when not b.eligible then 0
                else b.eval_penalty end as penalty_now,
           case when b.left_during_week or not b.active_now then 3
                when b.eligible and b.runner_type = 'passion' then 0
                when b.eligible and b.runner_type = 'free' then 1
                else 2 end as sort_group
    from evaluated b
  )
  select jsonb_agg(jsonb_build_object(
    'userId', r.user_id, 'nickname', r.nickname, 'avatarPath', r.avatar_path,
    'eligible', r.eligible, 'joinedThisWeek', r.joined_this_week, 'leftDuringWeek', r.left_during_week, 'activeNow', r.active_now,
    'runnerType', r.runner_type, 'goalMeters', r.goal_meters, 'penaltyWon', r.penalty_now,
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
  ) order by r.sort_group, (r.rank_now is null), r.rank_now, r.approved desc, r.nickname) into members from ranked r;

  select jsonb_build_object(
    'approvedMeters', coalesce((select sum(distance_meters) from public.running_records x where x.week_id = w.id and x.user_id = uid and x.status = 'approved'), 0),
    'pendingMeters', coalesce((select sum(distance_meters) from public.running_records x where x.week_id = w.id and x.user_id = uid and x.status = 'pending'), 0),
    'eligible', coalesce((select eligible from public.week_members where week_id = w.id and user_id = uid), false),
    'inWeek', exists (select 1 from public.week_members where week_id = w.id and user_id = uid),
    'runnerType', coalesce((select runner_type::text from public.week_members where week_id = w.id and user_id = uid), 'passion'),
    'goalMeters', (select (m ->> 'goalMeters')::int from jsonb_array_elements(coalesce(members, '[]'::jsonb)) m where m ->> 'userId' = uid::text),
    'penaltyWon', coalesce((select (m ->> 'penaltyWon')::int from jsonb_array_elements(coalesce(members, '[]'::jsonb)) m where m ->> 'userId' = uid::text), 0)
  ) into me;

  return jsonb_build_object(
    'week', jsonb_build_object('id', w.id, 'weekStart', w.week_start, 'state', w.state, 'targetMeters', w.target_meters, 'penalty', w.penalty,
                               'freeMinMeters', w.free_min_meters, 'penaltyPerKmWon', w.penalty_per_km_won, 'zeroKmPenaltyWon', w.zero_km_penalty_won,
                               'finalizedAt', w.finalized_at, 'groupName', v_name, 'groupTotalMeters', w.group_total_meters, 'isCurrent', w.week_start = v_current),
    'me', me,
    'members', coalesce(members, '[]'::jsonb),
    'pendingCount', v_pending,
    'provisional', w.state <> 'finalized',
    'today', app.kst_today()
  );
end $$;

-- ---------------------------------------------------------------------------
-- 10. 주간 요약: 벌금 합계
-- ---------------------------------------------------------------------------
create or replace function public.get_week_summary(p_group_id uuid, p_week_start date) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d jsonb; members jsonb; v_success int; v_eval int; v_total bigint; v_penalty bigint;
begin
  d := public.get_week_dashboard(p_group_id, p_week_start);
  members := d -> 'members';
  select count(*) filter (where (m ->> 'outcome') in ('success', 'provisional_success')),
         count(*) filter (where (m ->> 'eligible')::boolean),
         coalesce(sum((m ->> 'approvedMeters')::int), 0),
         coalesce(sum((m ->> 'penaltyWon')::int), 0)
    into v_success, v_eval, v_total, v_penalty
  from jsonb_array_elements(members) m;
  return d || jsonb_build_object(
    'successCount', v_success,
    'evaluatedCount', v_eval,
    'groupTotalMeters', coalesce((d -> 'week' ->> 'groupTotalMeters')::int, v_total::int),
    'penaltyTotalWon', v_penalty,
    'myUserId', auth.uid()
  );
end $$;

-- ---------------------------------------------------------------------------
-- 11. 알림 뷰: runner_type_changed 추가, 옛 rest_* 는 legacy 로
-- ---------------------------------------------------------------------------
create or replace function app.notification_view(n public.notifications, p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id', n.id, 'type', n.type, 'targetId', n.target_id, 'groupId', n.group_id, 'readAt', n.read_at, 'createdAt', n.created_at,
    'link', case n.type
      when 'join_request' then case when app.is_group_admin(n.group_id, p_uid) then '/admin?tab=requests' end
      when 'join_result' then '/'
      when 'runner_type_changed' then '/profile'
      when 'record_submitted' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'record_review' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'record_expired' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'review_reminder' then case when app.is_group_admin(n.group_id, p_uid) then '/admin?tab=reviews' end
      when 'week_final' then case when app.can_view_week(n.target_id, p_uid) then '/?week=' || (select week_start::text from public.group_weeks where id = n.target_id) end
    end,
    'meta', case n.type
      when 'join_request' then (select jsonb_build_object('nickname', p.nickname, 'groupName', g.name) from public.join_requests j join public.profiles p on p.id = j.user_id join public.groups g on g.id = j.group_id where j.id = n.target_id)
      when 'join_result' then (select jsonb_build_object('status', j.status, 'groupName', g.name) from public.join_requests j join public.groups g on g.id = j.group_id where j.id = n.target_id)
      when 'runner_type_changed' then (select jsonb_build_object('type', split_part(n.event_key, ':', 3), 'groupName', g.name, 'nickname', p.nickname)
                                       from public.memberships m join public.profiles p on p.id = m.user_id join public.groups g on g.id = m.group_id where m.id = n.target_id)
      when 'rest_request' then jsonb_build_object('legacy', true)
      when 'rest_result' then jsonb_build_object('legacy', true)
      when 'rest_changed' then jsonb_build_object('legacy', true)
      when 'record_submitted' then (select jsonb_build_object('nickname', p.nickname, 'meters', r.distance_meters) from public.running_records r join public.profiles p on p.id = r.user_id where r.id = n.target_id)
      when 'record_review' then (select jsonb_build_object('status', split_part(n.event_key, ':', 4), 'reason', rv.reason, 'meters', r.distance_meters)
                                 from public.running_records r left join lateral (select reason from public.record_reviews x where x.record_id = r.id and x.to_status::text = split_part(n.event_key, ':', 4) order by created_at desc limit 1) rv on true
                                 where r.id = n.target_id)
      when 'record_expired' then (select jsonb_build_object('meters', r.distance_meters, 'date', r.activity_date) from public.running_records r where r.id = n.target_id)
      when 'review_reminder' then jsonb_build_object('phase', split_part(n.event_key, ':', 3))
      when 'week_final' then (select jsonb_build_object('weekStart', w.week_start, 'groupName', w.group_name_snapshot) from public.group_weeks w where w.id = n.target_id)
      else '{}'::jsonb end
  );
$$;
