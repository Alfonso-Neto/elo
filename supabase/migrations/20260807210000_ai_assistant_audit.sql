create type public.ai_assistant_kind as enum ('pain_triage', 'trainer_copilot');
create type public.ai_run_status as enum ('processing', 'completed', 'failed');
create type public.ai_completion_mode as enum ('model', 'deterministic_safety');
create type public.ai_urgency as enum ('routine', 'soon', 'urgent', 'emergency');
create type public.ai_proposal_status as enum ('pending', 'accepted', 'rejected', 'dismissed', 'expired');
create type public.ai_decision_kind as enum ('accepted', 'rejected', 'dismissed');
create type public.ai_decision_status as enum ('recorded', 'superseded');

create or replace function private.valid_ai_text_array(
  candidate jsonb,
  maximum_items integer,
  maximum_item_length integer
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
begin
  if jsonb_typeof(candidate) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(candidate) > maximum_items then
    return false;
  end if;

  for item in select value from jsonb_array_elements(candidate)
  loop
    if jsonb_typeof(item) <> 'string'
       or char_length(item #>> '{}') < 1
       or char_length(item #>> '{}') > maximum_item_length then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function private.valid_ai_workout_changes(candidate jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  operation_name text;
  numeric_value numeric;
  duration_value numeric;
begin
  if jsonb_typeof(candidate) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(candidate) > 8 then
    return false;
  end if;

  for item in select value from jsonb_array_elements(candidate)
  loop
    if jsonb_typeof(item) <> 'object' then
      return false;
    end if;
    if not (item ?& array['operation', 'target', 'value_number', 'value_text', 'duration_sessions', 'guardrail'])
       or exists (
         select 1
         from jsonb_object_keys(item) as allowed(key)
         where allowed.key <> all (array['operation', 'target', 'value_number', 'value_text', 'duration_sessions', 'guardrail'])
       ) then
      return false;
    end if;

    operation_name := item ->> 'operation';
    if operation_name not in (
      'reduce_load_percent',
      'reduce_volume_percent',
      'replace_exercise',
      'remove_exercise',
      'add_rest_seconds',
      'cap_rpe',
      'pause_session',
      'request_professional_review'
    ) then
      return false;
    end if;

    if jsonb_typeof(item -> 'target') not in ('string', 'null')
       or char_length(coalesce(item ->> 'target', '')) > 120
       or jsonb_typeof(item -> 'value_text') not in ('string', 'null')
       or char_length(coalesce(item ->> 'value_text', '')) > 160
       or jsonb_typeof(item -> 'guardrail') <> 'string'
       or char_length(item ->> 'guardrail') not between 1 and 240 then
      return false;
    end if;

    if jsonb_typeof(item -> 'value_number') = 'number' then
      numeric_value := (item ->> 'value_number')::numeric;
    elsif jsonb_typeof(item -> 'value_number') = 'null' then
      numeric_value := null;
    else
      return false;
    end if;

    if jsonb_typeof(item -> 'duration_sessions') = 'number' then
      duration_value := (item ->> 'duration_sessions')::numeric;
      if mod(duration_value, 1) <> 0 or duration_value not between 1 and 4 then
        return false;
      end if;
    elsif jsonb_typeof(item -> 'duration_sessions') <> 'null' then
      return false;
    end if;

    if operation_name <> 'replace_exercise' and jsonb_typeof(item -> 'value_text') <> 'null' then
      return false;
    end if;

    if operation_name in ('reduce_load_percent', 'reduce_volume_percent')
       and (numeric_value is null or numeric_value not between 5 and 50) then
      return false;
    elsif operation_name = 'add_rest_seconds'
       and (numeric_value is null or numeric_value not between 15 and 180) then
      return false;
    elsif operation_name = 'cap_rpe'
       and (numeric_value is null or numeric_value not between 1 and 10) then
      return false;
    elsif operation_name = 'replace_exercise'
       and (
         char_length(coalesce(item ->> 'target', '')) < 1
         or char_length(coalesce(item ->> 'value_text', '')) < 2
       ) then
      return false;
    elsif operation_name = 'remove_exercise'
       and char_length(coalesce(item ->> 'target', '')) < 1 then
      return false;
    elsif operation_name in ('replace_exercise', 'remove_exercise', 'pause_session', 'request_professional_review')
       and numeric_value is not null then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function private.valid_ai_proposal(candidate jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
begin
  if jsonb_typeof(candidate) <> 'object' then
    return false;
  end if;
  if not (candidate ?& array[
       'summary', 'urgency', 'red_flags', 'questions', 'rationale',
       'workout_changes', 'sources', 'uncertainties', 'disclaimer'
     ])
     or exists (
       select 1
       from jsonb_object_keys(candidate) as allowed(key)
       where allowed.key <> all (array[
         'summary', 'urgency', 'red_flags', 'questions', 'rationale',
         'workout_changes', 'sources', 'uncertainties', 'disclaimer'
       ])
     ) then
    return false;
  end if;

  if jsonb_typeof(candidate -> 'summary') <> 'string'
     or char_length(candidate ->> 'summary') not between 1 and 1000
     or jsonb_typeof(candidate -> 'urgency') <> 'string'
     or (candidate ->> 'urgency') not in ('routine', 'soon', 'urgent', 'emergency')
     or jsonb_typeof(candidate -> 'disclaimer') <> 'string'
     or char_length(candidate ->> 'disclaimer') not between 20 and 1000
     or not private.valid_ai_text_array(candidate -> 'rationale', 8, 500)
     or not private.valid_ai_text_array(candidate -> 'uncertainties', 8, 500)
     or not private.valid_ai_workout_changes(candidate -> 'workout_changes') then
    return false;
  end if;

  if jsonb_typeof(candidate -> 'red_flags') <> 'array' then
    return false;
  end if;
  if jsonb_array_length(candidate -> 'red_flags') > 6 then
    return false;
  end if;
  for item in select value from jsonb_array_elements(candidate -> 'red_flags')
  loop
    if jsonb_typeof(item) <> 'object' then
      return false;
    end if;
    if not (item ?& array['code', 'label', 'evidence', 'recommended_action'])
       or exists (
         select 1 from jsonb_object_keys(item) as allowed(key)
         where allowed.key <> all (array['code', 'label', 'evidence', 'recommended_action'])
       )
       or jsonb_typeof(item -> 'code') <> 'string'
       or jsonb_typeof(item -> 'label') <> 'string'
       or jsonb_typeof(item -> 'evidence') <> 'string'
       or jsonb_typeof(item -> 'recommended_action') <> 'string'
       or char_length(coalesce(item ->> 'code', '')) not between 1 and 48
       or char_length(coalesce(item ->> 'label', '')) not between 1 and 160
       or char_length(coalesce(item ->> 'evidence', '')) not between 1 and 300
       or char_length(coalesce(item ->> 'recommended_action', '')) not between 1 and 300 then
      return false;
    end if;
  end loop;

  -- Semantic fail-closed invariant: any reported alert (or emergency urgency)
  -- forbids exercise-changing operations. Only pausing and professional review
  -- may survive this state.
  if (
       jsonb_array_length(candidate -> 'red_flags') > 0
       and (candidate ->> 'urgency') not in ('urgent', 'emergency')
     ) or (
       (
         jsonb_array_length(candidate -> 'red_flags') > 0
         or (candidate ->> 'urgency') = 'emergency'
       )
       and exists (
         select 1
         from jsonb_array_elements(candidate -> 'workout_changes') as change(value)
         where change.value ->> 'operation' not in ('pause_session', 'request_professional_review')
       )
     ) then
    return false;
  end if;

  if jsonb_typeof(candidate -> 'questions') <> 'array' then
    return false;
  end if;
  if jsonb_array_length(candidate -> 'questions') > 8 then
    return false;
  end if;
  for item in select value from jsonb_array_elements(candidate -> 'questions')
  loop
    if jsonb_typeof(item) <> 'object' then
      return false;
    end if;
    if not (item ?& array['id', 'question', 'reason', 'answer_type'])
       or exists (
         select 1 from jsonb_object_keys(item) as allowed(key)
         where allowed.key <> all (array['id', 'question', 'reason', 'answer_type'])
       )
       or jsonb_typeof(item -> 'id') <> 'string'
       or jsonb_typeof(item -> 'question') <> 'string'
       or jsonb_typeof(item -> 'reason') <> 'string'
       or jsonb_typeof(item -> 'answer_type') <> 'string'
       or char_length(coalesce(item ->> 'id', '')) not between 1 and 48
       or char_length(coalesce(item ->> 'question', '')) not between 1 and 300
       or char_length(coalesce(item ->> 'reason', '')) not between 1 and 300
       or (item ->> 'answer_type') not in ('yes_no', 'scale_0_10', 'short_text') then
      return false;
    end if;
  end loop;

  if jsonb_typeof(candidate -> 'sources') <> 'array' then
    return false;
  end if;
  if jsonb_array_length(candidate -> 'sources') > 8 then
    return false;
  end if;
  for item in select value from jsonb_array_elements(candidate -> 'sources')
  loop
    if jsonb_typeof(item) <> 'object' then
      return false;
    end if;
    if not (item ?& array['kind', 'label'])
       or exists (
         select 1 from jsonb_object_keys(item) as allowed(key)
         where allowed.key <> all (array['kind', 'label'])
       )
       or jsonb_typeof(item -> 'kind') <> 'string'
       or jsonb_typeof(item -> 'label') <> 'string'
       or (item ->> 'kind') not in ('user_report', 'workspace_context', 'safety_protocol')
       or char_length(coalesce(item ->> 'label', '')) not between 1 and 240 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- The executor secret itself exists only in the Edge secret store. The database
-- retains a SHA-256 hash in this non-exposed singleton table. All run lifecycle
-- RPCs require the raw 64-hex-character secret and compare its hash here.
create table private.ai_executor_config (
  singleton boolean primary key default true check (singleton),
  secret_hash bytea not null check (octet_length(secret_hash) = 32),
  configured_at timestamptz not null default now()
);

-- Unverified trainers are denied AI access unless their workspace has a current,
-- explicitly granted homologation exception.
create table private.ai_workspace_access (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default true,
  reason text not null check (char_length(trim(reason)) between 3 and 200),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

-- A composite evidence key prevents an AI run from attaching a consent event that
-- belongs to another student, workspace, purpose, or policy version.
alter table public.consent_events
  add constraint consent_events_ai_evidence_unique
  unique (id, workspace_id, student_user_id, purpose, policy_version);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  consent_event_id uuid not null,
  consent_purpose public.consent_purpose not null default 'health_processing'
    check (consent_purpose = 'health_processing'),
  consent_policy_version text not null,
  kind public.ai_assistant_kind not null,
  status public.ai_run_status not null default 'processing',
  completion_mode public.ai_completion_mode,
  model text check (model is null or char_length(model) between 1 and 80),
  provider_request_id text check (
    provider_request_id is null
    or (
      char_length(provider_request_id) between 1 and 128
      and provider_request_id ~ '^[A-Za-z0-9._:-]+$'
    )
  ),
  idempotency_key_hash text not null check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  input_digest text not null check (input_digest ~ '^[0-9a-f]{64}$'),
  input_char_count integer not null check (input_char_count between 1 and 12000),
  failure_code text check (failure_code is null or failure_code in (
    'provider_unavailable', 'provider_timeout', 'provider_rate_limited',
    'provider_authentication', 'provider_bad_request', 'provider_refusal',
    'provider_incomplete', 'invalid_provider_output', 'persistence_failed', 'internal_error'
  )),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (
    consent_event_id, workspace_id, subject_user_id, consent_purpose, consent_policy_version
  ) references public.consent_events(
    id, workspace_id, student_user_id, purpose, policy_version
  ) on update restrict on delete restrict,
  unique (requested_by, idempotency_key_hash),
  check (
    (status = 'processing' and completed_at is null and completion_mode is null)
    or (status = 'completed' and completed_at is not null and completion_mode is not null and failure_code is null)
    or (status = 'failed' and completed_at is not null and completion_mode is null and failure_code is not null)
  )
);

create index ai_runs_workspace_created_idx on public.ai_runs(workspace_id, created_at desc);
create index ai_runs_subject_created_idx on public.ai_runs(subject_user_id, created_at desc);
create index ai_runs_user_processing_idx on public.ai_runs(requested_by, created_at desc)
  where status = 'processing';
create index ai_runs_workspace_processing_idx on public.ai_runs(workspace_id, created_at desc)
  where status = 'processing';

create table public.ai_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.ai_runs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  kind public.ai_assistant_kind not null,
  summary text not null check (char_length(summary) between 1 and 1000),
  urgency public.ai_urgency not null,
  red_flags jsonb not null,
  questions jsonb not null,
  rationale jsonb not null,
  workout_changes jsonb not null,
  sources jsonb not null,
  uncertainties jsonb not null,
  disclaimer text not null check (char_length(disclaimer) between 20 and 1000),
  status public.ai_proposal_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  check (expires_at > created_at),
  check ((status = 'pending' and decided_at is null) or (status <> 'pending' and decided_at is not null)),
  check (private.valid_ai_text_array(rationale, 8, 500)),
  check (private.valid_ai_text_array(uncertainties, 8, 500)),
  check (private.valid_ai_workout_changes(workout_changes)),
  check (jsonb_typeof(red_flags) = 'array' and jsonb_array_length(red_flags) <= 6),
  check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 8),
  check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 8)
);

create index ai_proposals_workspace_status_idx on public.ai_proposals(workspace_id, status, created_at desc);
create index ai_proposals_subject_status_idx on public.ai_proposals(subject_user_id, status, created_at desc);

create table public.ai_proposal_decisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.ai_proposals(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  decided_by uuid not null references public.profiles(id) on delete cascade,
  decision public.ai_decision_kind not null,
  status public.ai_decision_status not null default 'recorded',
  note text check (note is null or char_length(note) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (proposal_id, status)
);

create index ai_proposal_decisions_workspace_idx on public.ai_proposal_decisions(workspace_id, created_at desc);

create table private.ai_rate_limit_buckets (
  user_id uuid not null references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null check (request_count between 1 and 10),
  primary key (user_id, window_start)
);

create index ai_rate_limit_buckets_window_idx
  on private.ai_rate_limit_buckets(window_start);

create table private.ai_daily_user_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_day date not null,
  request_count integer not null check (request_count between 1 and 40),
  primary key (user_id, usage_day)
);

create index ai_daily_user_usage_day_idx on private.ai_daily_user_usage(usage_day);

create table private.ai_daily_workspace_usage (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  usage_day date not null,
  request_count integer not null check (request_count between 1 and 200),
  primary key (workspace_id, usage_day)
);

create index ai_daily_workspace_usage_day_idx on private.ai_daily_workspace_usage(usage_day);

create or replace function private.is_ai_executor_attested(candidate_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when candidate_secret is null or candidate_secret !~ '^[0-9a-f]{64}$' then false
    else exists (
      select 1
      from private.ai_executor_config
      where singleton
        and secret_hash = extensions.digest(decode(candidate_secret, 'hex'), 'sha256')
    )
  end;
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
  select exists (
    select 1
    from public.trainer_profiles
    where user_id = target_user_id
      and verification_status = 'verified'
  ) or exists (
    select 1
    from private.ai_workspace_access
    where workspace_id = target_workspace_id
      and enabled
      and expires_at > now()
  );
$$;

revoke all on function private.is_ai_executor_attested(text) from public, anon, authenticated;
revoke all on function private.is_trainer_ai_enabled(uuid, uuid) from public, anon, authenticated;

create or replace function public.reserve_ai_run(
  p_executor_secret text,
  p_request_id uuid,
  p_workspace_id uuid,
  p_subject_user_id uuid,
  p_kind text,
  p_idempotency_key_hash text,
  p_input_digest text,
  p_input_char_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_workspace_role public.workspace_role;
  subject_account_role public.account_role;
  consent_evidence_id uuid;
  consent_evidence_version text;
  current_window timestamptz := date_bin(interval '10 minutes', now(), timestamptz '2000-01-01 00:00:00+00');
  current_usage_day date := (now() at time zone 'UTC')::date;
  updated_count integer;
  concurrent_count integer;
  existing_run public.ai_runs%rowtype;
  existing_proposal_id uuid;
  created_run_id uuid;
begin
  if caller_id is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not private.is_ai_executor_attested(p_executor_secret) then
    raise exception 'assistant executor is not configured' using errcode = '55000';
  end if;
  if p_kind is null
     or p_kind not in ('pain_triage', 'trainer_copilot')
     or p_idempotency_key_hash is null
     or p_idempotency_key_hash !~ '^[0-9a-f]{64}$'
     or p_input_digest is null
     or p_input_digest !~ '^[0-9a-f]{64}$'
     or p_input_char_count is null
     or p_input_char_count not between 1 and 12000 then
    raise exception 'invalid request' using errcode = '22023';
  end if;

  select member.role
  into caller_workspace_role
  from public.workspace_members as member
  where member.workspace_id = p_workspace_id
    and member.user_id = caller_id
    and member.status = 'active';
  if not found then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select profile.account_role
  into subject_account_role
  from public.workspace_members as member
  join public.profiles as profile on profile.id = member.user_id
  where member.workspace_id = p_workspace_id
    and member.user_id = p_subject_user_id
    and member.role = 'student'
    and member.status = 'active';
  if not found or subject_account_role <> 'student' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_kind = 'trainer_copilot' and caller_workspace_role not in ('owner', 'trainer') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_kind = 'pain_triage'
     and caller_workspace_role = 'student'
     and p_subject_user_id <> caller_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if caller_workspace_role in ('owner', 'trainer')
     and not private.is_trainer_ai_enabled(caller_id, p_workspace_id) then
    raise exception 'trainer AI access is not enabled' using errcode = '42501';
  end if;

  select consent_event.id, consent_event.policy_version
  into consent_evidence_id, consent_evidence_version
  from public.consent_policies as policy
  join lateral (
    select event.id, event.policy_version, event.action
    from public.consent_events as event
    where event.workspace_id = p_workspace_id
      and event.student_user_id = p_subject_user_id
      and event.purpose = policy.purpose
      and event.policy_version = policy.policy_version
    order by event.event_sequence desc
    limit 1
  ) as consent_event on true
  where policy.purpose = 'health_processing'
    and policy.is_current
    and consent_event.action = 'granted';
  if not found then
    raise exception 'current health-processing consent is required' using errcode = '42501';
  end if;

  -- Serialize the same principal/key before checking for an existing run. This
  -- makes concurrent retries reuse one provider side effect.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-idempotency:' || caller_id::text || ':' || p_idempotency_key_hash, 0)
  );

  select * into existing_run
  from public.ai_runs
  where requested_by = caller_id
    and idempotency_key_hash = p_idempotency_key_hash
  for update;
  if found then
    if existing_run.workspace_id <> p_workspace_id
       or existing_run.subject_user_id <> p_subject_user_id
       or existing_run.kind::text <> p_kind
       or existing_run.input_digest <> p_input_digest then
      raise exception 'idempotency key was already used for different input' using errcode = '22023';
    end if;

    -- A worker can disappear after reserving but before recording an outcome.
    -- Expire that lease so an idempotency retry does not remain "processing"
    -- forever. The caller must choose a new key for an intentional retry.
    if existing_run.status = 'processing'
       and existing_run.created_at <= now() - interval '2 minutes' then
      update public.ai_runs
      set status = 'failed',
          failure_code = 'internal_error',
          completed_at = now()
      where id = existing_run.id
        and status = 'processing';

      existing_run.status := 'failed';
      existing_run.failure_code := 'internal_error';
      existing_run.completed_at := now();
    end if;

    select id into existing_proposal_id
    from public.ai_proposals
    where run_id = existing_run.id;

    return jsonb_build_object(
      'run_id', existing_run.id,
      'status', existing_run.status,
      'reused', true,
      'proposal_id', existing_proposal_id,
      'completion_mode', existing_run.completion_mode
    );
  end if;

  -- Serialize budget checks so different users cannot overrun the workspace
  -- concurrency or daily limits at the same instant.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-user-budget:' || caller_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-workspace-budget:' || p_workspace_id::text, 0)
  );

  select count(*) into concurrent_count
  from public.ai_runs
  where requested_by = caller_id
    and status = 'processing'
    and created_at > now() - interval '2 minutes';
  if concurrent_count >= 2 then
    raise exception 'concurrent user limit exceeded' using errcode = 'P0001';
  end if;

  select count(*) into concurrent_count
  from public.ai_runs
  where workspace_id = p_workspace_id
    and status = 'processing'
    and created_at > now() - interval '2 minutes';
  if concurrent_count >= 10 then
    raise exception 'concurrent workspace limit exceeded' using errcode = 'P0001';
  end if;

  insert into private.ai_rate_limit_buckets as bucket (user_id, window_start, request_count)
  values (caller_id, current_window, 1)
  on conflict (user_id, window_start) do update
  set request_count = bucket.request_count + 1
  where bucket.request_count < 10
  returning request_count into updated_count;
  if updated_count is null then
    raise exception 'rate limit exceeded' using errcode = 'P0001';
  end if;

  updated_count := null;
  insert into private.ai_daily_user_usage as usage (user_id, usage_day, request_count)
  values (caller_id, current_usage_day, 1)
  on conflict (user_id, usage_day) do update
  set request_count = usage.request_count + 1
  where usage.request_count < 40
  returning request_count into updated_count;
  if updated_count is null then
    raise exception 'daily user limit exceeded' using errcode = 'P0001';
  end if;

  updated_count := null;
  insert into private.ai_daily_workspace_usage as usage (workspace_id, usage_day, request_count)
  values (p_workspace_id, current_usage_day, 1)
  on conflict (workspace_id, usage_day) do update
  set request_count = usage.request_count + 1
  where usage.request_count < 200
  returning request_count into updated_count;
  if updated_count is null then
    raise exception 'daily workspace limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.ai_runs (
    request_id, workspace_id, requested_by, subject_user_id,
    consent_event_id, consent_policy_version, kind, idempotency_key_hash,
    input_digest, input_char_count
  ) values (
    p_request_id, p_workspace_id, caller_id, p_subject_user_id,
    consent_evidence_id, consent_evidence_version, p_kind::public.ai_assistant_kind,
    p_idempotency_key_hash, p_input_digest, p_input_char_count
  )
  returning id into created_run_id;

  return jsonb_build_object(
    'run_id', created_run_id,
    'status', 'processing',
    'reused', false,
    'proposal_id', null,
    'completion_mode', null
  );
