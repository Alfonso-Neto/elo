-- Professional verification is a server-owned lifecycle. A submitted CREF is
-- never equivalent to an approved CREF, and the browser cannot make review
-- decisions. The older ai_workspace_access table is retained as inert legacy
-- data; it is never promoted into professional or AI authority by this gate.

alter table public.trainer_profiles
  add column verification_submitted_at timestamptz,
  add column verification_decided_at timestamptz,
  add column verification_rejection_reason text;

-- Earlier schemas stored only the enum. Preserve those states without
-- pretending their historical decision was produced by this new workflow.
update public.trainer_profiles
set verification_submitted_at = case
      when verification_status in ('pending','verified','rejected')
        then coalesce(updated_at, created_at, statement_timestamp())
      else null
    end,
    verification_decided_at = case
      when verification_status in ('verified','rejected')
        then coalesce(updated_at, created_at, statement_timestamp())
      else null
    end,
    verification_rejection_reason = case
      when verification_status = 'rejected'
        then 'Revisão anterior importada; confira os dados e envie novamente.'
      else null
    end;

alter table public.trainer_profiles
  add constraint trainer_profiles_cref_canonical_check check (
    cref_number = upper(btrim(cref_number))
    and cref_number ~ '^[0-9A-Z/-]{4,24}$'
  ),
  add constraint trainer_profiles_verification_rejection_reason_check check (
    verification_rejection_reason is null
    or (
      verification_rejection_reason = btrim(verification_rejection_reason)
      and char_length(verification_rejection_reason) between 2 and 500
      and verification_rejection_reason !~ '[[:cntrl:]]'
    )
  ),
  add constraint trainer_profiles_verification_lifecycle_check check (
    (
      verification_status = 'unverified'
      and verification_submitted_at is null
      and verification_decided_at is null
      and verification_rejection_reason is null
    )
    or (
      verification_status = 'pending'
      and verification_submitted_at is not null
      and verification_decided_at is null
      and verification_rejection_reason is null
    )
    or (
      verification_status = 'verified'
      and verification_submitted_at is not null
      and verification_decided_at is not null
      and verification_decided_at >= verification_submitted_at
      and verification_rejection_reason is null
    )
    or (
      verification_status = 'rejected'
      and verification_submitted_at is not null
      and verification_decided_at is not null
      and verification_decided_at >= verification_submitted_at
      and verification_rejection_reason is not null
    )
  );

-- This intentionally fails migration preflight when two existing approved
-- profiles claim the same canonical registration. Operations must investigate;
-- a migration must never choose a winner silently.
create unique index trainer_profiles_one_verified_cref_idx
  on public.trainer_profiles (cref_state, cref_number)
  where verification_status = 'verified';

create table private.trainer_verification_events (
  id uuid primary key default gen_random_uuid(),
  trainer_user_id uuid not null references public.trainer_profiles(user_id) on delete cascade,
  action text not null check (action in ('baseline','submitted','verified','rejected')),
  previous_status public.trainer_verification_status not null,
  next_status public.trainer_verification_status not null,
  actor_scope text not null check (
    char_length(actor_scope) between 3 and 96
    and actor_scope !~ '[[:cntrl:]]'
  ),
  reviewer_reference text check (
    reviewer_reference is null
    or (
      reviewer_reference = btrim(reviewer_reference)
      and char_length(reviewer_reference) between 3 and 160
      and reviewer_reference !~ '[[:cntrl:]]'
    )
  ),
  idempotency_key text not null check (private.valid_training_idempotency_key(idempotency_key)),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  cref_number text not null check (
    cref_number = upper(btrim(cref_number))
    and cref_number ~ '^[0-9A-Z/-]{4,24}$'
  ),
  cref_state text not null check (cref_state ~ '^[A-Z]{2}$'),
  studio_name text check (
    studio_name is null
    or (
      studio_name = btrim(studio_name)
      and char_length(studio_name) between 2 and 80
      and studio_name !~ '[[:cntrl:]]'
    )
  ),
  rejection_reason text check (
    rejection_reason is null
    or (
      rejection_reason = btrim(rejection_reason)
      and char_length(rejection_reason) between 2 and 500
      and rejection_reason !~ '[[:cntrl:]]'
    )
  ),
  created_at timestamptz not null default statement_timestamp(),
  unique (actor_scope, idempotency_key),
  check (
    (action = 'baseline' and previous_status = next_status)
    or (
      action = 'submitted'
      and previous_status in ('unverified','rejected')
      and next_status = 'pending'
    )
    or (action = 'verified' and previous_status = 'pending' and next_status = 'verified')
    or (action = 'rejected' and previous_status = 'pending' and next_status = 'rejected')
  ),
  check (
    (action = 'submitted' and reviewer_reference is null)
    or (action <> 'submitted' and reviewer_reference is not null)
  ),
  check (
    (action = 'rejected' and rejection_reason is not null)
    or (action not in ('rejected','baseline') and rejection_reason is null)
    or action = 'baseline'
  )
);

