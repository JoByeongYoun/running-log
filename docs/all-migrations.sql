-- ===== 0001_schema.sql =====
-- 0001_schema.sql : core schema, enums, constraints, time helpers, storage buckets
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Time helpers (all domain logic reads app.now())
-- ---------------------------------------------------------------------------
-- test_mode is only ever set to true by the local seed.sql (never applied by db push)
create table app.test_clock (
  id boolean primary key default true check (id),
  test_mode boolean not null default false,
  fake_now timestamptz
);
insert into app.test_clock (id) values (true);
grant select on app.test_clock to anon, authenticated, service_role;

create or replace function app.is_test_env() returns boolean
language sql stable as $$
  select coalesce((select test_mode from app.test_clock where id), false);
$$;

create or replace function app.now() returns timestamptz
language plpgsql stable as $$
declare v timestamptz;
begin
  if app.is_test_env() then
    select fake_now into v from app.test_clock where id;
    if v is not null then return v; end if;
  end if;
  return now();
end $$;

create or replace function app.set_fake_now(p timestamptz) returns void
language plpgsql security definer set search_path = app, public as $$
begin
  if not app.is_test_env() then
    raise exception 'fake_now disabled' using errcode = 'P0001';
  end if;
  update app.test_clock set fake_now = p where id;
end $$;
revoke all on function app.set_fake_now(timestamptz) from public, anon, authenticated;

create or replace function app.kst_today() returns date
language sql stable as $$
  select (app.now() at time zone 'Asia/Seoul')::date;
$$;

create or replace function app.week_start_of(p timestamptz) returns date
language sql immutable as $$
  select date_trunc('week', (p at time zone 'Asia/Seoul'))::date;
$$;

create or replace function app.week_start_utc(p_week_start date) returns timestamptz
language sql immutable as $$
  select (p_week_start::text || ' 00:00:00')::timestamp at time zone 'Asia/Seoul';
$$;

create or replace function app.week_end_utc(p_week_start date) returns timestamptz
language sql immutable as $$
  select app.week_start_utc(p_week_start + 7);
$$;

-- Monday 12:00 KST after the week ends
create or replace function app.week_close_deadline(p_week_start date) returns timestamptz
language sql immutable as $$
  select ((p_week_start + 7)::text || ' 12:00:00')::timestamp at time zone 'Asia/Seoul';
$$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function app.fail(p_code text) returns void
language plpgsql as $$
begin
  raise exception '%', p_code using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.membership_role as enum ('admin', 'member');
create type public.join_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.week_state as enum ('open', 'closing', 'finalized');
create type public.record_status as enum ('pending', 'approved', 'rejected', 'expired');
create type public.result_outcome as enum ('success', 'fail', 'not_evaluated');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text,
  avatar_path text,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_nickname_len check (nickname is null or char_length(nickname) between 2 and 20)
);
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 30),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger groups_touch before update on public.groups
  for each row execute function app.touch_updated_at();

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now()
);
create index group_invites_group_idx on public.group_invites (group_id);

create table public.group_settings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  effective_week_start date not null,
  target_meters integer not null check (target_meters between 1 and 1000000),
  penalty text not null check (char_length(penalty) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (group_id, effective_week_start)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.membership_role not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz
);
create unique index memberships_one_active_per_user on public.memberships (user_id) where left_at is null;
create unique index memberships_one_admin_per_group on public.memberships (group_id) where left_at is null and role = 'admin';
create index memberships_group_idx on public.memberships (group_id, left_at);

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.join_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index join_requests_one_pending_per_user on public.join_requests (user_id) where status = 'pending';
create index join_requests_group_status_idx on public.join_requests (group_id, status);

create table public.group_weeks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  week_start date not null,
  target_meters integer not null,
  penalty text not null,
  state public.week_state not null default 'open',
  group_name_snapshot text,
  group_total_meters integer,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, week_start),
  constraint group_weeks_monday check (extract(isodow from week_start) = 1)
);

