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
  add column penalty_per_km_won  integer not null default 10000  check (penalty_per_km_won between 0 and 10000000),
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
