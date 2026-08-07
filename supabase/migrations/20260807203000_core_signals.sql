-- Core health-signal vertical slice.
--
-- Security model:
--   * consent and pain reports are append-only source events;
--   * a report always belongs to a real student membership in the same workspace;
--   * students can only see their own events;
--   * active workspace trainers can read reports and append acknowledgement or
--     resolution events, but can never rewrite the student's source report;
--   * mutating RPCs derive authority from auth.uid() and never accept a user or
--     workspace identifier from the caller.

create type public.consent_purpose as enum ('health_processing');
create type public.consent_action as enum ('granted', 'withdrawn');
create type public.body_side as enum ('left', 'right', 'bilateral', 'midline', 'not_applicable');
create type public.symptom_timing as enum ('before_activity', 'during_activity', 'after_activity', 'at_rest', 'constant');
create type public.pain_report_action as enum ('acknowledged', 'resolved');

-- Version identifiers are immutable references. A new consent text is introduced
-- as a new row; only the is_current marker changes when a version is superseded,
-- so historical events continue to identify what the student accepted.
create table public.consent_policies (
  purpose public.consent_purpose not null,
  policy_version text not null check (
    char_length(policy_version) between 1 and 40
    and policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
  ),
  is_current boolean not null default false,
  published_at timestamptz not null default now(),
  primary key (purpose, policy_version)
);

create unique index consent_policies_one_current_idx
  on public.consent_policies (purpose)
  where is_current;

-- This is policy metadata, not user or health seed data. Future policy changes
-- must insert a new version and atomically move the is_current marker.
insert into public.consent_policies (purpose, policy_version, is_current)
values ('health_processing', '2026-08-07-v1', true);

create or replace function private.valid_red_flag_codes(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null or jsonb_typeof(value) <> 'array' then false
    else
      jsonb_array_length(value) <= 12
      and pg_column_size(value) <= 1024
      and not exists (
        select 1
        from jsonb_array_elements(value) as item(element)
        where jsonb_typeof(element) <> 'string'
          or trim(both '"' from element::text) !~ '^[a-z][a-z0-9_]{1,47}$'
      )
      and (
        select count(*) = count(distinct element)
        from jsonb_array_elements(value) as item(element)
      )
  end;
$$;

create or replace function private.is_active_student_membership(
  target_workspace_id uuid,
  target_student_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = target_student_user_id
      and target_student_user_id = (select auth.uid())
      and role = 'student'
      and status = 'active'
  );
$$;

create or replace function private.set_event_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Ignore any attempted timestamp supplied outside the database.
  new.created_at = clock_timestamp();
  return new;
end;
$$;

create or replace function private.reject_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('%I is append-only; append a new event instead', tg_table_name);
end;
$$;

revoke all on function private.valid_red_flag_codes(jsonb) from public, anon, authenticated;
revoke all on function private.is_active_student_membership(uuid, uuid) from public, anon;
grant execute on function private.is_active_student_membership(uuid, uuid) to authenticated;
revoke all on function private.set_event_created_at() from public, anon, authenticated;
revoke all on function private.reject_append_only_mutation() from public, anon, authenticated;

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  student_user_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  student_membership_role public.workspace_role not null default 'student'
    check (student_membership_role = 'student'),
  purpose public.consent_purpose not null,
  policy_version text not null,
  action public.consent_action not null,
  idempotency_key text not null check (
    char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, student_user_id, student_membership_role)
    references public.workspace_members(workspace_id, user_id, role)
    on update restrict on delete restrict,
  foreign key (purpose, policy_version)
    references public.consent_policies(purpose, policy_version)
    on update restrict on delete restrict,
  unique (student_user_id, idempotency_key)
);

create index consent_events_current_lookup_idx
  on public.consent_events (workspace_id, student_user_id, purpose, policy_version, event_sequence desc);

create trigger consent_events_server_timestamp
before insert on public.consent_events
for each row execute function private.set_event_created_at();

create trigger consent_events_are_append_only
before update or delete on public.consent_events
for each row execute function private.reject_append_only_mutation();

