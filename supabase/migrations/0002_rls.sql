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
