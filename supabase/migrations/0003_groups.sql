-- 0003_groups.sql : group lifecycle (create / invite / join / review / transfer / leave / settings)
-- plus ensure_group_week (week creation + eligibility snapshot), used by later migrations too.

create or replace function app.require_user() returns uuid
language plpgsql stable as $$
declare uid uuid := auth.uid();
begin
  if uid is null then perform app.fail('forbidden'); end if;
  return uid;
end $$;

create or replace function app.require_profile() returns uuid
language plpgsql stable security definer set search_path = public, app as $$
declare uid uuid := app.require_user();
begin
  if not exists (select 1 from public.profiles p where p.id = uid and p.onboarding_completed_at is not null) then
    perform app.fail('profile_incomplete');
  end if;
  return uid;
end $$;

create or replace function app.rate_limit(p_key text, p_max int, p_window interval) returns void
language plpgsql security definer set search_path = app as $$
declare ws timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01');
        c int;
begin
  insert into app.rate_limits (key, window_start, count) values (p_key, ws, 1)
  on conflict (key, window_start) do update set count = app.rate_limits.count + 1
  returning count into c;
  if c > p_max then perform app.fail('rate_limited'); end if;
  if random() < 0.01 then delete from app.rate_limits where window_start < now() - p_window * 2; end if;
end $$;

create or replace function app.request_ip() returns text
language plpgsql stable as $$
begin
  return coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', 'unknown');
exception when others then return 'unknown';
end $$;

create or replace function app.notify(p_user uuid, p_group uuid, p_event_key text, p_type text, p_target uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, group_id, event_key, type, target_id)
  values (p_user, p_group, p_event_key, p_type, p_target)
  on conflict (user_id, event_key) do nothing;
$$;

