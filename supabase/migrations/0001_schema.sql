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
