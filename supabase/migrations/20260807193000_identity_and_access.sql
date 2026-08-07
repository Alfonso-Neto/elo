create extension if not exists pgcrypto with schema extensions;

create type public.account_role as enum ('trainer', 'student');
create type public.workspace_role as enum ('owner', 'trainer', 'student');
create type public.membership_status as enum ('invited', 'active', 'suspended', 'removed');
create type public.trainer_verification_status as enum ('unverified', 'pending', 'verified', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_role public.account_role not null,
  display_name text not null check (char_length(display_name) between 2 and 80),
  avatar_path text,
  timezone text not null default 'America/Sao_Paulo' check (char_length(timezone) between 3 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trainer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  cref_number text not null check (char_length(cref_number) between 4 and 24),
  cref_state text not null check (cref_state ~ '^[A-Z]{2}$'),
  verification_status public.trainer_verification_status not null default 'unverified',
  studio_name text check (studio_name is null or char_length(studio_name) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 80),
  timezone text not null default 'America/Sao_Paulo' check (char_length(timezone) between 3 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null,
  status public.membership_status not null default 'active',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  unique (workspace_id, user_id, role)
);

create index workspace_members_user_idx on public.workspace_members(user_id, status);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_email_normalized text not null check (invited_email_normalized = lower(trim(invited_email_normalized))),
  token_hash bytea not null unique,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((accepted_at is null and accepted_by is null) or (accepted_at is not null and accepted_by is not null))
);

create unique index workspace_invitations_active_email_idx
  on public.workspace_invitations(workspace_id, invited_email_normalized)
  where accepted_at is null;

create schema if not exists private;
revoke all on schema private from public, anon;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function private.touch_updated_at();
create trigger trainer_profiles_touch_updated_at before update on public.trainer_profiles
for each row execute function private.touch_updated_at();
create trigger workspaces_touch_updated_at before update on public.workspaces
for each row execute function private.touch_updated_at();
create trigger workspace_members_touch_updated_at before update on public.workspace_members
for each row execute function private.touch_updated_at();

create or replace function private.prevent_profile_authority_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.account_role <> old.account_role then
    raise exception 'profile authority fields are immutable';
  end if;
  return new;
end;
$$;

create trigger profiles_keep_authority before update on public.profiles
for each row execute function private.prevent_profile_authority_change();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'requested_role', 'student');
  clean_name text := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  clean_cref text := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'cref_number', ''), '[^0-9A-Z/-]', '', 'g'));
  clean_state text := upper(trim(coalesce(new.raw_user_meta_data ->> 'cref_state', '')));
  new_workspace_id uuid;
begin
  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'invalid display name';
  end if;

  if requested_role = 'trainer' then
    if char_length(clean_cref) < 4 or clean_state !~ '^[A-Z]{2}$' then
      raise exception 'invalid professional registration';
    end if;

    insert into public.profiles (id, account_role, display_name)
    values (new.id, 'trainer', clean_name);

    insert into public.trainer_profiles (user_id, cref_number, cref_state, studio_name)
    values (
      new.id,
      clean_cref,
      clean_state,
      nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'studio_name', '')), 80), '')
    );

    insert into public.workspaces (owner_user_id, name)
    values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'studio_name'), ''), 'Espaço de ' || clean_name), 80))
    returning id into new_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
    values (new_workspace_id, new.id, 'owner', 'active', now());
  else
    insert into public.profiles (id, account_role, display_name)
    values (new.id, 'student', clean_name);
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

create or replace function private.is_workspace_trainer(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = (select auth.uid())
      and status = 'active'
      and role in ('owner', 'trainer')
  );
$$;

create or replace function private.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = (select auth.uid()) or exists (
    select 1
    from public.workspace_members viewer
    join public.workspace_members target on target.workspace_id = viewer.workspace_id
    where viewer.user_id = (select auth.uid())
      and viewer.status = 'active'
      and target.user_id = target_user_id
      and target.status = 'active'
      and (viewer.role in ('owner', 'trainer') or target.role in ('owner', 'trainer'))
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_trainer(uuid) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.trainer_profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;

create policy profiles_select_authorized on public.profiles
for select to authenticated
using (private.can_view_profile(id));

create policy profiles_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy trainer_profiles_select_authorized on public.trainer_profiles
for select to authenticated
using (private.can_view_profile(user_id));

create policy trainer_profiles_update_self on public.trainer_profiles
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy workspaces_select_member on public.workspaces
for select to authenticated
using (private.is_workspace_member(id));

create policy workspaces_update_trainer on public.workspaces
for update to authenticated
using (private.is_workspace_trainer(id))
with check (private.is_workspace_trainer(id));

create policy workspace_members_select_scoped on public.workspace_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_workspace_trainer(workspace_id)
  or (private.is_workspace_member(workspace_id) and role in ('owner', 'trainer'))
);

create policy invitations_select_trainer on public.workspace_invitations
for select to authenticated
using (private.is_workspace_trainer(workspace_id));

revoke all on public.profiles, public.trainer_profiles, public.workspaces, public.workspace_members, public.workspace_invitations from anon, authenticated;
grant select on public.profiles, public.trainer_profiles, public.workspaces, public.workspace_members, public.workspace_invitations to authenticated;
grant update (display_name, avatar_path, timezone) on public.profiles to authenticated;
grant update (cref_number, cref_state, studio_name) on public.trainer_profiles to authenticated;
grant update (name, timezone) on public.workspaces to authenticated;
