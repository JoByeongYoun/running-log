-- 0013_rest.sql : 휴식(일시 평가 제외) — 멤버 신청 → 관리자 승인, 관리자 직접 설정/해제
--
-- 규칙
--  * memberships.rest_started_at 이 null 이 아니면 "휴식 중". 휴식 중 멤버는 그 주 평가(eligible)에서 빠진다.
--  * 휴식 시작·종료는 진행 중인 주(open)에도 즉시 반영된다. 다음 주부터는 ensure_group_week 스냅샷이 반영한다.
--  * 휴식 중에도 기록 제출은 가능하다(평가만 제외).

alter table public.memberships add column if not exists rest_started_at timestamptz;
alter table public.week_members add column if not exists resting boolean not null default false;

create table if not exists public.rest_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 200),
  status public.join_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists rest_requests_one_pending_per_user on public.rest_requests (user_id) where status = 'pending';
create index if not exists rest_requests_group_status_idx on public.rest_requests (group_id, status);

alter table public.rest_requests enable row level security;
drop policy if exists rest_requests_select on public.rest_requests;
create policy rest_requests_select on public.rest_requests for select to authenticated
  using (user_id = auth.uid() or app.is_group_admin(group_id));

-- ---------------------------------------------------------------------------
-- 주 생성 스냅샷: 휴식 중이면 평가 제외
-- ---------------------------------------------------------------------------
create or replace function app.ensure_group_week(p_group_id uuid, p_week_start date) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_id uuid;
  v_created timestamptz;
  v_target int;
  v_penalty text;
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

  select target_meters, penalty into v_target, v_penalty from public.group_settings
  where group_id = p_group_id and effective_week_start <= p_week_start
  order by effective_week_start desc limit 1;
  if v_target is null then
    select target_meters, penalty into v_target, v_penalty from public.group_settings
    where group_id = p_group_id order by effective_week_start asc limit 1;
  end if;

  insert into public.group_weeks (group_id, week_start, target_meters, penalty, state)
  values (p_group_id, p_week_start, v_target, v_penalty, 'open') returning id into v_id;

  insert into public.week_members (week_id, user_id, eligible, joined_this_week, left_during_week, resting)
  select v_id, m.user_id,
         (m.joined_at < v_ws and m.rest_started_at is null),
         (m.joined_at >= v_ws),
         (m.left_at is not null),
         (m.rest_started_at is not null)
  from public.memberships m
  where m.group_id = p_group_id
    and m.joined_at < app.week_end_utc(p_week_start)
    and (m.left_at is null or m.left_at >= v_ws)
  on conflict (week_id, user_id) do nothing;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 휴식 상태 변경 (공통). 진행 중인 주가 open 이면 즉시 반영.
-- ---------------------------------------------------------------------------
create or replace function app.set_rest(p_group_id uuid, p_user_id uuid, p_resting boolean) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  m public.memberships%rowtype;
  v_now timestamptz := app.now();
  v_week date := app.week_start_of(v_now);
  v_ws timestamptz := app.week_start_utc(v_week);
  w public.group_weeks%rowtype;
begin
  select * into m from public.memberships where group_id = p_group_id and user_id = p_user_id and left_at is null for update;
  if m.id is null then perform app.fail('not_member'); end if;
  if p_resting and m.rest_started_at is not null then perform app.fail('already_resting'); end if;
  if not p_resting and m.rest_started_at is null then perform app.fail('not_resting'); end if;

  update public.memberships set rest_started_at = case when p_resting then v_now end where id = m.id;

  perform app.ensure_group_week(p_group_id, v_week);
  select * into w from public.group_weeks where group_id = p_group_id and week_start = v_week;
  if w.state = 'open' then
    update public.week_members
       set resting = p_resting,
           eligible = (not p_resting) and (m.joined_at < v_ws)
     where week_id = w.id and user_id = p_user_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 멤버: 휴식 신청 / 취소 / 복귀
-- ---------------------------------------------------------------------------
create or replace function public.request_rest(p_reason text default null) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_profile();
  m public.memberships%rowtype;
  v_admin uuid;
  v_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into m from public.memberships where user_id = uid and left_at is null;
  if m.id is null then perform app.fail('not_member'); end if;
  if m.rest_started_at is not null then perform app.fail('already_resting'); end if;
  if exists (select 1 from public.rest_requests r where r.user_id = uid and r.status = 'pending') then perform app.fail('pending_request_exists'); end if;
  if v_reason is not null and char_length(v_reason) > 200 then perform app.fail('invalid_input'); end if;

  insert into public.rest_requests (group_id, user_id, reason, created_at) values (m.group_id, uid, v_reason, app.now()) returning id into v_id;
  select user_id into v_admin from public.memberships where group_id = m.group_id and role = 'admin' and left_at is null;
  if v_admin is not null and v_admin <> uid then
    perform app.notify(v_admin, m.group_id, 'rest_request:' || v_id::text, 'rest_request', v_id);
  end if;
  return v_id;