create table public.pain_reports (
  id uuid primary key default gen_random_uuid(),
  signal_sequence bigint generated always as identity unique,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  student_user_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  student_membership_role public.workspace_role not null default 'student'
    check (student_membership_role = 'student'),
  region text not null check (
    char_length(region) between 2 and 64
    and region = btrim(region)
    and region !~ '[[:cntrl:]]'
  ),
  side public.body_side not null,
  movement text not null check (
    char_length(movement) between 1 and 120
    and movement = btrim(movement)
    and movement !~ '[[:cntrl:]]'
  ),
  timing public.symptom_timing not null,
  intensity smallint not null check (intensity between 0 and 10),
  onset timestamptz not null,
  detail text check (
    detail is null
    or (
      char_length(detail) between 1 and 2000
      and detail = btrim(detail)
    )
  ),
  red_flags jsonb not null default '[]'::jsonb
    check (private.valid_red_flag_codes(red_flags)),
  idempotency_key text not null check (
    char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, student_user_id, student_membership_role)
    references public.workspace_members(workspace_id, user_id, role)
    on update restrict on delete restrict,
  unique (id, workspace_id, student_user_id),
  unique (student_user_id, idempotency_key),
  check (onset <= created_at + interval '5 minutes')
);

create index pain_reports_workspace_created_idx
  on public.pain_reports (workspace_id, created_at desc);
create index pain_reports_student_created_idx
  on public.pain_reports (student_user_id, created_at desc);

create trigger pain_reports_server_timestamp
before insert on public.pain_reports
for each row execute function private.set_event_created_at();

create trigger pain_reports_are_append_only
before update or delete on public.pain_reports
for each row execute function private.reject_append_only_mutation();

create table public.pain_report_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  pain_report_id uuid not null,
  workspace_id uuid not null,
  student_user_id uuid not null,
  actor_user_id uuid not null default auth.uid(),
  action public.pain_report_action not null,
  note text check (
    note is null
    or (
      char_length(note) between 1 and 1000
      and note = btrim(note)
    )
  ),
  idempotency_key text not null check (
    char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  created_at timestamptz not null default now(),
  foreign key (pain_report_id, workspace_id, student_user_id)
    references public.pain_reports(id, workspace_id, student_user_id)
    on update restrict on delete restrict,
  foreign key (workspace_id, actor_user_id)
    references public.workspace_members(workspace_id, user_id)
    on update restrict on delete restrict,
  unique (actor_user_id, idempotency_key),
  check (action <> 'resolved' or note is not null)
);

create index pain_report_events_report_idx
  on public.pain_report_events (pain_report_id, event_sequence);

create trigger pain_report_events_server_timestamp
before insert on public.pain_report_events
for each row execute function private.set_event_created_at();

create trigger pain_report_events_are_append_only
before update or delete on public.pain_report_events
for each row execute function private.reject_append_only_mutation();

create or replace function private.has_current_health_processing_consent(
  target_workspace_id uuid,
  target_student_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.consent_policies policy
    join lateral (
      select event.action
      from public.consent_events event
      where event.workspace_id = target_workspace_id
        and event.student_user_id = target_student_user_id
        and event.purpose = policy.purpose
        and event.policy_version = policy.policy_version
      order by event.event_sequence desc
      limit 1
    ) latest on true
    where policy.purpose = 'health_processing'
      and policy.is_current
      and latest.action = 'granted'
  );
$$;

revoke all on function private.has_current_health_processing_consent(uuid, uuid)
  from public, anon, authenticated;

alter table public.consent_policies enable row level security;
alter table public.consent_events enable row level security;
alter table public.pain_reports enable row level security;
alter table public.pain_report_events enable row level security;

create policy consent_policies_read_authenticated on public.consent_policies
for select to authenticated
using (true);

create policy consent_events_read_scoped on public.consent_events
for select to authenticated
using (
  student_user_id = (select auth.uid())
  or private.is_workspace_trainer(workspace_id)
);

create policy consent_events_insert_self on public.consent_events
for insert to authenticated
with check (
  student_user_id = (select auth.uid())
  and private.is_active_student_membership(workspace_id, student_user_id)
);

create policy pain_reports_read_scoped on public.pain_reports
for select to authenticated
using (
  student_user_id = (select auth.uid())
  or private.is_workspace_trainer(workspace_id)
);

-- Defense in depth for the RPC. Direct INSERT is intentionally not granted.
create policy pain_reports_insert_self on public.pain_reports
for insert to authenticated
with check (
  student_user_id = (select auth.uid())
  and private.is_active_student_membership(workspace_id, student_user_id)
);