create index trainer_verification_events_trainer_created_idx
  on private.trainer_verification_events (trainer_user_id, created_at desc, id desc);

alter table private.trainer_verification_events enable row level security;
revoke all on private.trainer_verification_events from public, anon, authenticated, service_role;

create or replace function private.prevent_trainer_verification_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Full auth-account deletion is the sole exception. Removing only the
  -- trainer/profile row cannot erase the audit while the auth subject exists.
  if tg_op = 'DELETE' and not exists (
    select 1 from public.trainer_profiles where user_id = old.trainer_user_id
  ) and not exists (
    select 1 from public.profiles where id = old.trainer_user_id
  ) and not exists (
    select 1 from auth.users where id = old.trainer_user_id
  ) then
    return old;
  end if;
  raise exception using errcode = '55000', message = 'verification_events_are_append_only';
end;
$$;

create trigger trainer_verification_events_append_only
before update or delete on private.trainer_verification_events
for each row execute function private.prevent_trainer_verification_event_mutation();

revoke all on function private.prevent_trainer_verification_event_mutation() from public, anon, authenticated;

insert into private.trainer_verification_events (
  trainer_user_id,
  action,
  previous_status,
  next_status,
  actor_scope,
  reviewer_reference,
  idempotency_key,
  request_fingerprint,
  cref_number,
  cref_state,
  studio_name,
  rejection_reason,
  created_at
)
select
  trainer.user_id,
  'baseline',
  trainer.verification_status,
  trainer.verification_status,
  'migration:20260807254000',
  'Imported state; not evidence of a review by this workflow',
  'verification-baseline:' || trainer.user_id::text,
  encode(extensions.digest(convert_to(jsonb_build_object(
    'trainer_user_id', trainer.user_id,
    'status', trainer.verification_status,
    'cref_number', trainer.cref_number,
    'cref_state', trainer.cref_state,
    'studio_name', trainer.studio_name,
    'rejection_reason', trainer.verification_rejection_reason
  )::text, 'UTF8'), 'sha256'), 'hex'),
  trainer.cref_number,
  trainer.cref_state,
  trainer.studio_name,
  trainer.verification_rejection_reason,
  coalesce(trainer.updated_at, trainer.created_at, statement_timestamp())
from public.trainer_profiles as trainer;

-- Full professional access during homologation is intentionally separate from
-- the older AI-only allowlist. Existing AI exceptions therefore gain no new
-- authority when this migration is applied. Grants and revocations are both
-- append-only, attributable, short-lived records.
create table private.temporary_professional_access_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  trainer_user_id uuid not null,
  reason text not null check (
    reason = btrim(reason)
    and char_length(reason) between 3 and 200
    and reason !~ '[[:cntrl:]]'
  ),
  reviewer_reference text not null check (
    reviewer_reference = btrim(reviewer_reference)
    and char_length(reviewer_reference) between 3 and 160
    and reviewer_reference !~ '[[:cntrl:]]'
  ),
  idempotency_key text not null unique check (private.valid_training_idempotency_key(idempotency_key)),
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  check (expires_at > created_at),
  check (expires_at <= created_at + interval '7 days')
);

create index temporary_professional_access_active_idx
  on private.temporary_professional_access_grants (
    workspace_id,
    trainer_user_id,
    expires_at desc,
    id desc
  );