end $$;

create or replace function public.cancel_rest_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_user();
begin
  update public.rest_requests set status = 'cancelled', reviewed_at = app.now()
   where id = p_request_id and user_id = uid and status = 'pending';
  if not found then perform app.fail('not_found'); end if;
end $$;

create or replace function public.end_my_rest() returns void
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_user();
  m public.memberships%rowtype;
  v_admin uuid;
begin
  select * into m from public.memberships where user_id = uid and left_at is null;
  if m.id is null then perform app.fail('not_member'); end if;
  perform app.set_rest(m.group_id, uid, false);
  select user_id into v_admin from public.memberships where group_id = m.group_id and role = 'admin' and left_at is null;
  if v_admin is not null and v_admin <> uid then
    perform app.notify(v_admin, m.group_id, 'rest_changed:' || m.id::text || ':ended:' || extract(epoch from app.now())::bigint::text, 'rest_changed', m.id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 관리자: 신청 검토 / 직접 설정·해제
-- ---------------------------------------------------------------------------
create or replace function public.review_rest_request(p_request_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_user();
  r public.rest_requests%rowtype;
begin
  select * into r from public.rest_requests where id = p_request_id for update;
  if r.id is null then perform app.fail('not_found'); end if;
  if not app.is_group_admin(r.group_id) then perform app.fail('forbidden'); end if;
  if r.status <> 'pending' then perform app.fail('invalid_status'); end if;

  if p_approve then
    if not exists (select 1 from public.memberships m where m.group_id = r.group_id and m.user_id = r.user_id and m.left_at is null) then
      update public.rest_requests set status = 'rejected', reviewed_by = uid, reviewed_at = app.now() where id = r.id;
      perform app.fail('not_member');
    end if;
    perform app.set_rest(r.group_id, r.user_id, true);
    update public.rest_requests set status = 'approved', reviewed_by = uid, reviewed_at = app.now() where id = r.id;
  else
    update public.rest_requests set status = 'rejected', reviewed_by = uid, reviewed_at = app.now() where id = r.id;
  end if;
  perform app.notify(r.user_id, r.group_id, 'rest_result:' || r.id::text, 'rest_result', r.id);
end $$;

create or replace function public.set_member_rest(p_group_id uuid, p_user_id uuid, p_resting boolean) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_user();
  v_mid uuid;
begin
  if not app.is_group_admin(p_group_id) then perform app.fail('forbidden'); end if;
  perform app.set_rest(p_group_id, p_user_id, p_resting);
  select id into v_mid from public.memberships where group_id = p_group_id and user_id = p_user_id and left_at is null;
  -- 대기 중 신청이 있으면 함께 정리한다.
  update public.rest_requests set status = case when p_resting then 'approved' else 'cancelled' end::public.join_status, reviewed_by = uid, reviewed_at = app.now()
   where group_id = p_group_id and user_id = p_user_id and status = 'pending';
  if p_user_id <> uid then
    perform app.notify(p_user_id, p_group_id,
      'rest_changed:' || v_mid::text || ':' || case when p_resting then 'started' else 'ended' end || ':' || extract(epoch from app.now())::bigint::text,
      'rest_changed', v_mid);
  end if;
end $$;

grant execute on function public.request_rest(text), public.cancel_rest_request(uuid), public.end_my_rest(),
  public.review_rest_request(uuid, boolean), public.set_member_rest(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 내 상태: resting / pendingRestRequest 추가
-- ---------------------------------------------------------------------------
create or replace function public.get_my_group_state() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare uid uuid := auth.uid(); res jsonb;
begin
  if uid is null then return null; end if;
  select jsonb_build_object(
    'membership', (select jsonb_build_object('groupId', m.group_id, 'role', m.role, 'groupName', g.name, 'archived', g.archived_at is not null, 'notice', g.notice, 'noticeUpdatedAt', g.notice_updated_at,
                                             'resting', m.rest_started_at is not null, 'restStartedAt', m.rest_started_at)
                   from public.memberships m join public.groups g on g.id = m.group_id where m.user_id = uid and m.left_at is null),
    'pendingRequest', (select jsonb_build_object('id', j.id, 'groupId', j.group_id, 'groupName', g.name, 'targetMeters', s.target_meters, 'penalty', s.penalty)
                       from public.join_requests j join public.groups g on g.id = j.group_id
                       join lateral (select gs.target_meters, gs.penalty from public.group_settings gs where gs.group_id = g.id order by gs.effective_week_start desc limit 1) s on true
                       where j.user_id = uid and j.status = 'pending'),
    'lastRejected', (select jsonb_build_object('groupName', g.name, 'reviewedAt', j.reviewed_at)
                     from public.join_requests j join public.groups g on g.id = j.group_id
                     where j.user_id = uid and j.status = 'rejected' order by j.reviewed_at desc limit 1),
    'pendingRestRequest', (select jsonb_build_object('id', r.id, 'reason', r.reason, 'createdAt', r.created_at)
                           from public.rest_requests r where r.user_id = uid and r.status = 'pending')
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------------------
-- 대시보드: 멤버 행에 resting / restingNow 추가
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
    select wm.user_id, wm.eligible, wm.joined_this_week, wm.left_during_week, wm.resting,
           coalesce(wr.nickname_snapshot, p.nickname, '(이름 없음)') as nickname,
           p.avatar_path,
           (select coalesce(sum(r.distance_meters), 0)::int from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'approved') as approved,
           (select coalesce(sum(r.distance_meters), 0)::int from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'pending') as pending,
           wr.rank as final_rank, wr.outcome as final_outcome, wr.total_meters as final_total,
           exists (select 1 from public.memberships m where m.group_id = p_group_id and m.user_id = wm.user_id and m.left_at is null) as active_now,
           exists (select 1 from public.memberships m where m.group_id = p_group_id and m.user_id = wm.user_id and m.left_at is null and m.rest_started_at is not null) as resting_now
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
    'resting', r.resting, 'restingNow', r.resting_now,
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
    'resting', coalesce((select resting from public.week_members where week_id = w.id and user_id = uid), false),
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

-- ---------------------------------------------------------------------------
-- 알림 뷰: rest_request / rest_result / rest_changed
-- ---------------------------------------------------------------------------
create or replace function app.notification_view(n public.notifications, p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id', n.id, 'type', n.type, 'targetId', n.target_id, 'groupId', n.group_id, 'readAt', n.read_at, 'createdAt', n.created_at,
    'link', case n.type
      when 'join_request' then case when app.is_group_admin(n.group_id, p_uid) then '/admin?tab=requests' end
      when 'join_result' then '/'
      when 'rest_request' then case when app.is_group_admin(n.group_id, p_uid) then '/admin?tab=requests' end
      when 'rest_result' then '/profile'
      when 'rest_changed' then case when app.is_group_admin(n.group_id, p_uid) then '/admin?tab=members' else '/profile' end
      when 'record_submitted' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'record_review' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'record_expired' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'review_reminder' then case when app.is_group_admin(n.group_id, p_uid) then '/admin?tab=reviews' end
      when 'week_final' then case when app.can_view_week(n.target_id, p_uid) then '/?week=' || (select week_start::text from public.group_weeks where id = n.target_id) end
    end,
    'meta', case n.type
      when 'join_request' then (select jsonb_build_object('nickname', p.nickname, 'groupName', g.name) from public.join_requests j join public.profiles p on p.id = j.user_id join public.groups g on g.id = j.group_id where j.id = n.target_id)
      when 'join_result' then (select jsonb_build_object('status', j.status, 'groupName', g.name) from public.join_requests j join public.groups g on g.id = j.group_id where j.id = n.target_id)
      when 'rest_request' then (select jsonb_build_object('nickname', p.nickname, 'groupName', g.name, 'reason', r.reason) from public.rest_requests r join public.profiles p on p.id = r.user_id join public.groups g on g.id = r.group_id where r.id = n.target_id)
      when 'rest_result' then (select jsonb_build_object('status', r.status, 'groupName', g.name) from public.rest_requests r join public.groups g on g.id = r.group_id where r.id = n.target_id)
      when 'rest_changed' then (select jsonb_build_object('status', split_part(n.event_key, ':', 3), 'groupName', g.name, 'nickname', p.nickname, 'self', m.user_id = p_uid)
                                from public.memberships m join public.profiles p on p.id = m.user_id join public.groups g on g.id = m.group_id where m.id = n.target_id)
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