create table public.week_members (
  week_id uuid not null references public.group_weeks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  eligible boolean not null default false,
  joined_this_week boolean not null default false,
  left_during_week boolean not null default false,
  primary key (week_id, user_id)
);

create table public.running_records (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_id uuid not null references public.group_weeks (id) on delete cascade,
  activity_date date not null,
  distance_meters integer not null check (distance_meters between 1 and 500000),
  memo text check (memo is null or char_length(memo) <= 1000),
  status public.record_status not null default 'pending',
  version integer not null default 1,
  submission_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, submission_key)
);
create index running_records_week_idx on public.running_records (week_id, user_id, status);
create index running_records_group_status_idx on public.running_records (group_id, status, created_at);
create trigger running_records_touch before update on public.running_records
  for each row execute function app.touch_updated_at();

create table public.record_photos (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.running_records (id) on delete cascade,
  storage_path text not null unique,
  order_index integer not null,
  unique (record_id, order_index)
);

create table public.pending_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  storage_path text not null unique,
  byte_size integer not null check (byte_size between 1 and 10485760),
  content_type text not null,
  ready boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index pending_uploads_user_idx on public.pending_uploads (user_id);

create table public.record_reviews (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.running_records (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  from_status public.record_status,
  to_status public.record_status not null,
  reason text,
  created_at timestamptz not null default now()
);
create index record_reviews_record_idx on public.record_reviews (record_id, created_at);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.running_records (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);
create index comments_record_idx on public.comments (record_id, created_at);

create table public.weekly_results (
  week_id uuid not null references public.group_weeks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  total_meters integer not null default 0,
  rank integer,
  outcome public.result_outcome not null,
  eligible boolean not null,
  nickname_snapshot text not null,
  primary key (week_id, user_id)
);

create table public.weekly_summary_views (
  week_id uuid not null references public.group_weeks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (week_id, user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  event_key text not null,
  type text not null,
  target_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table app.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create table app.maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error text
);

-- ---------------------------------------------------------------------------
-- Storage buckets (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('evidence', 'evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Test-only helpers (no-op outside app.env = 'test')
-- ---------------------------------------------------------------------------
create or replace function app.test_reset() returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_test_env() then raise exception 'test_reset disabled'; end if;
  truncate public.groups cascade;
  truncate public.profiles cascade;
  delete from auth.users where true;
  truncate app.rate_limits, app.maintenance_runs;
  update app.test_clock set fake_now = null where id;
end $$;
revoke all on function app.test_reset() from public, anon, authenticated;

grant execute on function app.now(), app.kst_today(), app.week_start_of(timestamptz),
  app.week_start_utc(date), app.week_end_utc(date), app.week_close_deadline(date), app.is_test_env()
  to anon, authenticated, service_role;

-- public wrappers so PostgREST can call them
create or replace function public.set_fake_now(p timestamptz) returns void
language sql security definer set search_path = app as $$ select app.set_fake_now(p); $$;
revoke all on function public.set_fake_now(timestamptz) from public, anon, authenticated;

create or replace function public.test_reset() returns void
language sql security definer set search_path = app as $$ select app.test_reset(); $$;
revoke all on function public.test_reset() from public, anon, authenticated;

create or replace function public.app_now() returns timestamptz
language sql stable as $$ select app.now(); $$;
create or replace function public.app_week_start_of(p timestamptz) returns date
language sql immutable as $$ select app.week_start_of(p); $$;
create or replace function public.app_week_close_deadline(p date) returns timestamptz
language sql immutable as $$ select app.week_close_deadline(p); $$;

-- ===== 0002_rls.sql =====
-- 0002_rls.sql : helper predicates, RLS for reads, storage policies.
-- All writes go through SECURITY DEFINER functions defined in later migrations.

create or replace function app.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function app.is_active_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = p_group_id and m.user_id = auth.uid() and m.left_at is null
  );
$$;

create or replace function app.is_group_admin(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = p_group_id and m.user_id = auth.uid() and m.left_at is null and m.role = 'admin'
  );
$$;

create or replace function app.current_group_id() returns uuid
language sql stable security definer set search_path = public as $$
  select m.group_id from public.memberships m
  where m.user_id = auth.uid() and m.left_at is null limit 1;
$$;

create or replace function app.can_view_profile(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_profile_id = auth.uid()
    or exists (
      select 1 from public.memberships mine
      join public.memberships theirs on theirs.group_id = mine.group_id and theirs.left_at is null
      where mine.user_id = auth.uid() and mine.left_at is null and theirs.user_id = p_profile_id
    )
    or exists (
      select 1 from public.join_requests jr
      join public.memberships adm on adm.group_id = jr.group_id and adm.user_id = auth.uid()
        and adm.left_at is null and adm.role = 'admin'
      where jr.user_id = p_profile_id and jr.status = 'pending'
    );
$$;

create or replace function app.can_view_group(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_active_member(p_group_id)
    or exists (select 1 from public.join_requests jr where jr.group_id = p_group_id and jr.user_id = auth.uid());
$$;

create or replace function app.can_view_week(p_week_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_weeks w where w.id = p_week_id and app.is_active_member(w.group_id));
$$;

create or replace function app.can_view_record(p_record_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.running_records r where r.id = p_record_id and app.is_active_member(r.group_id));
$$;

grant execute on function app.try_uuid(text), app.is_active_member(uuid), app.is_group_admin(uuid),
  app.current_group_id(), app.can_view_profile(uuid), app.can_view_group(uuid), app.can_view_week(uuid),
  app.can_view_record(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lock down write privileges for API roles (RLS + explicit grants)
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant update (nickname, avatar_path, onboarding_completed_at) on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_settings enable row level security;
alter table public.memberships enable row level security;
alter table public.join_requests enable row level security;
alter table public.group_weeks enable row level security;
alter table public.week_members enable row level security;
alter table public.running_records enable row level security;
alter table public.record_photos enable row level security;
alter table public.pending_uploads enable row level security;
alter table public.record_reviews enable row level security;
alter table public.comments enable row level security;
alter table public.weekly_results enable row level security;
alter table public.weekly_summary_views enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (app.can_view_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy groups_select on public.groups for select to authenticated using (app.can_view_group(id));
create policy group_settings_select on public.group_settings for select to authenticated using (app.is_active_member(group_id));
create policy memberships_select on public.memberships for select to authenticated using (app.is_active_member(group_id));
create policy join_requests_select on public.join_requests for select to authenticated
  using (user_id = auth.uid() or app.is_group_admin(group_id));
create policy group_weeks_select on public.group_weeks for select to authenticated using (app.is_active_member(group_id));
create policy week_members_select on public.week_members for select to authenticated using (app.can_view_week(week_id));
create policy running_records_select on public.running_records for select to authenticated using (app.is_active_member(group_id));
create policy record_photos_select on public.record_photos for select to authenticated using (app.can_view_record(record_id));
create policy pending_uploads_select on public.pending_uploads for select to authenticated using (user_id = auth.uid());
create policy record_reviews_select on public.record_reviews for select to authenticated using (app.can_view_record(record_id));
create policy comments_select on public.comments for select to authenticated using (app.can_view_record(record_id));
create policy weekly_results_select on public.weekly_results for select to authenticated using (app.can_view_week(week_id));
create policy weekly_summary_views_select on public.weekly_summary_views for select to authenticated using (user_id = auth.uid());
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage policies
--   avatars : {user_id}/{file}
--   evidence: {group_id}/{user_id}/{file}
-- ---------------------------------------------------------------------------
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and app.can_view_profile(app.try_uuid((storage.foldername(name))[1])));

create policy evidence_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[2] = auth.uid()::text
    and app.is_active_member(app.try_uuid((storage.foldername(name))[1]))
  );
create policy evidence_select on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and app.is_active_member(app.try_uuid((storage.foldername(name))[1])));
create policy evidence_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[2] = auth.uid()::text
    and not exists (select 1 from public.record_photos p where p.storage_path = name)
  );

-- ===== 0003_groups.sql =====
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
  -- two statements inside one transaction: demote first so the partial unique index never sees two admins
  update public.memberships set role = 'member' where group_id = p_group_id and left_at is null and user_id = uid;
  update public.memberships set role = 'admin' where group_id = p_group_id and left_at is null and user_id = p_to_user_id;
  get diagnostics n = row_count;
  if n <> 1 then perform app.fail('invalid_status'); end if;
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

-- ===== 0004_records.sql =====
-- 0004_records.sql : evidence uploads, record submission/edit/delete, admin review, comments

-- placeholder; replaced in 0006_weeks.sql with the real early-finalize logic
create or replace function app.after_review_check_week(p_week_id uuid) returns void
language plpgsql as $$ begin return; end $$;

create or replace function app.my_active_group() returns uuid
language plpgsql stable security definer set search_path = public, app as $$
declare gid uuid;
begin
  select group_id into gid from public.memberships where user_id = auth.uid() and left_at is null;
  if gid is null then perform app.fail('not_member'); end if;
  return gid;
end $$;

-- ---------------------------------------------------------------------------
-- Uploads
-- ---------------------------------------------------------------------------
create or replace function public.create_upload_slot(p_content_type text, p_byte_size int)
returns table (upload_id uuid, storage_path text)
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_profile(); gid uuid := app.my_active_group(); v_id uuid := gen_random_uuid(); v_path text;
begin
  perform app.rate_limit('upload:' || uid::text, 60, interval '1 minute');
  if p_content_type not in ('image/jpeg', 'image/png', 'image/webp') then perform app.fail('invalid_content_type'); end if;
  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760 then perform app.fail('file_too_large'); end if;
  if exists (select 1 from public.groups where id = gid and archived_at is not null) then perform app.fail('group_archived'); end if;
  v_path := gid::text || '/' || uid::text || '/' || v_id::text || case p_content_type when 'image/png' then '.png' when 'image/webp' then '.webp' else '.jpg' end;
  insert into public.pending_uploads (id, user_id, group_id, storage_path, byte_size, content_type, expires_at)
  values (v_id, uid, gid, v_path, p_byte_size, p_content_type, app.now() + interval '1 hour');
  upload_id := v_id; storage_path := v_path;
  return next;
end $$;

create or replace function public.mark_upload_ready(p_upload_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_user(); u public.pending_uploads%rowtype; v_size bigint;
begin
  select * into u from public.pending_uploads where id = p_upload_id and user_id = uid for update;
  if u.id is null then perform app.fail('upload_not_owned'); end if;
  select (metadata ->> 'size')::bigint into v_size from storage.objects where bucket_id = 'evidence' and name = u.storage_path;
  if v_size is null then perform app.fail('upload_missing'); end if;
  if v_size > 10485760 then perform app.fail('file_too_large'); end if;
  update public.pending_uploads set ready = true, byte_size = least(v_size, 10485760)::int where id = u.id;
end $$;

-- paths returned so the caller (service role) can remove orphaned objects
create or replace function public.cleanup_expired_uploads() returns setof text
language plpgsql security definer set search_path = public, app as $$
begin
  return query delete from public.pending_uploads where expires_at < app.now() returning storage_path;
end $$;
revoke all on function public.cleanup_expired_uploads() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Records
-- ---------------------------------------------------------------------------
create or replace function app.attach_uploads(p_record_id uuid, p_uid uuid, p_gid uuid, p_upload_ids uuid[], p_start_index int) returns void
language plpgsql security definer set search_path = public, app as $$
declare i int; u public.pending_uploads%rowtype;
begin
  for i in 1 .. coalesce(array_length(p_upload_ids, 1), 0) loop
    select * into u from public.pending_uploads where id = p_upload_ids[i] for update;
    if u.id is null or u.user_id <> p_uid or u.group_id <> p_gid then perform app.fail('upload_not_owned'); end if;
    if not u.ready then perform app.fail('upload_not_ready'); end if;
    if u.expires_at < app.now() then perform app.fail('upload_expired'); end if;
    if not exists (select 1 from storage.objects where bucket_id = 'evidence' and name = u.storage_path) then perform app.fail('upload_missing'); end if;
    insert into public.record_photos (record_id, storage_path, order_index) values (p_record_id, u.storage_path, p_start_index + i - 1);
    delete from public.pending_uploads where id = u.id;
  end loop;
end $$;

create or replace function public.submit_record(p_submission_key text, p_distance_meters int, p_memo text, p_upload_ids uuid[], p_client_date date default null)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_profile();
  gid uuid;
  v_id uuid;
  v_today date := app.kst_today();
  v_week_start date := app.week_start_of(app.now());
  v_week uuid;
  v_state public.week_state;
  v_admin uuid;
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
begin
  if p_submission_key is null or char_length(p_submission_key) not between 8 and 64 then perform app.fail('invalid_input'); end if;
  perform pg_advisory_xact_lock(hashtext('submit:' || uid::text || ':' || p_submission_key));
  select id into v_id from public.running_records where user_id = uid and submission_key = p_submission_key;
  if v_id is not null then return v_id; end if;

  gid := app.my_active_group();
  if exists (select 1 from public.groups where id = gid and archived_at is not null) then perform app.fail('group_archived'); end if;
  if p_client_date is not null and p_client_date <> v_today then perform app.fail('date_changed'); end if;
  if p_distance_meters is null or p_distance_meters not between 1 and 500000 then perform app.fail('invalid_input'); end if;
  if v_memo is not null and char_length(v_memo) > 1000 then perform app.fail('invalid_input'); end if;
  if coalesce(array_length(p_upload_ids, 1), 0) < 1 then perform app.fail('photos_required'); end if;
  if array_length(p_upload_ids, 1) > 5 then perform app.fail('too_many_photos'); end if;
  perform app.rate_limit('record:' || uid::text, 30, interval '1 minute');

  v_week := app.ensure_group_week(gid, v_week_start);
  select state into v_state from public.group_weeks where id = v_week for update;
  if v_state <> 'open' then perform app.fail('week_not_open'); end if;

  insert into public.running_records (group_id, user_id, week_id, activity_date, distance_meters, memo, status, submission_key, created_at, updated_at)
  values (gid, uid, v_week, v_today, p_distance_meters, v_memo, 'pending', p_submission_key, app.now(), app.now())
  returning id into v_id;
  perform app.attach_uploads(v_id, uid, gid, p_upload_ids, 0);
  insert into public.record_reviews (record_id, actor_id, from_status, to_status, created_at) values (v_id, uid, null, 'pending', app.now());

  v_admin := app.group_admin_id(gid);
  if v_admin is not null and v_admin <> uid then
    perform app.notify(v_admin, gid, 'record_submitted:' || v_id::text, 'record_submitted', v_id);
  end if;
  return v_id;
end $$;

create or replace function app.editable_record(p_record_id uuid, p_uid uuid) returns public.running_records
language plpgsql security definer set search_path = public, app as $$
declare r public.running_records%rowtype; v_state public.week_state;
begin
  select * into r from public.running_records where id = p_record_id for update;
  if r.id is null then perform app.fail('not_found'); end if;
  if r.user_id <> p_uid then perform app.fail('forbidden'); end if;
  if r.status not in ('pending', 'rejected') then perform app.fail('invalid_status'); end if;
  select state into v_state from public.group_weeks where id = r.week_id;
  if r.activity_date <> app.kst_today() or v_state <> 'open' then perform app.fail('edit_window_closed'); end if;
  return r;
end $$;

-- returns storage paths removed so the caller can delete objects
create or replace function public.update_record(p_record_id uuid, p_distance_meters int, p_memo text, p_keep_photo_ids uuid[], p_upload_ids uuid[], p_expected_version int)
returns setof text
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_profile();
  r public.running_records;
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
  v_keep int := coalesce(array_length(p_keep_photo_ids, 1), 0);
  v_new int := coalesce(array_length(p_upload_ids, 1), 0);
  removed text[];
  i int; pid uuid;
begin
  r := app.editable_record(p_record_id, uid);
  if r.version <> p_expected_version then perform app.fail('stale_version'); end if;
  if p_distance_meters is null or p_distance_meters not between 1 and 500000 then perform app.fail('invalid_input'); end if;
  if v_memo is not null and char_length(v_memo) > 1000 then perform app.fail('invalid_input'); end if;
  if v_keep + v_new < 1 then perform app.fail('photos_required'); end if;
  if v_keep + v_new > 5 then perform app.fail('too_many_photos'); end if;
  if v_keep > 0 and exists (select 1 from unnest(p_keep_photo_ids) k where not exists (select 1 from public.record_photos p where p.id = k and p.record_id = r.id)) then
    perform app.fail('invalid_input');
  end if;

  select coalesce(array_agg(storage_path), '{}') into removed from public.record_photos where record_id = r.id and not (id = any (coalesce(p_keep_photo_ids, '{}')));
  delete from public.record_photos where record_id = r.id and not (id = any (coalesce(p_keep_photo_ids, '{}')));
  -- renumber kept photos in given order (temporarily offset to avoid unique clash)
  update public.record_photos set order_index = order_index + 1000 where record_id = r.id;
  for i in 1 .. v_keep loop
    pid := p_keep_photo_ids[i];
    update public.record_photos set order_index = i - 1 where id = pid;
  end loop;
  perform app.attach_uploads(r.id, uid, r.group_id, p_upload_ids, v_keep);

  update public.running_records set distance_meters = p_distance_meters, memo = v_memo, status = 'pending', version = version + 1, updated_at = app.now()
  where id = r.id;
  insert into public.record_reviews (record_id, actor_id, from_status, to_status, created_at) values (r.id, uid, r.status, 'pending', app.now());
  return query select unnest(removed);
end $$;

create or replace function public.delete_record(p_record_id uuid) returns setof text
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_user(); r public.running_records; removed text[];
begin
  r := app.editable_record(p_record_id, uid);
  select coalesce(array_agg(storage_path), '{}') into removed from public.record_photos where record_id = r.id;
  delete from public.running_records where id = r.id;
  return query select unnest(removed);
end $$;

-- ---------------------------------------------------------------------------
-- Admin review
-- ---------------------------------------------------------------------------
create or replace function public.review_record(p_record_id uuid, p_action text, p_reason text, p_expected_version int) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_user();
  r public.running_records%rowtype;
  w public.group_weeks%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_to public.record_status;
begin
  select * into r from public.running_records where id = p_record_id for update;
  if r.id is null then perform app.fail('not_found'); end if;
  if not app.is_group_admin(r.group_id) then perform app.fail('forbidden'); end if;
  select * into w from public.group_weeks where id = r.week_id for update;
  if w.state = 'finalized' then perform app.fail('week_finalized'); end if;
  if app.now() >= app.week_close_deadline(w.week_start) then perform app.fail('review_closed'); end if;
  if r.version <> p_expected_version then perform app.fail('stale_version'); end if;

  if p_action = 'approve' then
    if r.status <> 'pending' then perform app.fail('invalid_status'); end if;
    v_to := 'approved';
  elsif p_action = 'reject' then
    if r.status <> 'pending' then perform app.fail('invalid_status'); end if;
    if v_reason is null then perform app.fail('reason_required'); end if;
    v_to := 'rejected';
  elsif p_action = 'unapprove' then
    if r.status <> 'approved' then perform app.fail('invalid_status'); end if;
    if v_reason is null then perform app.fail('reason_required'); end if;
    v_to := 'pending';
  else
    perform app.fail('invalid_input');
  end if;

  update public.running_records set status = v_to, updated_at = app.now() where id = r.id;
  insert into public.record_reviews (record_id, actor_id, from_status, to_status, reason, created_at) values (r.id, uid, r.status, v_to, v_reason, app.now());
  if r.user_id <> uid then
    perform app.notify(r.user_id, r.group_id, 'record_review:' || r.id::text || ':' || r.version::text || ':' || v_to::text || ':' || extract(epoch from app.now())::bigint::text, 'record_review', r.id);
  end if;
  perform app.after_review_check_week(r.week_id);
end $$;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
create or replace function public.add_comment(p_record_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_profile(); gid uuid; v_body text := btrim(coalesce(p_body, '')); v_id uuid;
begin
  select group_id into gid from public.running_records where id = p_record_id;
  if gid is null then perform app.fail('not_found'); end if;
  if not app.is_active_member(gid) then perform app.fail('forbidden'); end if;
  if char_length(v_body) not between 1 and 1000 then perform app.fail('invalid_input'); end if;
  perform app.rate_limit('comment:' || uid::text, 30, interval '1 minute');
  insert into public.comments (record_id, user_id, body, created_at) values (p_record_id, uid, v_body, app.now()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_comment(p_comment_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare uid uuid := app.require_user(); c public.comments%rowtype; gid uuid;
begin
  select * into c from public.comments where id = p_comment_id for update;
  if c.id is null then perform app.fail('not_found'); end if;
  select group_id into gid from public.running_records where id = c.record_id;
  if c.user_id <> uid and not app.is_group_admin(gid) then perform app.fail('forbidden'); end if;
  if c.deleted_at is not null then return; end if;
  update public.comments set deleted_at = app.now(), deleted_by = uid, body = '' where id = c.id;
end $$;

grant execute on function public.create_upload_slot(text, int), public.mark_upload_ready(uuid),
  public.submit_record(text, int, text, uuid[], date), public.update_record(uuid, int, text, uuid[], uuid[], int),
  public.delete_record(uuid), public.review_record(uuid, text, text, int), public.add_comment(uuid, text), public.delete_comment(uuid)
  to authenticated;

-- ===== 0005_weeks.sql =====
-- 0005_weeks.sql : week closing, expiry, finalization, maintenance (idempotent, server-time based)

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

  insert into public.weekly_results (week_id, user_id, total_meters, rank, outcome, eligible, nickname_snapshot)
  select w.id, t.user_id, t.total,
         case when t.eligible then rank() over (partition by t.eligible order by t.total desc) end,
         case when not t.eligible then 'not_evaluated'::public.result_outcome
              when t.total >= w.target_meters then 'success'::public.result_outcome
              else 'fail'::public.result_outcome end,
         t.eligible,
         coalesce(p.nickname, '(이름 없음)')
  from (
    select wm.user_id, wm.eligible,
           coalesce((select sum(r.distance_meters) from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'approved'), 0)::int as total
    from public.week_members wm where wm.week_id = w.id
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

create or replace function app.close_week_if_due(p_week_id uuid) returns text
language plpgsql security definer set search_path = public, app as $$
declare
  w public.group_weeks%rowtype;
  v_now timestamptz := app.now();
  v_end timestamptz;
  v_deadline timestamptz;
  v_pending int;
  v_admin uuid;
begin
  select * into w from public.group_weeks where id = p_week_id for update;
  if w.id is null or w.state = 'finalized' then return 'noop'; end if;
  v_end := app.week_end_utc(w.week_start);
  v_deadline := app.week_close_deadline(w.week_start);
  if v_now < v_end then return 'open'; end if;

  select count(*) into v_pending from public.running_records where week_id = w.id and status = 'pending';
  v_admin := app.group_admin_id(w.group_id);

  if w.state = 'open' then
    if v_pending = 0 then
      perform app.finalize_week(w.id);
      return 'finalized';
    end if;
    update public.group_weeks set state = 'closing' where id = w.id;
    if v_admin is not null then perform app.notify(v_admin, w.group_id, 'review_reminder:' || w.id::text || ':00', 'review_reminder', w.id); end if;
  end if;

  if v_pending = 0 or v_now >= v_deadline then
    perform app.finalize_week(w.id);
    return 'finalized';
  end if;
  if v_now >= v_end + interval '11 hours' and v_admin is not null then
    perform app.notify(v_admin, w.group_id, 'review_reminder:' || w.id::text || ':11', 'review_reminder', w.id);
  end if;
  return 'closing';
end $$;

-- called at the end of review_record
create or replace function app.after_review_check_week(p_week_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.close_week_if_due(p_week_id);
end $$;

-- per-group reconciliation used on reads: ensure current week, close due weeks
create or replace function app.reconcile_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare rec record; v_archived timestamptz;
begin
  select archived_at into v_archived from public.groups where id = p_group_id;
  if v_archived is null then
    perform app.ensure_group_week(p_group_id, app.week_start_of(app.now()));
  end if;
  for rec in select id from public.group_weeks where group_id = p_group_id and state <> 'finalized' and app.week_end_utc(week_start) <= app.now() order by week_start loop
    perform app.close_week_if_due(rec.id);
  end loop;
end $$;

create or replace function public.run_week_maintenance() returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  run_id uuid;
  g record; wk record;
  v_created int := 0; v_finalized int := 0; v_closing int := 0;
  v_ids uuid[] := '{}';
  v_res text;
  v_week date := app.week_start_of(app.now());
begin
  insert into app.maintenance_runs (started_at) values (now()) returning id into run_id;
  begin
    for g in select id, archived_at from public.groups loop
      perform pg_advisory_xact_lock(hashtext('group:' || g.id::text));
      if g.archived_at is null and not exists (select 1 from public.group_weeks where group_id = g.id and week_start = v_week) then
        perform app.ensure_group_week(g.id, v_week);
        v_created := v_created + 1;
      end if;
      for wk in select id from public.group_weeks where group_id = g.id and state <> 'finalized' and app.week_end_utc(week_start) <= app.now() order by week_start loop
        v_res := app.close_week_if_due(wk.id);
        if v_res = 'finalized' then v_finalized := v_finalized + 1; v_ids := v_ids || wk.id;
        elsif v_res = 'closing' then v_closing := v_closing + 1; v_ids := v_ids || wk.id; end if;
      end loop;
    end loop;
    delete from public.pending_uploads where expires_at < app.now() - interval '1 day';
  exception when others then
    update app.maintenance_runs set finished_at = now(), error = sqlerrm where id = run_id;
    raise;
  end;
  update app.maintenance_runs set finished_at = now(),
    result = jsonb_build_object('createdWeeks', v_created, 'finalized', v_finalized, 'closing', v_closing, 'weekIds', to_jsonb(v_ids))
  where id = run_id;
  return jsonb_build_object('createdWeeks', v_created, 'finalized', v_finalized, 'closing', v_closing, 'weekIds', to_jsonb(v_ids));
end $$;
revoke all on function public.run_week_maintenance() from public, anon, authenticated;
grant execute on function public.run_week_maintenance() to service_role;

-- ===== 0006_dashboard.sql =====
-- 0006_dashboard.sql : weekly dashboard read model

create or replace function public.get_available_weeks(p_group_id uuid) returns date[]
language plpgsql stable security definer set search_path = public, app as $$
declare v_from date; v_to date := app.week_start_of(app.now()); out date[] := '{}'; d date;
begin
  if not app.is_active_member(p_group_id) then perform app.fail('forbidden'); end if;
  select app.week_start_of(created_at) into v_from from public.groups where id = p_group_id;
  d := v_from;
  while d <= v_to loop out := out || d; d := d + 7; end loop;
  return out;
end $$;

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
    select wm.user_id, wm.eligible, wm.joined_this_week, wm.left_during_week,
           coalesce(wr.nickname_snapshot, p.nickname, '(이름 없음)') as nickname,
           p.avatar_path,
           (select coalesce(sum(r.distance_meters), 0)::int from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'approved') as approved,
           (select coalesce(sum(r.distance_meters), 0)::int from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'pending') as pending,
           wr.rank as final_rank, wr.outcome as final_outcome, wr.total_meters as final_total,
           exists (select 1 from public.memberships m where m.group_id = p_group_id and m.user_id = wm.user_id and m.left_at is null) as active_now
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

grant execute on function public.get_available_weeks(uuid), public.get_week_dashboard(uuid, date) to authenticated;

-- ===== 0007_notifications_summary.sql =====
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