end;
$$;

create or replace function public.complete_ai_run(
  p_executor_secret text,
  p_run_id uuid,
  p_model text,
  p_completion_mode text,
  p_proposal jsonb,
  p_provider_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_run public.ai_runs%rowtype;
  created_proposal_id uuid;
begin
  if caller_id is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not private.is_ai_executor_attested(p_executor_secret) then
    raise exception 'assistant executor is not configured' using errcode = '55000';
  end if;
  if p_completion_mode is null
     or p_completion_mode not in ('model', 'deterministic_safety')
     or p_model is null
     or char_length(p_model) not between 1 and 80
     or p_proposal is null
     or (
       p_provider_request_id is not null
       and (
         char_length(p_provider_request_id) not between 1 and 128
         or p_provider_request_id !~ '^[A-Za-z0-9._:-]+$'
       )
     )
     or (p_completion_mode = 'deterministic_safety' and (p_model <> 'elo-safety-v1' or p_provider_request_id is not null))
     or (p_completion_mode = 'model' and p_model = 'elo-safety-v1')
     or not private.valid_ai_proposal(p_proposal) then
    raise exception 'invalid request' using errcode = '22023';
  end if;

  select * into target_run
  from public.ai_runs
  where id = p_run_id and requested_by = caller_id
  for update;
  if not found or target_run.status <> 'processing' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not private.is_workspace_member(target_run.workspace_id)
     or (
       target_run.kind = 'trainer_copilot'
       and not private.is_workspace_trainer(target_run.workspace_id)
     )
     or (
       target_run.kind = 'pain_triage'
       and caller_id <> target_run.subject_user_id
       and not private.is_workspace_trainer(target_run.workspace_id)
     ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.ai_proposals (
    run_id, workspace_id, subject_user_id, created_by, kind, summary, urgency,
    red_flags, questions, rationale, workout_changes, sources, uncertainties, disclaimer
  ) values (
    target_run.id,
    target_run.workspace_id,
    target_run.subject_user_id,
    caller_id,
    target_run.kind,
    p_proposal ->> 'summary',
    (p_proposal ->> 'urgency')::public.ai_urgency,
    p_proposal -> 'red_flags',
    p_proposal -> 'questions',
    p_proposal -> 'rationale',
    p_proposal -> 'workout_changes',
    p_proposal -> 'sources',
    p_proposal -> 'uncertainties',
    p_proposal ->> 'disclaimer'
  )
  returning id into created_proposal_id;

  update public.ai_runs
  set status = 'completed',
      completion_mode = p_completion_mode::public.ai_completion_mode,
      model = p_model,
      provider_request_id = p_provider_request_id,
      completed_at = now()
  where id = target_run.id;

  return created_proposal_id;
end;
$$;

create or replace function public.fail_ai_run(
  p_executor_secret text,
  p_run_id uuid,
  p_failure_code text,
  p_provider_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not private.is_ai_executor_attested(p_executor_secret) then
    raise exception 'assistant executor is not configured' using errcode = '55000';
  end if;
  if p_failure_code is null or p_failure_code not in (
    'provider_unavailable', 'provider_timeout', 'provider_rate_limited',
    'provider_authentication', 'provider_bad_request', 'provider_refusal',
    'provider_incomplete', 'invalid_provider_output', 'persistence_failed', 'internal_error'
  ) or (
    p_provider_request_id is not null
    and (
      char_length(p_provider_request_id) not between 1 and 128
      or p_provider_request_id !~ '^[A-Za-z0-9._:-]+$'
    )
  ) then
    raise exception 'invalid request' using errcode = '22023';
  end if;

  update public.ai_runs
  set status = 'failed',
      failure_code = p_failure_code,
      provider_request_id = p_provider_request_id,
      completed_at = now()
  where id = p_run_id
    and requested_by = auth.uid()
    and status = 'processing';
end;
$$;

create or replace function public.decide_ai_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_proposal public.ai_proposals%rowtype;
  created_decision_id uuid;
begin
  if caller_id is null
     or p_decision is null
     or p_decision not in ('accepted', 'rejected', 'dismissed')
     or (p_note is not null and char_length(trim(p_note)) not between 1 and 500) then
    raise exception 'invalid request' using errcode = '22023';
  end if;

  select * into target_proposal
  from public.ai_proposals
  where id = p_proposal_id
  for update;
  if not found or target_proposal.status <> 'pending' or target_proposal.expires_at <= now() then
    raise exception 'not available' using errcode = '22023';
  end if;

  if target_proposal.kind = 'trainer_copilot' then
    if not private.is_workspace_trainer(target_proposal.workspace_id) then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  elsif caller_id <> target_proposal.subject_user_id
        and not private.is_workspace_trainer(target_proposal.workspace_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.ai_proposal_decisions (
    proposal_id, workspace_id, subject_user_id, decided_by, decision, note
  ) values (
    target_proposal.id, target_proposal.workspace_id, target_proposal.subject_user_id,
    caller_id, p_decision::public.ai_decision_kind, nullif(trim(p_note), '')
  )
  returning id into created_decision_id;

  update public.ai_proposals
  set status = p_decision::public.ai_proposal_status, decided_at = now()
  where id = target_proposal.id;

  -- Deliberately no workout, form, health record, or publication is changed here.
  return created_decision_id;
end;
$$;

alter table public.ai_runs enable row level security;
alter table public.ai_proposals enable row level security;
alter table public.ai_proposal_decisions enable row level security;
alter table private.ai_rate_limit_buckets enable row level security;
alter table private.ai_daily_user_usage enable row level security;
alter table private.ai_daily_workspace_usage enable row level security;
alter table private.ai_executor_config enable row level security;
alter table private.ai_workspace_access enable row level security;

create policy ai_runs_select_authorized on public.ai_runs
for select to authenticated
using (
  subject_user_id = (select auth.uid())
  or private.is_workspace_trainer(workspace_id)
);

create policy ai_proposals_select_authorized on public.ai_proposals
for select to authenticated
using (
  subject_user_id = (select auth.uid())
  or private.is_workspace_trainer(workspace_id)
);

create policy ai_proposal_decisions_select_authorized on public.ai_proposal_decisions
for select to authenticated
using (
  subject_user_id = (select auth.uid())
  or private.is_workspace_trainer(workspace_id)
);

revoke all on public.ai_runs, public.ai_proposals, public.ai_proposal_decisions from anon, authenticated;
revoke all on private.ai_rate_limit_buckets, private.ai_daily_user_usage,
  private.ai_daily_workspace_usage, private.ai_executor_config,
  private.ai_workspace_access from public, anon, authenticated;
grant select (
  id, request_id, workspace_id, requested_by, subject_user_id,
  consent_event_id, consent_purpose, consent_policy_version, kind, status,
  completion_mode, model, failure_code, created_at, completed_at
) on public.ai_runs to authenticated;
grant select on public.ai_proposals, public.ai_proposal_decisions to authenticated;

revoke all on function private.valid_ai_text_array(jsonb, integer, integer) from public, anon, authenticated;
revoke all on function private.valid_ai_workout_changes(jsonb) from public, anon, authenticated;
revoke all on function private.valid_ai_proposal(jsonb) from public, anon, authenticated;
revoke all on function public.reserve_ai_run(text, uuid, uuid, uuid, text, text, text, integer) from public, anon;
revoke all on function public.complete_ai_run(text, uuid, text, text, jsonb, text) from public, anon;
revoke all on function public.fail_ai_run(text, uuid, text, text) from public, anon;
revoke all on function public.decide_ai_proposal(uuid, text, text) from public, anon;
grant execute on function public.reserve_ai_run(text, uuid, uuid, uuid, text, text, text, integer) to authenticated;
grant execute on function public.complete_ai_run(text, uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.fail_ai_run(text, uuid, text, text) to authenticated;
grant execute on function public.decide_ai_proposal(uuid, text, text) to authenticated;

comment on table public.ai_proposals is
  'Non-authoritative assistant proposals. Accepting a proposal records a decision only and never mutates or publishes a workout.';
comment on table private.ai_rate_limit_buckets is
  'Fixed-window per-user assistant limit. Intentionally inaccessible through the Data API.';
comment on table private.ai_executor_config is
  'SHA-256 hash of the server-only AI_EXECUTOR_SECRET. Configure once after migration; never expose through Data API.';
comment on table private.ai_workspace_access is
  'Time-bounded homologation exceptions for unverified trainer workspaces.';
comment on column public.ai_runs.consent_event_id is
  'Exact current grant event that authorized processing when this run was reserved.';
comment on column public.ai_runs.idempotency_key_hash is
  'Salted server-side hash of the caller idempotency key; raw keys are never stored.';