create or replace function app.group_admin_id(p_group_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from public.memberships where group_id = p_group_id and left_at is null and role = 'admin' limit 1;
$$;

create or replace function app.hash_code(p text) returns text
language sql immutable as $$
  select encode(extensions.digest(p, 'sha256'), 'hex');
$$;

create or replace function app.new_invite_code() returns text
language sql volatile as $$
  select substr(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=', '-_'), 1, 14);
$$;

-- ---------------------------------------------------------------------------
-- Week creation with eligibility snapshot (idempotent)
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

  insert into public.week_members (week_id, user_id, eligible, joined_this_week, left_during_week)
  select v_id, m.user_id,
         (m.joined_at < v_ws),
         (m.joined_at >= v_ws),
         (m.left_at is not null)
  from public.memberships m
  where m.group_id = p_group_id
    and m.joined_at < app.week_end_utc(p_week_start)
    and (m.left_at is null or m.left_at >= v_ws)
  on conflict (week_id, user_id) do nothing;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- create_group
-- ---------------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_target_meters int, p_penalty text)
returns table (group_id uuid, invite_code text)
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_profile();
  v_name text := btrim(p_name);
  v_penalty text := btrim(p_penalty);
  v_gid uuid;
  v_code text := app.new_invite_code();
  v_week date := app.week_start_of(app.now());
begin
  if v_name is null or char_length(v_name) not between 2 and 30 then perform app.fail('invalid_input'); end if;
  if v_penalty is null or char_length(v_penalty) not between 1 and 500 then perform app.fail('invalid_input'); end if;
  if p_target_meters is null or p_target_meters not between 1 and 1000000 then perform app.fail('invalid_input'); end if;

  perform pg_advisory_xact_lock(hashtext('user:' || uid::text));
  if exists (select 1 from public.memberships m where m.user_id = uid and m.left_at is null) then perform app.fail('already_in_group'); end if;
  if exists (select 1 from public.join_requests j where j.user_id = uid and j.status = 'pending') then perform app.fail('pending_request_exists'); end if;

  insert into public.groups (name, created_at) values (v_name, app.now()) returning id into v_gid;
  insert into public.group_settings (group_id, effective_week_start, target_meters, penalty) values (v_gid, v_week, p_target_meters, v_penalty);
  insert into public.memberships (group_id, user_id, role, joined_at) values (v_gid, uid, 'admin', app.now());
  insert into public.group_invites (group_id, code_hash) values (v_gid, app.hash_code(v_code));
  perform app.ensure_group_week(v_gid, v_week);

  group_id := v_gid; invite_code := v_code;
  return next;
end $$;

create or replace function public.regenerate_invite_code(p_group_id uuid) returns text
language plpgsql security definer set search_path = public, app as $$
declare v_code text := app.new_invite_code();
begin
  perform app.require_user();
  if not app.is_group_admin(p_group_id) then perform app.fail('forbidden'); end if;
  delete from public.group_invites where group_id = p_group_id;
  insert into public.group_invites (group_id, code_hash) values (p_group_id, app.hash_code(v_code));
  return v_code;
end $$;

create or replace function public.lookup_invite(p_code text)
returns table (group_id uuid, name text, target_meters int, penalty text, archived boolean)
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.rate_limit('invite:' || coalesce(auth.uid()::text, app.request_ip()), 20, interval '1 minute');
  return query
    select g.id, g.name, s.target_meters, s.penalty, (g.archived_at is not null)
    from public.group_invites i
    join public.groups g on g.id = i.group_id
    join lateral (
      select gs.target_meters, gs.penalty from public.group_settings gs
      where gs.group_id = g.id and gs.effective_week_start <= app.week_start_of(app.now())
      order by gs.effective_week_start desc limit 1
    ) s on true
    where i.code_hash = app.hash_code(p_code);
end $$;
grant execute on function public.lookup_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- join requests
-- ---------------------------------------------------------------------------
create or replace function public.request_join(p_code text) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_profile();
  v_gid uuid; v_archived timestamptz; v_id uuid; v_admin uuid;
begin
  perform app.rate_limit('join:' || uid::text, 10, interval '1 minute');
  select g.id, g.archived_at into v_gid, v_archived
  from public.group_invites i join public.groups g on g.id = i.group_id
  where i.code_hash = app.hash_code(p_code);
  if v_gid is null then perform app.fail('invalid_invite'); end if;
  if v_archived is not null then perform app.fail('group_archived'); end if;

  perform pg_advisory_xact_lock(hashtext('user:' || uid::text));
  if exists (select 1 from public.memberships m where m.user_id = uid and m.left_at is null) then perform app.fail('already_in_group'); end if;
  if exists (select 1 from public.join_requests j where j.user_id = uid and j.status = 'pending') then perform app.fail('pending_request_exists'); end if;

  insert into public.join_requests (group_id, user_id, created_at) values (v_gid, uid, app.now()) returning id into v_id;
  v_admin := app.group_admin_id(v_gid);
  if v_admin is not null then perform app.notify(v_admin, v_gid, 'join_request:' || v_id::text, 'join_request', v_id); end if;
  return v_id;
end $$;

create or replace function public.cancel_join_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_user(); n int;
begin
  update public.join_requests set status = 'cancelled', reviewed_at = app.now()
  where id = p_request_id and user_id = uid and status = 'pending';
  get diagnostics n = row_count;
  if n = 0 then perform app.fail('invalid_status'); end if;
end $$;

create or replace function public.review_join_request(p_request_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_user();
  r public.join_requests%rowtype;
  v_week uuid;
begin
  select * into r from public.join_requests where id = p_request_id for update;
  if r.id is null then perform app.fail('not_found'); end if;
  if not app.is_group_admin(r.group_id) then perform app.fail('forbidden'); end if;
  if r.status <> 'pending' then perform app.fail('invalid_status'); end if;

  if p_approve then
    if exists (select 1 from public.groups g where g.id = r.group_id and g.archived_at is not null) then perform app.fail('group_archived'); end if;
    perform pg_advisory_xact_lock(hashtext('user:' || r.user_id::text));
    if exists (select 1 from public.memberships m where m.user_id = r.user_id and m.left_at is null) then perform app.fail('already_in_group'); end if;
    insert into public.memberships (group_id, user_id, role, joined_at) values (r.group_id, r.user_id, 'member', app.now());
    v_week := app.ensure_group_week(r.group_id, app.week_start_of(app.now()));
    insert into public.week_members (week_id, user_id, eligible, joined_this_week, left_during_week)
    values (v_week, r.user_id, false, true, false)
    on conflict (week_id, user_id) do update set left_during_week = false;
    update public.join_requests set status = 'approved', reviewed_by = uid, reviewed_at = app.now() where id = r.id;
  else
    update public.join_requests set status = 'rejected', reviewed_by = uid, reviewed_at = app.now() where id = r.id;
  end if;
  perform app.notify(r.user_id, r.group_id, 'join_result:' || r.id::text, 'join_result', r.id);
end $$;

-- ---------------------------------------------------------------------------
-- admin transfer / leave / rename / settings
-- ---------------------------------------------------------------------------
create or replace function public.transfer_admin(p_group_id uuid, p_to_user_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_user(); n int;
begin
  if not app.is_group_admin(p_group_id) then perform app.fail('forbidden'); end if;
  if p_to_user_id = uid then return; end if;
  perform 1 from public.memberships where group_id = p_group_id and left_at is null and user_id in (uid, p_to_user_id) for update;
  if not exists (select 1 from public.memberships where group_id = p_group_id and left_at is null and user_id = p_to_user_id) then
    perform app.fail('not_member');
  end if;
  update public.memberships
    set role = case when user_id = p_to_user_id then 'admin'::public.membership_role else 'member'::public.membership_role end
  where group_id = p_group_id and left_at is null and user_id in (uid, p_to_user_id);
  get diagnostics n = row_count;
  if n <> 2 then perform app.fail('invalid_status'); end if;
end $$;

create or replace function public.leave_group() returns void
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_user();
  m public.memberships%rowtype;
  others int;
begin
  select * into m from public.memberships where user_id = uid and left_at is null for update;
  if m.id is null then perform app.fail('not_member'); end if;
  perform pg_advisory_xact_lock(hashtext('group:' || m.group_id::text));
  select count(*) into others from public.memberships where group_id = m.group_id and left_at is null and user_id <> uid;
  if m.role = 'admin' and others > 0 then perform app.fail('transfer_required'); end if;

  update public.memberships set left_at = app.now() where id = m.id;
  update public.week_members wm set left_during_week = true
  from public.group_weeks w
  where wm.week_id = w.id and w.group_id = m.group_id and wm.user_id = uid and w.state <> 'finalized';

  if others = 0 then
    update public.groups set archived_at = app.now() where id = m.group_id;
  end if;
end $$;

create or replace function public.rename_group(p_group_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_name text := btrim(p_name);
begin
  perform app.require_user();
  if not app.is_group_admin(p_group_id) then perform app.fail('forbidden'); end if;
  if v_name is null or char_length(v_name) not between 2 and 30 then perform app.fail('invalid_input'); end if;
  update public.groups set name = v_name where id = p_group_id;
end $$;

create or replace function public.schedule_group_settings(p_group_id uuid, p_target_meters int, p_penalty text) returns date
language plpgsql security definer set search_path = public, app as $$
declare v_next date := app.week_start_of(app.now()) + 7; v_penalty text := btrim(p_penalty);
begin
  perform app.require_user();
  if not app.is_group_admin(p_group_id) then perform app.fail('forbidden'); end if;
  if p_target_meters is null or p_target_meters not between 1 and 1000000 then perform app.fail('invalid_input'); end if;
  if v_penalty is null or char_length(v_penalty) not between 1 and 500 then perform app.fail('invalid_input'); end if;
  insert into public.group_settings (group_id, effective_week_start, target_meters, penalty)
  values (p_group_id, v_next, p_target_meters, v_penalty)
  on conflict (group_id, effective_week_start) do update set target_meters = excluded.target_meters, penalty = excluded.penalty;
  return v_next;
end $$;

-- helper for the UI: my membership state in one call
create or replace function public.get_my_group_state() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare uid uuid := auth.uid(); res jsonb;
begin
  if uid is null then return null; end if;
  select jsonb_build_object(
    'membership', (select jsonb_build_object('groupId', m.group_id, 'role', m.role, 'groupName', g.name, 'archived', g.archived_at is not null)
                   from public.memberships m join public.groups g on g.id = m.group_id where m.user_id = uid and m.left_at is null),
    'pendingRequest', (select jsonb_build_object('id', j.id, 'groupId', j.group_id, 'groupName', g.name, 'targetMeters', s.target_meters, 'penalty', s.penalty)
                       from public.join_requests j join public.groups g on g.id = j.group_id
                       join lateral (select gs.target_meters, gs.penalty from public.group_settings gs where gs.group_id = g.id order by gs.effective_week_start desc limit 1) s on true
                       where j.user_id = uid and j.status = 'pending'),
    'lastRejected', (select jsonb_build_object('groupName', g.name, 'reviewedAt', j.reviewed_at)
                     from public.join_requests j join public.groups g on g.id = j.group_id
                     where j.user_id = uid and j.status = 'rejected' order by j.reviewed_at desc limit 1)
  ) into res;
  return res;
end $$;

grant execute on function public.create_group(text, int, text), public.regenerate_invite_code(uuid), public.request_join(text),
  public.cancel_join_request(uuid), public.review_join_request(uuid, boolean), public.transfer_admin(uuid, uuid),
  public.leave_group(), public.rename_group(uuid, text), public.schedule_group_settings(uuid, int, text), public.get_my_group_state()
  to authenticated;