create table private.temporary_professional_access_revocations (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null unique
    references private.temporary_professional_access_grants(id) on delete restrict,
  reason text not null check (
    reason = btrim(reason)
    and char_length(reason) between 3 and 200
    and reason !~ '[[:cntrl:]]'
  ),
  reviewer_reference text not null check (
    reviewer_reference = btrim(reviewer_reference)
    and char_length(reviewer_reference) between 3 and 160
    and reviewer_reference !~ '[[:cntrl:]]'
  ),
  idempotency_key text not null unique check (private.valid_training_idempotency_key(idempotency_key)),
  created_at timestamptz not null default statement_timestamp()
);

alter table private.temporary_professional_access_grants enable row level security;
alter table private.temporary_professional_access_revocations enable row level security;
revoke all on private.temporary_professional_access_grants,
  private.temporary_professional_access_revocations
  from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant select, insert on private.temporary_professional_access_grants,
  private.temporary_professional_access_revocations to service_role;

create or replace function private.prepare_temporary_professional_access_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workspace_members as member
    join public.profiles as profile
      on profile.id = member.user_id
     and profile.account_role = 'trainer'
    join public.trainer_profiles as trainer on trainer.user_id = member.user_id
    where member.workspace_id = new.workspace_id
      and member.user_id = new.trainer_user_id
      and member.status = 'active'
      and member.role in ('owner','trainer')
  ) then
    raise exception using errcode = '22023', message = 'unknown_professional_scope';
  end if;
  new.created_at := statement_timestamp();
  return new;
end;
$$;

create or replace function private.prepare_temporary_professional_access_revocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := statement_timestamp();
  return new;
end;
$$;

create or replace function private.prevent_temporary_professional_access_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'temporary_professional_access_is_append_only';
end;
$$;

create trigger temporary_professional_access_grants_prepare
before insert on private.temporary_professional_access_grants
for each row execute function private.prepare_temporary_professional_access_grant();
create trigger temporary_professional_access_revocations_prepare
before insert on private.temporary_professional_access_revocations
for each row execute function private.prepare_temporary_professional_access_revocation();
create trigger temporary_professional_access_grants_append_only
before update or delete on private.temporary_professional_access_grants
for each row execute function private.prevent_temporary_professional_access_mutation();
create trigger temporary_professional_access_revocations_append_only
before update or delete on private.temporary_professional_access_revocations
for each row execute function private.prevent_temporary_professional_access_mutation();

revoke all on function private.prepare_temporary_professional_access_grant()
  from public, anon, authenticated;
revoke all on function private.prepare_temporary_professional_access_revocation()
  from public, anon, authenticated;
revoke all on function private.prevent_temporary_professional_access_mutation()
  from public, anon, authenticated;
grant execute on function private.valid_training_idempotency_key(text) to service_role;

-- One canonical function owns the effective professional access decision.
-- A temporary exception is deliberately not returned as "verified".
create or replace function private.professional_access_mode(
  target_user_id uuid,
  target_workspace_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.workspace_members as member
      join public.profiles as profile
        on profile.id = member.user_id
       and profile.account_role = 'trainer'
      join public.trainer_profiles as trainer
        on trainer.user_id = member.user_id
      where member.workspace_id = target_workspace_id
        and member.user_id = target_user_id
        and member.status = 'active'
        and member.role in ('owner','trainer')
        and trainer.verification_status = 'verified'
    ) then 'verified'
    when exists (
      select 1
      from public.workspace_members as member
      join public.profiles as profile
        on profile.id = member.user_id
       and profile.account_role = 'trainer'
      join public.trainer_profiles as trainer
        on trainer.user_id = member.user_id
       and trainer.verification_status <> 'verified'
      join private.temporary_professional_access_grants as access
        on access.workspace_id = member.workspace_id
       and access.trainer_user_id = member.user_id
       and access.expires_at > statement_timestamp()
      where member.workspace_id = target_workspace_id
        and member.user_id = target_user_id
        and member.status = 'active'
        and member.role in ('owner','trainer')
        and not exists (
          select 1
          from private.temporary_professional_access_revocations as revocation
          where revocation.grant_id = access.id
        )
    ) then 'temporary_homologation'
    else 'blocked'
  end;
$$;

