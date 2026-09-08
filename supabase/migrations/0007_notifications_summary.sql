-- 0007_notifications_summary.sql : notification feed, weekly summary, one-time auto-show claim

create or replace function public.get_unread_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[]) returns void
language sql security definer set search_path = public, app as $$
  update public.notifications set read_at = app.now() where user_id = auth.uid() and read_at is null and id = any (p_ids);
$$;

create or replace function public.get_notifications(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare uid uuid := app.require_user(); res jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'type', n.type, 'targetId', n.target_id, 'groupId', n.group_id, 'readAt', n.read_at, 'createdAt', n.created_at,
    'link', case n.type
      when 'join_request' then case when app.is_group_admin(n.group_id) then '/admin?tab=requests' end
      when 'join_result' then '/'
      when 'record_submitted' then case when app.can_view_record(n.target_id) then '/records/' || n.target_id::text end
      when 'record_review' then case when app.can_view_record(n.target_id) then '/records/' || n.target_id::text end
      when 'record_expired' then case when app.can_view_record(n.target_id) then '/records/' || n.target_id::text end
      when 'review_reminder' then case when app.is_group_admin(n.group_id) then '/admin?tab=reviews' end
      when 'week_final' then case when app.can_view_week(n.target_id) then '/?week=' || (select week_start::text from public.group_weeks where id = n.target_id) end
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
  ) order by n.created_at desc), '[]'::jsonb)
  into res
  from (select * from public.notifications where user_id = uid order by created_at desc limit p_limit) n;
  return res;
end $$;

-- ---------------------------------------------------------------------------
-- Weekly summary
-- ---------------------------------------------------------------------------
create or replace function public.get_week_summary(p_group_id uuid, p_week_start date) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d jsonb; members jsonb; v_success int; v_eval int; v_total bigint;
begin
  d := public.get_week_dashboard(p_group_id, p_week_start);
  members := d -> 'members';
  select count(*) filter (where (m ->> 'outcome') in ('success', 'provisional_success')),
         count(*) filter (where (m ->> 'eligible')::boolean),
         coalesce(sum((m ->> 'approvedMeters')::int), 0)
    into v_success, v_eval, v_total
  from jsonb_array_elements(members) m;
  return d || jsonb_build_object(
    'successCount', v_success,
    'evaluatedCount', v_eval,
    'groupTotalMeters', coalesce((d -> 'week' ->> 'groupTotalMeters')::int, v_total::int),
    'myUserId', auth.uid()
  );
end $$;

create or replace function public.claim_summary_auto_show() returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_user();
  gid uuid;
  v_prev date := app.week_start_of(app.now()) - 7;
  v_week uuid;
  inserted boolean := false;
begin
  select group_id into gid from public.memberships where user_id = uid and left_at is null;
  if gid is null then return null; end if;
  perform app.reconcile_group(gid);
  select id into v_week from public.group_weeks where group_id = gid and week_start = v_prev;
  if v_week is null then
    if app.week_start_of((select created_at from public.groups where id = gid)) > v_prev then return null; end if;
    v_week := app.ensure_group_week(gid, v_prev);
    perform app.close_week_if_due(v_week);
  end if;
  if not exists (select 1 from public.week_members where week_id = v_week and user_id = uid) then return null; end if;
  insert into public.weekly_summary_views (week_id, user_id, claimed_at) values (v_week, uid, app.now())
  on conflict (week_id, user_id) do nothing;
  get diagnostics inserted = row_count;
  if not inserted then return null; end if;
  return public.get_week_summary(gid, v_prev);
end $$;

grant execute on function public.get_unread_count(), public.mark_notifications_read(uuid[]), public.get_notifications(int),
  public.get_week_summary(uuid, date), public.claim_summary_auto_show() to authenticated;
