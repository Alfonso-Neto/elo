-- Serializes the professional pain-report lifecycle and exposes one bounded,
-- consent-aware read model. Source reports and lifecycle events remain append-only.

-- These indexes are the database-level invariant. The RPC also locks the source
-- report to return deterministic domain errors before an index conflict occurs.
create unique index pain_report_events_one_acknowledgement_idx
  on public.pain_report_events (pain_report_id)
  where action = 'acknowledged'::public.pain_report_action;

create unique index pain_report_events_one_resolution_idx
  on public.pain_report_events (pain_report_id)
  where action = 'resolved'::public.pain_report_action;

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
  clean_note text;
  fingerprint bytea;
  existing_id uuid;
  existing_fingerprint bytea;
  created_id uuid;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_pain_report_id is null or p_action is null
     or p_action not in (
       'acknowledged'::public.pain_report_action,
       'resolved'::public.pain_report_action
     ) then
    raise exception using errcode = '22023', message = 'invalid pain report action';
  end if;
  if not private.valid_training_idempotency_key(p_idempotency_key) then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;
  if p_note is not null and octet_length(p_note) > 4032 then
    raise exception using errcode = '22023', message = 'invalid pain report action note';
  end if;
  clean_note := nullif(btrim(p_note), '');
  if clean_note is not null
     and (char_length(clean_note) > 1000 or clean_note ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'invalid pain report action note';
  end if;
  if p_action = 'resolved'::public.pain_report_action and clean_note is null then
    raise exception using errcode = '22023', message = 'a resolution note is required';
  end if;

  fingerprint := extensions.digest(
    concat_ws(
      chr(31),
      p_pain_report_id::text,
      p_action::text,
      coalesce(clean_note, '')
    ),
    'sha256'
  );

  -- A retry of an already committed request remains replayable even if access,
  -- consent, or lifecycle state changed after the original action.
  select event.id, event.request_fingerprint
  into existing_id, existing_fingerprint
  from public.pain_report_events as event
  where event.actor_user_id = caller_id
    and event.idempotency_key = p_idempotency_key;

  if found then
    if existing_fingerprint is distinct from fingerprint then
      raise exception using
        errcode = '22023',
        message = 'idempotency key was already used for different input';
    end if;
    return existing_id;
  end if;

  -- All lifecycle decisions for one report serialize on its immutable source row.
  select report.workspace_id, report.student_user_id
  into target_workspace_id, target_student_user_id
  from public.pain_reports as report
  where report.id = p_pain_report_id
  for update of report;

  if not found then
    raise exception using errcode = '42501', message = 'pain report is unavailable';
  end if;

  -- Consent changes already take an UPDATE lock on the student membership. Taking
  -- a SHARE lock here makes the following current-consent decision race-safe.
  perform 1
  from public.workspace_members as member
  where member.workspace_id = target_workspace_id
    and member.user_id in (caller_id, target_student_user_id)
  order by member.user_id
  for share;

  if not private.is_training_professional(caller_id, target_workspace_id)
     or not exists (
       select 1
       from public.workspace_members as student
       where student.workspace_id = target_workspace_id
         and student.user_id = target_student_user_id
         and student.role = 'student'
         and student.status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'pain report is unavailable';
  end if;

  if not private.has_current_health_processing_consent(
    target_workspace_id,
    target_student_user_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'current health-processing consent is required';
  end if;

  -- Resolution is terminal: no later acknowledgement or second resolution is
  -- accepted. A same-key retry has already returned above.
  if exists (
    select 1
    from public.pain_report_events as event
    where event.pain_report_id = p_pain_report_id
      and event.action = 'resolved'::public.pain_report_action
  ) then
    raise exception using errcode = '55000', message = 'pain report is already resolved';
  end if;

  if p_action = 'acknowledged'::public.pain_report_action
     and exists (
       select 1
       from public.pain_report_events as event
       where event.pain_report_id = p_pain_report_id
         and event.action = 'acknowledged'::public.pain_report_action
     ) then
    raise exception using errcode = '55000', message = 'pain report is already acknowledged';
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

  -- A concurrent request using the same actor/key won. Only an identical input
  -- is a replay; a different input is a caller-visible idempotency conflict.
  select event.id, event.request_fingerprint
  into existing_id, existing_fingerprint
  from public.pain_report_events as event
  where event.actor_user_id = caller_id
    and event.idempotency_key = p_idempotency_key;

  if not found or existing_fingerprint is distinct from fingerprint then
    raise exception using errcode = '22023', message = 'idempotency key conflict';
  end if;

  return existing_id;
end;
$$;

-- Replace the original weak trainer policies. Students retain access to their own
-- record and timeline; professionals require verification plus current consent.
drop policy if exists pain_reports_read_scoped on public.pain_reports;
create policy pain_reports_read_scoped on public.pain_reports
for select to authenticated
using (
  student_user_id = (select auth.uid())
  or private.can_read_current_training_health(workspace_id, student_user_id)
);

drop policy if exists pain_report_events_read_scoped on public.pain_report_events;
create policy pain_report_events_read_scoped on public.pain_report_events
for select to authenticated
using (
  student_user_id = (select auth.uid())
  or private.can_read_current_training_health(workspace_id, student_user_id)
);

drop policy if exists pain_report_events_insert_trainer on public.pain_report_events;
create policy pain_report_events_insert_trainer on public.pain_report_events
for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.can_read_current_training_health(workspace_id, student_user_id)
);

create or replace function public.list_trainer_pain_reports(
  p_workspace_id uuid,
  p_student_user_id uuid default null,
  p_only_unresolved boolean default true,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  signal_sequence bigint,
  workspace_id uuid,
  student_user_id uuid,
  region text,
  side public.body_side,
  movement text,
  timing public.symptom_timing,
  intensity smallint,
  onset timestamptz,
  red_flags jsonb,
  created_at timestamptz,
  lifecycle_status text,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or p_workspace_id is null then
    raise exception using errcode = '42501', message = 'pain report scope is unavailable';
  end if;
  if p_only_unresolved is null then
    raise exception using errcode = '22023', message = 'invalid unresolved filter';
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode = '22023', message = 'invalid pain report limit';
  end if;
  if p_offset is null or p_offset not between 0 and 100000 then
    raise exception using errcode = '22023', message = 'invalid pain report offset';
  end if;

  if not private.is_training_professional(caller_id, p_workspace_id) then
    raise exception using errcode = '42501', message = 'pain report scope is unavailable';
  end if;

  return query
  select
    report.id,
    report.signal_sequence,
    report.workspace_id,
    report.student_user_id,
    report.region,
    report.side,
    report.movement,
    report.timing,
    report.intensity,
    report.onset,
    report.red_flags,
    report.created_at,
    case
      when resolution.id is not null then 'resolved'
      when acknowledgement.id is not null then 'acknowledged'
      else 'open'
    end,
    acknowledgement.created_at,
    resolution.created_at,
    resolution.note
  from public.pain_reports as report
  join public.workspace_members as student
    on student.workspace_id = report.workspace_id
   and student.user_id = report.student_user_id
   and student.role = 'student'
   and student.status = 'active'
  left join lateral (
    select event.id, event.created_at
    from public.pain_report_events as event
    where event.pain_report_id = report.id
      and event.action = 'acknowledged'::public.pain_report_action
    limit 1
  ) as acknowledgement on true
  left join lateral (
    select event.id, event.note, event.created_at
    from public.pain_report_events as event
    where event.pain_report_id = report.id
      and event.action = 'resolved'::public.pain_report_action
    limit 1
  ) as resolution on true
  where report.workspace_id = p_workspace_id
    and (p_student_user_id is null or report.student_user_id = p_student_user_id)
    and private.can_read_current_training_health(
      report.workspace_id,
      report.student_user_id
    )
    -- Filtering is intentionally part of the authoritative relation and occurs
    -- before ORDER/LIMIT/OFFSET, so resolved rows cannot consume page capacity.
    and (not p_only_unresolved or resolution.id is null)
  order by
    case when resolution.id is null then 0 else 1 end,
    case when jsonb_array_length(report.red_flags) > 0 then 0 else 1 end,
    report.intensity desc,
    report.created_at desc,
    report.id desc
  limit (p_limit + 1)
  offset p_offset;
end;
$$;

-- Reads remain RLS-scoped for direct table access; all writes stay RPC-only.
revoke insert, update, delete on public.pain_reports from authenticated;
revoke insert, update, delete on public.pain_report_events from authenticated;
revoke usage on sequence public.pain_reports_signal_sequence_seq from authenticated;
revoke usage on sequence public.pain_report_events_event_sequence_seq from authenticated;

revoke all on function private.record_pain_report_action(
  uuid, public.pain_report_action, text, text
) from public, anon, authenticated;
revoke all on function public.acknowledge_pain_report(uuid, text, text) from public, anon;
grant execute on function public.acknowledge_pain_report(uuid, text, text) to authenticated;
revoke all on function public.resolve_pain_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_pain_report(uuid, text, text) to authenticated;
revoke all on function public.list_trainer_pain_reports(uuid, uuid, boolean, integer, integer)
  from public, anon;
grant execute on function public.list_trainer_pain_reports(uuid, uuid, boolean, integer, integer)
  to authenticated;

comment on function private.record_pain_report_action(
  uuid, public.pain_report_action, text, text
) is 'Serializes one acknowledgement and one terminal resolution per pain report with retry-safe idempotency.';
comment on function public.list_trainer_pain_reports(uuid, uuid, boolean, integer, integer) is
  'Lists a verified professional pain queue scoped to one workspace and optional student, with current consent and lifecycle summaries.';
