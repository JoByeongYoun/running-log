-- 0017_likes_notifications.sql : 기록 좋아요 + 내 기록에 좋아요/댓글이 달리면 알림
--   좋아요 알림은 (기록, 누른 사람) 당 한 번만 보낸다. 눌렀다 취소를 반복해도 알림이 쌓이지 않는다.
--   본인이 자기 기록에 누른 좋아요·댓글은 알림을 만들지 않는다.

create table public.record_likes (
  record_id uuid not null references public.running_records (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (record_id, user_id)
);
create index record_likes_user_idx on public.record_likes (user_id);

alter table public.record_likes enable row level security;
grant select on public.record_likes to authenticated;
create policy record_likes_select on public.record_likes for select to authenticated using (app.can_view_record(record_id));

create or replace function public.toggle_like(p_record_id uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_profile(); r public.running_records%rowtype; v_liked boolean; v_count int;
begin
  select * into r from public.running_records where id = p_record_id;
  if r.id is null then perform app.fail('not_found'); end if;
  if not app.is_active_member(r.group_id) then perform app.fail('forbidden'); end if;
  perform app.rate_limit('like:' || uid::text, 60, interval '1 minute');
  delete from public.record_likes where record_id = r.id and user_id = uid;
  if found then
    v_liked := false;
  else
    insert into public.record_likes (record_id, user_id, created_at) values (r.id, uid, app.now());
    v_liked := true;
    if r.user_id <> uid then
      insert into public.notifications (user_id, group_id, event_key, type, target_id, created_at)
      values (r.user_id, r.group_id, 'record_like:' || r.id || ':' || uid, 'record_like', r.id, app.now())
      on conflict (user_id, event_key) do nothing;
    end if;
  end if;
  select count(*)::int into v_count from public.record_likes where record_id = r.id;
  return jsonb_build_object('liked', v_liked, 'count', v_count);
end $$;
grant execute on function public.toggle_like(uuid) to authenticated;

create or replace function public.add_comment(p_record_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_profile(); r public.running_records%rowtype; v_body text := btrim(coalesce(p_body, '')); v_id uuid;
begin
  select * into r from public.running_records where id = p_record_id;
  if r.id is null then perform app.fail('not_found'); end if;
  if not app.is_active_member(r.group_id) then perform app.fail('forbidden'); end if;
  if char_length(v_body) not between 1 and 1000 then perform app.fail('invalid_input'); end if;
  perform app.rate_limit('comment:' || uid::text, 30, interval '1 minute');
  insert into public.comments (record_id, user_id, body, created_at) values (p_record_id, uid, v_body, app.now()) returning id into v_id;
  if r.user_id <> uid then
    insert into public.notifications (user_id, group_id, event_key, type, target_id, created_at)
    values (r.user_id, r.group_id, 'record_comment:' || v_id, 'record_comment', v_id, app.now())
    on conflict (user_id, event_key) do nothing;
  end if;
  return v_id;
end $$;

-- 알림 뷰: record_like(target=기록, 누른 사람=event_key 3번째), record_comment(target=댓글)
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
      when 'record_like' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'record_comment' then (select '/records/' || c.record_id::text from public.comments c where c.id = n.target_id and app.can_view_record(c.record_id, p_uid))
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
      when 'record_like' then (select jsonb_build_object('nickname', p.nickname, 'meters', r.distance_meters)
                               from public.running_records r left join public.profiles p on p.id = nullif(split_part(n.event_key, ':', 3), '')::uuid
                               where r.id = n.target_id)
      when 'record_comment' then (select jsonb_build_object('nickname', p.nickname, 'meters', r.distance_meters, 'body', left(c.body, 60), 'deleted', c.deleted_at is not null)
                                  from public.comments c join public.running_records r on r.id = c.record_id left join public.profiles p on p.id = c.user_id
                                  where c.id = n.target_id)
      when 'review_reminder' then jsonb_build_object('phase', split_part(n.event_key, ':', 3))
      when 'week_final' then (select jsonb_build_object('weekStart', w.week_start, 'groupName', w.group_name_snapshot) from public.group_weeks w where w.id = n.target_id)
      else '{}'::jsonb end
  );
$$;

alter publication supabase_realtime add table public.record_likes;
