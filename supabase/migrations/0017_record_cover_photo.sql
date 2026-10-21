-- 0017_record_cover_photo.sql : 기록 사진 중 "대표 사진"(보통 셀카) 1장을 표시한다.
--   주간 요약 콜라주는 거리 인증 스크린샷 대신 대표 사진을 쓴다.
--   대표 지정은 증거 내용을 바꾸지 않으므로 version·status 를 건드리지 않고, 기록 소유자가 언제든 바꿀 수 있다.

alter table public.record_photos add column if not exists is_cover boolean not null default false;

-- 기록당 대표 사진은 최대 1장
create unique index if not exists record_photos_one_cover on public.record_photos (record_id) where is_cover;

-- p_order_index: 지정할 사진의 순서(0부터). submit_record 는 p_upload_ids 순서대로, update_record 는 keep → 새 업로드 순서로 0..n-1 을 매긴다.
-- null 이면 대표 지정을 해제한다.
create or replace function public.set_record_cover(p_record_id uuid, p_order_index int default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_profile(); r public.running_records;
begin
  select * into r from public.running_records where id = p_record_id for update;
  if r.id is null then perform app.fail('not_found'); end if;
  if r.user_id <> uid then perform app.fail('forbidden'); end if;
  if p_order_index is not null and not exists (select 1 from public.record_photos where record_id = r.id and order_index = p_order_index) then
    perform app.fail('invalid_input');
  end if;
  update public.record_photos set is_cover = false where record_id = r.id and is_cover;
  if p_order_index is not null then
    update public.record_photos set is_cover = true where record_id = r.id and order_index = p_order_index;
  end if;
end $$;


grant execute on function public.set_record_cover(uuid, int) to authenticated, service_role;
