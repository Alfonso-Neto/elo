-- Secure, email-bound workspace enrollment for the homologation environment.
-- Raw invitation codes are returned once by the creation RPC and are never persisted.

create unique index if not exists workspace_members_one_active_student_idx
  on public.workspace_members (user_id)
  where role = 'student' and status = 'active';

create or replace function private.current_owned_workspace()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  result uuid;
begin
  if current_user_id is null then
    return null;
  end if;

  select workspace.id
    into result
  from public.workspaces as workspace
  join public.workspace_members as member
    on member.workspace_id = workspace.id
   and member.user_id = current_user_id
   and member.status = 'active'
   and member.role in ('owner', 'trainer')
  join public.profiles as profile
    on profile.id = current_user_id
   and profile.account_role = 'trainer'
  where workspace.owner_user_id = current_user_id
  limit 1;

  return result;
end;
$$;

revoke all on function private.current_owned_workspace() from public, anon, authenticated;

create or replace function public.get_my_active_membership()
returns table (
  workspace_id uuid,
  workspace_name text,
  membership_role public.workspace_role,
  trainer_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    member.workspace_id,
    workspace.name,
    member.role,
    owner_profile.display_name
  from public.workspace_members as member
  join public.workspaces as workspace on workspace.id = member.workspace_id
  join public.profiles as owner_profile on owner_profile.id = workspace.owner_user_id
  where member.user_id = (select auth.uid())
    and member.status = 'active'
  order by
    case member.role when 'owner' then 0 when 'trainer' then 1 else 2 end,
    member.joined_at nulls last,
    member.created_at
  limit 1;
$$;

revoke all on function public.get_my_active_membership() from public, anon;
grant execute on function public.get_my_active_membership() to authenticated;

create or replace function public.create_workspace_invitation(invited_email text)
returns table (
  invitation_code text,
  expires_at timestamptz,
  invited_email_normalized text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_workspace_id uuid;
  clean_email text := lower(btrim(coalesce(invited_email, '')));
  token_body text;
  raw_token text;
  expiration timestamptz := statement_timestamp() + interval '72 hours';
begin
  if current_user_id is null
    or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(clean_email) > 320 then
    raise exception using errcode = 'P0001', message = 'invitation_unavailable';
  end if;

  target_workspace_id := private.current_owned_workspace();
  if target_workspace_id is null then
    raise exception using errcode = 'P0001', message = 'invitation_unavailable';
  end if;

  -- Creating a new code intentionally revokes any older, unused code for this email.
  delete from public.workspace_invitations as stored_invitation
  where stored_invitation.workspace_id = target_workspace_id
    and stored_invitation.invited_email_normalized = clean_email
    and stored_invitation.accepted_at is null;

  token_body := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  raw_token := 'ELO-'
    || substr(token_body, 1, 4) || '-'
    || substr(token_body, 5, 4) || '-'
    || substr(token_body, 9, 4) || '-'
    || substr(token_body, 13, 4) || '-'
    || substr(token_body, 17, 4) || '-'
    || substr(token_body, 21, 4) || '-'
    || substr(token_body, 25, 4) || '-'
    || substr(token_body, 29, 4);

  insert into public.workspace_invitations (
    workspace_id,
    invited_email_normalized,
    token_hash,
    invited_by,
    expires_at
  ) values (
    target_workspace_id,
    clean_email,
    extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'),
    current_user_id,
    expiration
  );

  return query select raw_token, expiration, clean_email;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'invitation_unavailable';
end;
$$;

revoke all on function public.create_workspace_invitation(text) from public, anon;
grant execute on function public.create_workspace_invitation(text) to authenticated;

create or replace function public.accept_workspace_invitation(invitation_code text)
returns table (
  workspace_id uuid,
  workspace_name text,
  trainer_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  verified_email text;
  clean_code text := upper(btrim(coalesce(invitation_code, '')));
  invitation public.workspace_invitations%rowtype;
  accepted_workspace_name text;
  accepted_trainer_name text;
begin
  if current_user_id is null
    or clean_code !~ '^ELO-([A-F0-9]{4}-){7}[A-F0-9]{4}$' then
    raise exception using errcode = 'P0001', message = 'invitation_unavailable';
  end if;

  select lower(btrim(auth_user.email))
    into verified_email
  from auth.users as auth_user
  join public.profiles as profile
    on profile.id = auth_user.id
   and profile.account_role = 'student'
  where auth_user.id = current_user_id
    and auth_user.email_confirmed_at is not null;

  if verified_email is null then
    raise exception using errcode = 'P0001', message = 'invitation_unavailable';
  end if;

  select stored_invitation.*
    into invitation
  from public.workspace_invitations as stored_invitation
  where stored_invitation.token_hash = extensions.digest(convert_to(clean_code, 'UTF8'), 'sha256')
    and stored_invitation.accepted_at is null
    and stored_invitation.expires_at > statement_timestamp()
  for update;

  if invitation.id is null
    or invitation.invited_email_normalized <> verified_email
    or exists (
      select 1
      from public.workspace_members as existing_membership
      where existing_membership.user_id = current_user_id
        and existing_membership.status = 'active'
    ) then
    raise exception using errcode = 'P0001', message = 'invitation_unavailable';
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    status,
    joined_at
  ) values (
    invitation.workspace_id,
    current_user_id,
    'student',
    'active',
    statement_timestamp()
  );

  update public.workspace_invitations
  set accepted_by = current_user_id,
      accepted_at = statement_timestamp()
  where id = invitation.id
    and accepted_at is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'invitation_unavailable';
  end if;

  select workspace.name, owner_profile.display_name
    into accepted_workspace_name, accepted_trainer_name
  from public.workspaces as workspace
  join public.profiles as owner_profile on owner_profile.id = workspace.owner_user_id
  where workspace.id = invitation.workspace_id;

  return query select invitation.workspace_id, accepted_workspace_name, accepted_trainer_name;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'invitation_unavailable';
end;
$$;

revoke all on function public.accept_workspace_invitation(text) from public, anon;
grant execute on function public.accept_workspace_invitation(text) to authenticated;

create or replace function public.list_my_students()
returns table (
  user_id uuid,
  display_name text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select member.user_id, profile.display_name, member.joined_at
  from public.workspace_members as member
  join public.profiles as profile
    on profile.id = member.user_id
   and profile.account_role = 'student'
  where member.workspace_id = private.current_owned_workspace()
    and member.role = 'student'
    and member.status = 'active'
  order by profile.display_name, member.joined_at;
$$;

revoke all on function public.list_my_students() from public, anon;
grant execute on function public.list_my_students() to authenticated;

-- The hash column is never readable through the authenticated data API.
revoke select on public.workspace_invitations from authenticated;
grant select (
  id,
  workspace_id,
  invited_email_normalized,
  invited_by,
  expires_at,
  accepted_by,
  accepted_at,
  created_at
) on public.workspace_invitations to authenticated;
