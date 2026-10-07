-- 0016_apply_settings_now.sql : 관리자가 목표·벌금 규칙을 이번 주부터 바로 적용할 수 있게 한다.
--   p_apply_now = true 이면 이번 주 월요일 기준 설정 행을 upsert 하고, 예약된(미래) 설정은 모두 지우며,
--   이번 주 group_weeks 가 아직 open 상태이면 그 주의 규칙 스냅샷도 함께 갱신한다.
--   p_apply_now = false(기본) 이면 기존처럼 다음 주 월요일부터 적용된다.

drop function if exists public.schedule_group_settings(uuid, int, text, int, int, int);

create or replace function public.schedule_group_settings(
  p_group_id uuid, p_target_meters int, p_penalty text default null,
  p_free_min_meters int default 5000, p_penalty_per_km_won int default 10000, p_zero_km_penalty_won int default 100000,
  p_apply_now boolean default false
) returns date
language plpgsql security definer set search_path = public, app as $$
declare
  v_this date := app.week_start_of(app.now());
  v_effective date := case when coalesce(p_apply_now, false) then v_this else v_this + 7 end;
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
  values (p_group_id, v_effective, p_target_meters, v_penalty, p_free_min_meters, p_penalty_per_km_won, p_zero_km_penalty_won)
  on conflict (group_id, effective_week_start) do update
    set target_meters = excluded.target_meters, penalty = excluded.penalty,
        free_min_meters = excluded.free_min_meters, penalty_per_km_won = excluded.penalty_per_km_won, zero_km_penalty_won = excluded.zero_km_penalty_won;

  if coalesce(p_apply_now, false) then
    -- 바로 적용은 "지금부터의 규칙"이므로 예약돼 있던 미래 설정은 대체한다.
    delete from public.group_settings where group_id = p_group_id and effective_week_start > v_this;
    -- 이미 열린 이번 주 스냅샷을 갱신한다 (closing/finalized 주는 건드리지 않는다).
    update public.group_weeks
      set target_meters = p_target_meters, penalty = v_penalty,
          free_min_meters = p_free_min_meters, penalty_per_km_won = p_penalty_per_km_won, zero_km_penalty_won = p_zero_km_penalty_won
      where group_id = p_group_id and week_start = v_this and state = 'open';
  end if;

  return v_effective;
end $$;
grant execute on function public.schedule_group_settings(uuid, int, text, int, int, int, boolean) to authenticated;