create or replace function private.is_training_professional(
  target_user_id uuid,
  target_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.professional_access_mode(target_user_id, target_workspace_id)
    in ('verified','temporary_homologation');
$$;

create or replace function private.is_trainer_ai_enabled(
  target_user_id uuid,
  target_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.professional_access_mode(target_user_id, target_workspace_id)
    in ('verified','temporary_homologation');
$$;

create or replace function private.is_workspace_trainer(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.professional_access_mode((select auth.uid()), target_workspace_id)
    in ('verified','temporary_homologation');
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
    from public.workspace_members as viewer
    join public.workspace_members as target
      on target.workspace_id = viewer.workspace_id
     and target.user_id = target_user_id
     and target.status = 'active'
    join public.profiles as target_profile on target_profile.id = target.user_id
    where viewer.user_id = (select auth.uid())
      and viewer.status = 'active'
      and (
        (
          viewer.role in ('owner','trainer')
          and private.professional_access_mode(viewer.user_id, viewer.workspace_id)
            in ('verified','temporary_homologation')
        )
        or (
          viewer.role = 'student'
          and target.role in ('owner','trainer')
          and target_profile.account_role = 'trainer'
        )
      )
  );
$$;

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
   and member.role in ('owner','trainer')
  join public.profiles as profile
    on profile.id = current_user_id
   and profile.account_role = 'trainer'
  where workspace.owner_user_id = current_user_id
    and private.professional_access_mode(current_user_id, workspace.id)
      in ('verified','temporary_homologation')
  limit 1;

  return result;
end;
$$;

revoke all on function private.professional_access_mode(uuid, uuid) from public, anon, authenticated;
revoke all on function private.is_training_professional(uuid, uuid) from public, anon, authenticated;
revoke all on function private.is_trainer_ai_enabled(uuid, uuid) from public, anon, authenticated;
revoke all on function private.is_workspace_trainer(uuid) from public, anon;
grant execute on function private.is_workspace_trainer(uuid) to authenticated;
revoke all on function private.can_view_profile(uuid) from public, anon;
grant execute on function private.can_view_profile(uuid) to authenticated;
revoke all on function private.current_owned_workspace() from public, anon, authenticated;

create or replace function public.get_my_professional_access(p_workspace_id uuid)
returns table (
  user_id uuid,
  workspace_id uuid,
  verification_status public.trainer_verification_status,
  cref_number text,
  cref_state text,
  studio_name text,
  verification_submitted_at timestamptz,
  verification_decided_at timestamptz,
  verification_rejection_reason text,
  access_mode text,
  temporary_access_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    trainer.user_id,
    member.workspace_id,
    trainer.verification_status,
    trainer.cref_number,
    trainer.cref_state,
    trainer.studio_name,
    trainer.verification_submitted_at,
    trainer.verification_decided_at,
    trainer.verification_rejection_reason,
    private.professional_access_mode(trainer.user_id, member.workspace_id),
    case
      when private.professional_access_mode(trainer.user_id, member.workspace_id) = 'temporary_homologation'
        then access.expires_at
      else null
    end
  from public.workspace_members as member
  join public.profiles as profile
    on profile.id = member.user_id
   and profile.account_role = 'trainer'
  join public.trainer_profiles as trainer on trainer.user_id = member.user_id
  left join lateral (
    select temporary_access.expires_at
    from private.temporary_professional_access_grants as temporary_access
    where temporary_access.workspace_id = member.workspace_id
      and temporary_access.trainer_user_id = member.user_id
      and temporary_access.expires_at > statement_timestamp()
      and not exists (
        select 1
        from private.temporary_professional_access_revocations as revocation
        where revocation.grant_id = temporary_access.id
      )
    order by temporary_access.expires_at desc, temporary_access.id desc
    limit 1
  ) as access on true
  where member.user_id = (select auth.uid())
    and member.workspace_id = p_workspace_id
    and member.status = 'active'
    and member.role in ('owner','trainer')
  limit 1;
$$;

revoke all on function public.get_my_professional_access(uuid) from public, anon;
grant execute on function public.get_my_professional_access(uuid) to authenticated;

-- A rejection reason is operational feedback for the affected professional,
-- not profile data for students or workspace peers. Keep the existing profile
-- RLS relationship checks, but expose only the deliberately public columns;
-- the owner reads lifecycle details through the self-scoped RPC above.
revoke select on public.trainer_profiles from authenticated;
grant select (
  user_id,
  cref_number,
  cref_state,
  studio_name,
  created_at,
  updated_at
) on public.trainer_profiles to authenticated;

create or replace function public.submit_trainer_verification(
  p_cref_number text,
  p_cref_state text,
  p_studio_name text,
  p_idempotency_key text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_cref text := upper(btrim(coalesce(p_cref_number, '')));
  clean_state text := upper(btrim(coalesce(p_cref_state, '')));
  clean_studio text := nullif(btrim(coalesce(p_studio_name, '')), '');
  clean_key text := btrim(coalesce(p_idempotency_key, ''));
  fingerprint text;
  existing_event private.trainer_verification_events%rowtype;
  trainer public.trainer_profiles%rowtype;
  previous_status public.trainer_verification_status;
  event_id uuid := gen_random_uuid();
begin
  if caller_id is null
    or clean_cref !~ '^[0-9A-Z/-]{4,24}$'
    or clean_state !~ '^[A-Z]{2}$'
    or (
      clean_studio is not null
      and (
        char_length(clean_studio) not between 2 and 80
        or clean_studio ~ '[[:cntrl:]]'
      )
    )
    or not private.valid_training_idempotency_key(clean_key) then
    raise exception using errcode = '22023', message = 'invalid_verification_submission';
  end if;

  fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'trainer_user_id', caller_id,
    'cref_number', clean_cref,
    'cref_state', clean_state,
    'studio_name', clean_studio
  )::text, 'UTF8'), 'sha256'), 'hex');

  select stored.*
    into existing_event
  from private.trainer_verification_events as stored
  where stored.actor_scope = 'trainer:' || caller_id::text
    and stored.idempotency_key = clean_key;

  if existing_event.id is not null then
    if existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency_conflict';
    end if;
    return existing_event.id;
  end if;

  select stored.*
    into trainer
  from public.trainer_profiles as stored
  join public.profiles as profile
    on profile.id = stored.user_id
   and profile.account_role = 'trainer'
  where stored.user_id = caller_id
  for update of stored;

  if trainer.user_id is null
    or not exists (
      select 1
      from auth.users as auth_user
      where auth_user.id = caller_id
        and auth_user.email_confirmed_at is not null
    )
    or not exists (
      select 1
      from public.workspace_members as member
      where member.user_id = caller_id
        and member.status = 'active'
        and member.role in ('owner','trainer')
    ) then
    raise exception using errcode = '42501', message = 'professional_access_denied';
  end if;

  -- Recheck after the trainer row lock so concurrent exact retries replay and
  -- concurrent different submissions cannot both transition the same profile.
  select stored.*
    into existing_event
  from private.trainer_verification_events as stored
  where stored.actor_scope = 'trainer:' || caller_id::text
    and stored.idempotency_key = clean_key;

  if existing_event.id is not null then
    if existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency_conflict';
    end if;
    return existing_event.id;
  end if;

  if trainer.verification_status not in ('unverified','rejected') then
    raise exception using errcode = '55000', message = 'verification_state_changed';
  end if;

  previous_status := trainer.verification_status;

  update public.trainer_profiles
  set cref_number = clean_cref,
      cref_state = clean_state,
      studio_name = clean_studio,
      verification_status = 'pending',
      verification_submitted_at = statement_timestamp(),
      verification_decided_at = null,
      verification_rejection_reason = null
  where user_id = caller_id;

  insert into private.trainer_verification_events (
    id,
    trainer_user_id,
    action,
    previous_status,
    next_status,
    actor_scope,
    reviewer_reference,
    idempotency_key,
    request_fingerprint,
    cref_number,
    cref_state,
    studio_name,
    rejection_reason
  ) values (
    event_id,
    caller_id,
    'submitted',
    previous_status,
    'pending',
    'trainer:' || caller_id::text,
    null,
    clean_key,
    fingerprint,
    clean_cref,
    clean_state,
    clean_studio,
    null
  );

  return event_id;
