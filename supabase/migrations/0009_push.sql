-- 0009_push.sql : Web Push 구독, 알림 웹훅(pg_net), 발송 페이로드 RPC
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 환경별 설정 (마이그레이션에 값 없음; seed.sql 또는 배포 SQL로 채움)
-- ---------------------------------------------------------------------------
create table if not exists app.settings (
  key text primary key,
  value text not null
);

-- 테스트/로컬 편의: 둘 다 null이면 삭제
create or replace function public.test_set_push_settings(p_url text, p_secret text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if p_url is null and p_secret is null then
    delete from app.settings where key in ('push_webhook_url', 'push_webhook_secret');
    return;
  end if;
  insert into app.settings (key, value) values ('push_webhook_url', p_url), ('push_webhook_secret', p_secret)
  on conflict (key) do update set value = excluded.value;
end $$;
revoke execute on function public.test_set_push_settings(text, text) from public, anon, authenticated;
grant execute on function public.test_set_push_settings(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 구독
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) returns void
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_user();
begin
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then perform app.fail('invalid_input'); end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- uid 인자 권한 함수 (auth.uid() 대신 명시 uid; 발송 경로에서 사용)
-- ---------------------------------------------------------------------------
create or replace function app.is_active_member(p_group_id uuid, p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.group_id = p_group_id and m.user_id = p_uid and m.left_at is null);
$$;
create or replace function app.is_group_admin(p_group_id uuid, p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.group_id = p_group_id and m.user_id = p_uid and m.left_at is null and m.role = 'admin');
$$;
create or replace function app.can_view_week(p_week_id uuid, p_uid uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.group_weeks w where w.id = p_week_id and app.is_active_member(w.group_id, p_uid));
$$;
create or replace function app.can_view_record(p_record_id uuid, p_uid uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.running_records r where r.id = p_record_id and app.is_active_member(r.group_id, p_uid));
$$;

-- ---------------------------------------------------------------------------
-- 알림 뷰 (get_notifications 와 get_push_payload 공용)
-- ---------------------------------------------------------------------------
create or replace function app.notification_view(n public.notifications, p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id', n.id, 'type', n.type, 'targetId', n.target_id, 'groupId', n.group_id, 'readAt', n.read_at, 'createdAt', n.created_at,
    'link', case n.type
      when 'join_request' then case when app.is_group_admin(n.group_id, p_uid) then '/admin?tab=requests' end
      when 'join_result' then '/'
      when 'record_submitted' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'record_review' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'record_expired' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'review_reminder' then case when app.is_group_admin(n.group_id, p_uid) then '/admin?tab=reviews' end
      when 'week_final' then case when app.can_view_week(n.target_id, p_uid) then '/?week=' || (select week_start::text from public.group_weeks where id = n.target_id) end
    end,
    'meta', case n.type
      when 'join_request' then (select jsonb_build_object('nickname', p.nickname, 'groupName', g.name) from public.join_requests j join public.profiles p on p.id = j.user_id join public.groups g on g.id = j.group_id where j.id = n.target_id)
      when 'join_result' then (select jsonb_build_object('status', j.status, 'groupName', g.name) from public.join_requests j join public.groups g on g.id = j.group_id where j.id = n.target_id)
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

create or replace function public.get_notifications(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare uid uuid := app.require_user(); res jsonb;
begin
  select coalesce(jsonb_agg(app.notification_view(n, uid) order by n.created_at desc), '[]'::jsonb)
  into res
  from (select * from public.notifications where user_id = uid order by created_at desc limit p_limit) n;
  return res;
end $$;

create or replace function public.get_push_payload(p_notification_id uuid) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object('userId', n.user_id, 'view', app.notification_view(n, n.user_id))
  from public.notifications n where n.id = p_notification_id;
$$;
revoke execute on function public.get_push_payload(uuid) from public, anon, authenticated;
grant execute on function public.get_push_payload(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 웹훅 트리거
-- ---------------------------------------------------------------------------
create or replace function app.push_webhook() returns trigger
language plpgsql security definer set search_path = public, app, extensions as $$
declare v_url text; v_secret text;
begin
  select value into v_url from app.settings where key = 'push_webhook_url';
  select value into v_secret from app.settings where key = 'push_webhook_secret';
  if v_url is null or v_secret is null then return new; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('notificationId', new.id)
  );
  return new;
exception when others then
  return new;
end $$;

create trigger notifications_push_webhook after insert on public.notifications
for each row execute function app.push_webhook();
