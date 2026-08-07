-- Makes consent recording retry-safe. The caller supplies one idempotency key per
-- user intent and can safely reuse it after a lost response.
create or replace function public.record_current_health_consent(
  p_action text,
  p_idempotency_key text
)
returns public.consent_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  resolved_workspace_id uuid;
  workspace_count integer;
  current_purpose public.consent_purpose;
  current_policy_version text;
  clean_action public.consent_action;
  requested_fingerprint bytea;
  existing_fingerprint bytea;
  existing_event public.consent_events%rowtype;
  created_event public.consent_events%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_action is null or p_action not in ('granted', 'withdrawn') then
    raise exception using errcode = '22023', message = 'invalid consent action';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;
  clean_action := p_action::public.consent_action;

  select count(*), min(member.workspace_id::text)::uuid
  into workspace_count, resolved_workspace_id
  from public.workspace_members as member
  where member.user_id = caller_id
    and member.role = 'student'
    and member.status = 'active';

  if workspace_count = 0 then
    raise exception using errcode = '42501', message = 'one active student workspace is required';
  elsif workspace_count > 1 then
    raise exception using errcode = '21000', message = 'student workspace is ambiguous';
  end if;

  select policy.purpose, policy.policy_version
  into current_purpose, current_policy_version
  from public.consent_policies as policy
  where policy.purpose = 'health_processing'
    and policy.is_current;
  if not found then
    raise exception using errcode = 'P0001', message = 'current consent policy is unavailable';
  end if;

  requested_fingerprint := extensions.digest(
    concat_ws(
      chr(31),
      resolved_workspace_id::text,
      caller_id::text,
      'student',
      current_purpose::text,
      current_policy_version,
      clean_action::text
    ),
    'sha256'
  );

  select event.*
  into existing_event
  from public.consent_events as event
  where event.student_user_id = caller_id
    and event.idempotency_key = p_idempotency_key;

  if found then
    existing_fingerprint := extensions.digest(
      concat_ws(
        chr(31),
        existing_event.workspace_id::text,
        existing_event.student_user_id::text,
        existing_event.student_membership_role::text,
        existing_event.purpose::text,
        existing_event.policy_version,
        existing_event.action::text
      ),
      'sha256'
    );
    if existing_fingerprint is distinct from requested_fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return existing_event;
  end if;

  insert into public.consent_events (
    workspace_id,
    student_user_id,
    student_membership_role,
    purpose,
    policy_version,
    action,
    idempotency_key
  ) values (
    resolved_workspace_id,
    caller_id,
    'student',
    current_purpose,
    current_policy_version,
    clean_action,
    p_idempotency_key
  )
  on conflict (student_user_id, idempotency_key) do nothing
  returning * into created_event;

  if created_event.id is not null then
    return created_event;
  end if;

  -- A concurrent same-key request won the unique-key race. At READ COMMITTED,
  -- this statement observes the committed winner and applies the same fingerprint check.
  select event.*
  into existing_event
  from public.consent_events as event
  where event.student_user_id = caller_id
    and event.idempotency_key = p_idempotency_key;

  if not found then
    raise exception using errcode = '22023', message = 'idempotency key conflict';
  end if;

  existing_fingerprint := extensions.digest(
    concat_ws(
      chr(31),
      existing_event.workspace_id::text,
      existing_event.student_user_id::text,
      existing_event.student_membership_role::text,
      existing_event.purpose::text,
      existing_event.policy_version,
      existing_event.action::text
    ),
    'sha256'
  );
  if existing_fingerprint is distinct from requested_fingerprint then
    raise exception using errcode = '22023', message = 'idempotency key conflict';
  end if;

  return existing_event;
end;
$$;

-- Consent writes now go through the authority-deriving RPC. The existing RLS
-- policy remains a deny-by-default safeguard if direct grants change later.
revoke insert on table public.consent_events from authenticated;
revoke insert (workspace_id, purpose, policy_version, action, idempotency_key)
  on public.consent_events from authenticated;
revoke usage on sequence public.consent_events_event_sequence_seq from authenticated;

revoke all on function public.record_current_health_consent(text, text) from public, anon;
grant execute on function public.record_current_health_consent(text, text) to authenticated;

comment on function public.record_current_health_consent(text, text) is
  'Records current health-processing consent idempotently for the caller and their single active student workspace.';
