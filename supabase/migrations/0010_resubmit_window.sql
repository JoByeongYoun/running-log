-- 0010_resubmit_window.sql : 반려된 기록을 검토 마감(월요일 12:00) 전까지 보강해 재제출할 수 있게 한다.
-- 주차가 '집계 중(closing)'이어도 관리자 검토가 가능한 동안에는 본인 수정·삭제·재제출을 허용한다.

create or replace function app.editable_record(p_record_id uuid, p_uid uuid) returns public.running_records
language plpgsql security definer set search_path = public, app as $$
declare r public.running_records%rowtype; w public.group_weeks%rowtype;
begin
  select * into r from public.running_records where id = p_record_id for update;
  if r.id is null then perform app.fail('not_found'); end if;
  if r.user_id <> p_uid then perform app.fail('forbidden'); end if;
  if r.status not in ('pending', 'rejected') then perform app.fail('invalid_status'); end if;
  select * into w from public.group_weeks where id = r.week_id;
  if w.state = 'finalized' then perform app.fail('edit_window_closed'); end if;
  if w.state = 'closing' and app.now() >= app.week_close_deadline(w.week_start) then perform app.fail('edit_window_closed'); end if;
  return r;
end $$;