create policy pain_report_events_read_scoped on public.pain_report_events
for select to authenticated
using (
  student_user_id = (select auth.uid())
  or private.is_workspace_trainer(workspace_id)
);

-- Defense in depth for trainer action RPCs. Direct INSERT is not granted.
create policy pain_report_events_insert_trainer on public.pain_report_events
for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.is_workspace_trainer(workspace_id)
);

revoke all on public.consent_policies, public.consent_events, public.pain_reports,
  public.pain_report_events from public, anon, authenticated;
grant select on public.consent_policies, public.consent_events, public.pain_reports,
  public.pain_report_events to authenticated;
grant insert (workspace_id, purpose, policy_version, action, idempotency_key)
  on public.consent_events to authenticated;
revoke all on sequence public.consent_events_event_sequence_seq from public, anon, authenticated;
grant usage on sequence public.consent_events_event_sequence_seq to authenticated;

create or replace function public.create_pain_report(
  p_region text,
  p_side public.body_side,
  p_movement text,
  p_timing public.symptom_timing,
  p_intensity smallint,
  p_onset timestamptz,
  p_detail text,
  p_red_flags jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  resolved_workspace_id uuid;
  workspace_count integer;
  clean_region text := btrim(p_region);
  clean_movement text := btrim(p_movement);
  clean_detail text := nullif(btrim(p_detail), '');
  clean_red_flags jsonb := coalesce(p_red_flags, '[]'::jsonb);
  fingerprint bytea;
  existing_id uuid;
  existing_fingerprint bytea;
  created_id uuid;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select count(*), min(workspace_id::text)::uuid
    into workspace_count, resolved_workspace_id
  from public.workspace_members
  where user_id = caller_id
    and role = 'student'
    and status = 'active';

  if workspace_count = 0 then
    raise exception using errcode = '42501', message = 'one active student workspace is required';
  elsif workspace_count > 1 then
    raise exception using errcode = '21000', message = 'student workspace is ambiguous';
  end if;

  if not private.has_current_health_processing_consent(resolved_workspace_id, caller_id) then
    raise exception using errcode = '42501', message = 'current health-processing consent is required';
  end if;

  fingerprint := extensions.digest(
    concat_ws(
      chr(31),
      clean_region,
      p_side::text,
      clean_movement,
      p_timing::text,
      p_intensity::text,
      extract(epoch from p_onset)::text,
      coalesce(clean_detail, ''),
      clean_red_flags::text
    ),
    'sha256'
  );

  select id, request_fingerprint
    into existing_id, existing_fingerprint
  from public.pain_reports
  where student_user_id = caller_id
    and idempotency_key = p_idempotency_key;

  if existing_id is not null then
    if existing_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return existing_id;
  end if;

  insert into public.pain_reports (
    workspace_id,
    student_user_id,
    region,
    side,
    movement,
    timing,
    intensity,
    onset,
    detail,
    red_flags,
    idempotency_key,
    request_fingerprint
  ) values (
    resolved_workspace_id,
    caller_id,
    clean_region,
    p_side,
    clean_movement,
    p_timing,
    p_intensity,
    p_onset,
    clean_detail,
    clean_red_flags,
    p_idempotency_key,
    fingerprint
  )
  on conflict (student_user_id, idempotency_key) do nothing
  returning id into created_id;

  if created_id is not null then
    return created_id;
  end if;

  -- A concurrent retry won the unique-key race. It is only equivalent when its
  -- canonical request fingerprint matches this request.
  select id, request_fingerprint
    into existing_id, existing_fingerprint
  from public.pain_reports
  where student_user_id = caller_id
    and idempotency_key = p_idempotency_key;

  if existing_id is null or existing_fingerprint <> fingerprint then
    raise exception using errcode = '22023', message = 'idempotency key conflict';
  end if;

  return existing_id;
end;
$$;

create or replace function private.record_pain_report_action(
  p_pain_report_id uuid,
  p_action public.pain_report_action,
  p_idempotency_key text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_workspace_id uuid;
  target_student_user_id uuid;
  clean_note text := nullif(btrim(p_note), '');
  fingerprint bytea;
  existing_id uuid;
  existing_fingerprint bytea;
  created_id uuid;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select report.workspace_id, report.student_user_id
    into target_workspace_id, target_student_user_id
  from public.pain_reports report
  join public.workspace_members membership
    on membership.workspace_id = report.workspace_id
   and membership.user_id = caller_id
   and membership.status = 'active'
   and membership.role in ('owner', 'trainer')
  where report.id = p_pain_report_id;

  if target_workspace_id is null then
    -- The same response covers both a missing report and a report outside the
    -- caller's workspace, preventing an ID-existence oracle.
    raise exception using errcode = '42501', message = 'pain report is unavailable';
  end if;

  if p_action = 'resolved' and clean_note is null then
    raise exception using errcode = '22023', message = 'a resolution note is required';
  end if;

  fingerprint := extensions.digest(
    concat_ws(chr(31), p_pain_report_id::text, p_action::text, coalesce(clean_note, '')),
    'sha256'
  );

  select id, request_fingerprint
    into existing_id, existing_fingerprint
  from public.pain_report_events
  where actor_user_id = caller_id
    and idempotency_key = p_idempotency_key;

  if existing_id is not null then
    if existing_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return existing_id;
  end if;

  insert into public.pain_report_events (
    pain_report_id,
    workspace_id,
    student_user_id,
    actor_user_id,
    action,
    note,
    idempotency_key,
    request_fingerprint
  ) values (
    p_pain_report_id,
    target_workspace_id,
    target_student_user_id,
    caller_id,
    p_action,
    clean_note,
    p_idempotency_key,
    fingerprint
  )
  on conflict (actor_user_id, idempotency_key) do nothing
  returning id into created_id;

  if created_id is not null then
    return created_id;
  end if;

  select id, request_fingerprint
    into existing_id, existing_fingerprint
  from public.pain_report_events
  where actor_user_id = caller_id
    and idempotency_key = p_idempotency_key;

  if existing_id is null or existing_fingerprint <> fingerprint then
    raise exception using errcode = '22023', message = 'idempotency key conflict';
  end if;

  return existing_id;
end;
$$;

create or replace function public.acknowledge_pain_report(
  p_pain_report_id uuid,
  p_idempotency_key text,
  p_note text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.record_pain_report_action(
    p_pain_report_id,
    'acknowledged'::public.pain_report_action,
    p_idempotency_key,
    p_note
  );
$$;

create or replace function public.resolve_pain_report(
  p_pain_report_id uuid,
  p_idempotency_key text,
  p_resolution_note text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.record_pain_report_action(
    p_pain_report_id,
    'resolved'::public.pain_report_action,
    p_idempotency_key,
    p_resolution_note
  );
$$;

revoke all on function public.create_pain_report(
  text, public.body_side, text, public.symptom_timing, smallint,
  timestamptz, text, jsonb, text
) from public, anon;
grant execute on function public.create_pain_report(
  text, public.body_side, text, public.symptom_timing, smallint,
  timestamptz, text, jsonb, text
) to authenticated;

revoke all on function private.record_pain_report_action(
  uuid, public.pain_report_action, text, text
) from public, anon, authenticated;

revoke all on function public.acknowledge_pain_report(uuid, text, text) from public, anon;
grant execute on function public.acknowledge_pain_report(uuid, text, text) to authenticated;
revoke all on function public.resolve_pain_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_pain_report(uuid, text, text) to authenticated;

comment on table public.consent_events is
  'Append-only, versioned evidence of a student health-processing consent decision.';
comment on table public.pain_reports is
  'Append-only student-authored health signal; corrections are new reports, never updates.';
comment on table public.pain_report_events is
  'Append-only trainer acknowledgement and resolution timeline for a pain report.';
comment on function public.create_pain_report(
  text, public.body_side, text, public.symptom_timing, smallint,
  timestamptz, text, jsonb, text
) is 'Creates an idempotent pain report for the caller after membership and current-consent checks.';
comment on function public.acknowledge_pain_report(uuid, text, text) is
  'Appends an idempotent trainer acknowledgement without mutating the source report.';
comment on function public.resolve_pain_report(uuid, text, text) is
  'Appends an idempotent trainer resolution with a required note.';

-- Suggested local verification (use disposable test users; no real health data):
--   1. student with zero or two active student memberships -> create RPC rejected;
--   2. student with one active membership but no current grant -> rejected;
--   3. grant current policy, create twice with same key/input -> same UUID;
--   4. reuse key with changed input -> rejected;
--   5. other student cannot SELECT the report;
--   6. active workspace trainer can SELECT and acknowledge/resolve;
--   7. UPDATE/DELETE any event table -> rejected by append-only trigger.