end;
$$;

revoke all on function public.submit_trainer_verification(text, text, text, text) from public, anon;
grant execute on function public.submit_trainer_verification(text, text, text, text) to authenticated;

create or replace function public.review_trainer_verification(
  p_trainer_user_id uuid,
  p_decision text,
  p_rejection_reason text,
  p_reviewer_reference text,
  p_idempotency_key text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean_decision text := lower(btrim(coalesce(p_decision, '')));
  clean_reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
  clean_reviewer text := btrim(coalesce(p_reviewer_reference, ''));
  clean_key text := btrim(coalesce(p_idempotency_key, ''));
  fingerprint text;
  existing_event private.trainer_verification_events%rowtype;
  trainer public.trainer_profiles%rowtype;
  event_id uuid := gen_random_uuid();
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    or p_trainer_user_id is null
    or clean_decision not in ('verified','rejected')
    or char_length(clean_reviewer) not between 3 and 160
    or clean_reviewer ~ '[[:cntrl:]]'
    or not private.valid_training_idempotency_key(clean_key)
    or (
      clean_decision = 'verified'
      and clean_reason is not null
    )
    or (
      clean_decision = 'rejected'
      and (
        clean_reason is null
        or char_length(clean_reason) not between 2 and 500
        or clean_reason ~ '[[:cntrl:]]'
      )
    ) then
    raise exception using errcode = '42501', message = 'verification_review_denied';
  end if;

  fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'trainer_user_id', p_trainer_user_id,
    'decision', clean_decision,
    'rejection_reason', clean_reason,
    'reviewer_reference', clean_reviewer
  )::text, 'UTF8'), 'sha256'), 'hex');

  select stored.*
    into existing_event
  from private.trainer_verification_events as stored
  where stored.actor_scope = 'service_role'
    and stored.idempotency_key = clean_key;

  if existing_event.id is not null then
    if existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency_conflict';
    end if;
    return existing_event.id;
  end if;

  select stored.*
    into trainer
  from public.trainer_profiles as stored
  where stored.user_id = p_trainer_user_id
  for update of stored;

  if trainer.user_id is null then
    raise exception using errcode = '22023', message = 'unknown_trainer';
  end if;

  select stored.*
    into existing_event
  from private.trainer_verification_events as stored
  where stored.actor_scope = 'service_role'
    and stored.idempotency_key = clean_key;

  if existing_event.id is not null then
    if existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency_conflict';
    end if;
    return existing_event.id;
  end if;

  if trainer.verification_status <> 'pending' then
    raise exception using errcode = '55000', message = 'verification_state_changed';
  end if;

  update public.trainer_profiles
  set verification_status = clean_decision::public.trainer_verification_status,
      verification_decided_at = statement_timestamp(),
      verification_rejection_reason = clean_reason
  where user_id = p_trainer_user_id;

  insert into private.trainer_verification_events (
    id,
    trainer_user_id,
    action,
    previous_status,
    next_status,
    actor_scope,
    reviewer_reference,
    idempotency_key,
    request_fingerprint,
    cref_number,
    cref_state,
    studio_name,
    rejection_reason
  ) values (
    event_id,
    p_trainer_user_id,
    clean_decision,
    'pending',
    clean_decision::public.trainer_verification_status,
    'service_role',
    clean_reviewer,
    clean_key,
    fingerprint,
    trainer.cref_number,
    trainer.cref_state,
    trainer.studio_name,
    clean_reason
  );

  return event_id;
end;
$$;

revoke all on function public.review_trainer_verification(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.review_trainer_verification(uuid, text, text, text, text)
  to service_role;

-- The browser can no longer mutate the credential snapshot directly. Changes
-- happen only while submitting a new review request through the audited RPC.
revoke update (cref_number, cref_state, studio_name) on public.trainer_profiles from authenticated;

-- An invitation created during an earlier access window cannot be accepted
-- after its issuing professional loses verified/temporary authority.
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
    or not private.is_training_professional(invitation.invited_by, invitation.workspace_id)
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

comment on function public.submit_trainer_verification(text, text, text, text) is
  'Submits a normalized professional credential snapshot for human review; never approves it.';
comment on function public.review_trainer_verification(uuid, text, text, text, text) is
  'Service-role-only human review decision. Never expose this RPC credential to a browser.';
comment on table private.trainer_verification_events is
  'Append-only professional verification lifecycle, including explicit imported baseline states.';
