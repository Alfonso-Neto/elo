-- Real-time operations vertical slice: workspace schedule and private trainer/student threads.
-- All writes are authority-deriving RPCs; authenticated clients receive SELECT only.

create type public.schedule_mode as enum ('in_person', 'online', 'group');
create type public.schedule_slot_state as enum ('open', 'full', 'cancelled');
create type public.schedule_session_state as enum ('requested', 'confirmed', 'declined', 'cancelled');
create type public.schedule_session_action as enum ('confirmed', 'declined', 'cancelled');
create type public.schedule_slot_action as enum ('cancelled');

create or replace function private.valid_operation_idempotency_key(candidate text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select candidate is not null
    and char_length(candidate) between 16 and 128
    and candidate ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$';
$$;

revoke all on function private.valid_operation_idempotency_key(text) from public, anon, authenticated;

-- Operational access is limited to an active student in the workspace or to a
-- verified professional. The explicit, expiring homologation allowlist used by
-- the assistant/training migrations remains the only verification exception.
create or replace function private.can_read_operations_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_training_professional((select auth.uid()), target_workspace_id)
    or exists (
      select 1
      from public.workspace_members as member
      join public.profiles as profile
        on profile.id = member.user_id
       and profile.account_role = 'student'
      where member.workspace_id = target_workspace_id
        and member.user_id = (select auth.uid())
        and member.role = 'student'
        and member.status = 'active'
    );
$$;

create or replace function private.can_read_operations_subject(
  target_workspace_id uuid,
  target_student_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
      target_student_user_id = (select auth.uid())
      and exists (
        select 1
        from public.workspace_members as student
        where student.workspace_id = target_workspace_id
          and student.user_id = target_student_user_id
          and student.role = 'student'
          and student.status = 'active'
      )
    )
    or (
      private.is_training_professional((select auth.uid()), target_workspace_id)
      and exists (
        select 1
        from public.workspace_members as student
        where student.workspace_id = target_workspace_id
          and student.user_id = target_student_user_id
          and student.role = 'student'
          and student.status = 'active'
      )
    );
$$;

revoke all on function private.can_read_operations_workspace(uuid) from public, anon;
grant execute on function private.can_read_operations_workspace(uuid) to authenticated;
revoke all on function private.can_read_operations_subject(uuid, uuid) from public, anon;
grant execute on function private.can_read_operations_subject(uuid, uuid) to authenticated;

-- Database budgets provide a conservative second line of defence. Edge/gateway
-- throttling remains required because a failed transaction rolls counters back.
create table private.operations_mutation_budgets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null check (operation in (
    'create_slot', 'request_slot', 'respond_session',
    'cancel_session', 'cancel_slot', 'send_message'
  )),
  window_started_at timestamptz not null default clock_timestamp(),
  window_count integer not null default 0 check (window_count >= 0),
  day_started_on date not null default current_date,
  daily_count integer not null default 0 check (daily_count >= 0),
  primary key (workspace_id, actor_user_id, operation)
);

revoke all on private.operations_mutation_budgets from public, anon, authenticated;

create or replace function private.consume_operations_mutation_budget(
  target_workspace_id uuid,
  target_actor_user_id uuid,
  target_operation text,
  window_limit integer,
  daily_limit integer
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  budget private.operations_mutation_budgets%rowtype;
begin
  if target_workspace_id is null or target_actor_user_id is null
    or target_operation not in (
      'create_slot', 'request_slot', 'respond_session',
      'cancel_session', 'cancel_slot', 'send_message'
    )
    or window_limit not between 1 and 100
    or daily_limit not between window_limit and 1000 then
    raise exception using errcode = '22023', message = 'invalid_operations_budget';
  end if;

  insert into private.operations_mutation_budgets (workspace_id, actor_user_id, operation)
  values (target_workspace_id, target_actor_user_id, target_operation)
  on conflict do nothing;

  select * into budget
  from private.operations_mutation_budgets
  where workspace_id = target_workspace_id
    and actor_user_id = target_actor_user_id
    and operation = target_operation
  for update;

  if budget.day_started_on <> now_at::date then
    budget.day_started_on := now_at::date;
    budget.daily_count := 0;
  end if;
  if budget.window_started_at <= now_at - interval '5 minutes' then
    budget.window_started_at := now_at;
    budget.window_count := 0;
  end if;
  if budget.window_count >= window_limit or budget.daily_count >= daily_limit then
    raise exception using errcode = '54000', message = 'operations_rate_limited';
  end if;

  update private.operations_mutation_budgets
  set window_started_at = budget.window_started_at,
      window_count = budget.window_count + 1,
      day_started_on = budget.day_started_on,
      daily_count = budget.daily_count + 1
  where workspace_id = target_workspace_id
    and actor_user_id = target_actor_user_id
    and operation = target_operation;
end;
$$;

revoke all on function private.consume_operations_mutation_budget(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;

create table public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_by_role public.workspace_role not null check (created_by_role in ('owner', 'trainer')),
  start_at timestamptz not null,
  duration_minutes smallint not null check (duration_minutes between 15 and 240),
  mode public.schedule_mode not null,
  place text not null check (
    char_length(place) between 1 and 160
    and octet_length(convert_to(place, 'UTF8')) <= 640
    and place = btrim(place)
    and place !~ '[[:cntrl:]]'
  ),
  capacity smallint not null check (capacity between 1 and 50),
  state public.schedule_slot_state not null default 'open',
  idempotency_key text not null check (private.valid_operation_idempotency_key(idempotency_key)),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, created_by_user_id, created_by_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  unique (id, workspace_id),
  unique (workspace_id, created_by_user_id, idempotency_key)
);

create index schedule_slots_workspace_start_idx
  on public.schedule_slots(workspace_id, start_at, id);

create table public.schedule_sessions (
  id uuid primary key default gen_random_uuid(),
  session_sequence bigint generated always as identity unique,
  slot_id uuid not null,
  workspace_id uuid not null,
  student_user_id uuid not null references public.profiles(id) on delete restrict,
  student_role public.workspace_role not null default 'student' check (student_role = 'student'),
  state public.schedule_session_state not null default 'requested',
  request_idempotency_key text not null check (private.valid_operation_idempotency_key(request_idempotency_key)),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  requested_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (slot_id, workspace_id)
    references public.schedule_slots(id, workspace_id) on update restrict on delete restrict,
  foreign key (workspace_id, student_user_id, student_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  unique (id, workspace_id),
  unique (workspace_id, student_user_id, request_idempotency_key)
);

create unique index schedule_sessions_one_active_student_slot_idx
  on public.schedule_sessions(slot_id, student_user_id)
  where state in ('requested', 'confirmed');
create index schedule_sessions_workspace_requested_idx
  on public.schedule_sessions(workspace_id, requested_at desc, id desc);
create index schedule_sessions_student_requested_idx
  on public.schedule_sessions(student_user_id, requested_at desc, id desc);

create table public.schedule_session_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  session_id uuid not null,
  workspace_id uuid not null,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_role public.workspace_role not null,
  action public.schedule_session_action not null,
  idempotency_key text not null check (private.valid_operation_idempotency_key(idempotency_key)),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (session_id, workspace_id)
    references public.schedule_sessions(id, workspace_id) on update restrict on delete restrict,
  foreign key (workspace_id, actor_user_id, actor_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  unique (workspace_id, actor_user_id, idempotency_key)
);

create index schedule_session_events_session_idx
  on public.schedule_session_events(session_id, event_sequence);

create table public.schedule_slot_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  slot_id uuid not null,
  workspace_id uuid not null,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_role public.workspace_role not null check (actor_role in ('owner', 'trainer')),
  action public.schedule_slot_action not null,
  idempotency_key text not null check (private.valid_operation_idempotency_key(idempotency_key)),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (slot_id, workspace_id)
    references public.schedule_slots(id, workspace_id) on update restrict on delete restrict,
  foreign key (workspace_id, actor_user_id, actor_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  unique (workspace_id, actor_user_id, idempotency_key)
);

create index schedule_slot_events_slot_idx
  on public.schedule_slot_events(slot_id, event_sequence);

create table public.thread_messages (
  id uuid primary key default gen_random_uuid(),
  message_sequence bigint generated always as identity unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete restrict,
  student_role public.workspace_role not null default 'student' check (student_role = 'student'),
  sender_user_id uuid not null references public.profiles(id) on delete restrict,
  sender_role public.workspace_role not null,
  body text not null check (
    char_length(body) between 1 and 1000
    and octet_length(convert_to(body, 'UTF8')) <= 4000
    and body = btrim(body)
    and body !~ '[[:cntrl:]]'
  ),
  check (
    (sender_role = 'student' and sender_user_id = student_user_id)
    or sender_role in ('owner', 'trainer')
  ),
  idempotency_key text not null check (private.valid_operation_idempotency_key(idempotency_key)),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  redacted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, student_user_id, student_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  foreign key (workspace_id, sender_user_id, sender_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  unique (workspace_id, sender_user_id, idempotency_key)
);

create index thread_messages_thread_idx
  on public.thread_messages(workspace_id, student_user_id, message_sequence desc);

create or replace function private.public_schedule_slot(row_value public.schedule_slots)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(row_value) - 'idempotency_key' - 'request_fingerprint';
$$;

create or replace function private.public_schedule_session(row_value public.schedule_sessions)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(row_value) - 'student_role' - 'request_idempotency_key' - 'request_fingerprint';
$$;

create or replace function private.public_thread_message(row_value public.thread_messages)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(row_value) - 'student_role' - 'idempotency_key' - 'request_fingerprint';
$$;

revoke all on function private.public_schedule_slot(public.schedule_slots) from public, anon, authenticated;
revoke all on function private.public_schedule_session(public.schedule_sessions) from public, anon, authenticated;
revoke all on function private.public_thread_message(public.thread_messages) from public, anon, authenticated;

create or replace function private.reject_thread_message_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and current_user in ('postgres', 'supabase_admin')
    and current_setting('elo.operations_redaction', true) = 'enabled'
    and old.redacted_at is null
    and new.redacted_at is not null
    and new.body = '[conteudo removido por retencao]'
    and new.request_fingerprint <> old.request_fingerprint
    and (to_jsonb(new) - 'body' - 'request_fingerprint' - 'redacted_at')
      = (to_jsonb(old) - 'body' - 'request_fingerprint' - 'redacted_at') then
    return new;
  end if;
  raise exception using errcode = '55000', message = 'append_only_resource';
end;
$$;

revoke all on function private.reject_thread_message_mutation() from public, anon, authenticated;

create trigger schedule_slots_touch_updated_at before update on public.schedule_slots
for each row execute function private.touch_updated_at();
create trigger schedule_sessions_touch_updated_at before update on public.schedule_sessions
for each row execute function private.touch_updated_at();
create trigger schedule_session_events_server_timestamp before insert on public.schedule_session_events
for each row execute function private.set_event_created_at();
create trigger schedule_session_events_are_append_only before update or delete on public.schedule_session_events
for each row execute function private.reject_append_only_mutation();
create trigger schedule_slot_events_server_timestamp before insert on public.schedule_slot_events
for each row execute function private.set_event_created_at();
create trigger schedule_slot_events_are_append_only before update or delete on public.schedule_slot_events
for each row execute function private.reject_append_only_mutation();
create trigger thread_messages_server_timestamp before insert on public.thread_messages
for each row execute function private.set_event_created_at();
create trigger thread_messages_are_append_only before update or delete on public.thread_messages
for each row execute function private.reject_thread_message_mutation();

alter table public.schedule_slots enable row level security;
alter table public.schedule_sessions enable row level security;
alter table public.schedule_session_events enable row level security;
alter table public.schedule_slot_events enable row level security;
alter table public.thread_messages enable row level security;

create policy schedule_slots_select_member on public.schedule_slots
for select to authenticated
using (private.can_read_operations_workspace(workspace_id));

create policy schedule_sessions_select_scoped on public.schedule_sessions
for select to authenticated
using (
  private.can_read_operations_subject(workspace_id, student_user_id)
);

create policy schedule_session_events_select_scoped on public.schedule_session_events
for select to authenticated
using (
  exists (
    select 1
    from public.schedule_sessions as session
    where session.id = schedule_session_events.session_id
      and session.workspace_id = schedule_session_events.workspace_id
      and private.can_read_operations_subject(session.workspace_id, session.student_user_id)
  )
);

create policy schedule_slot_events_select_professional on public.schedule_slot_events
for select to authenticated
using (private.can_read_training_workspace(workspace_id));

create policy thread_messages_select_scoped on public.thread_messages
for select to authenticated
using (
  private.can_read_operations_subject(workspace_id, student_user_id)
);

revoke all on public.schedule_slots, public.schedule_sessions,
  public.schedule_session_events, public.schedule_slot_events,
  public.thread_messages from public, anon, authenticated;
grant select (
  id, workspace_id, created_by_user_id, created_by_role, start_at,
  duration_minutes, mode, place, capacity, state, created_at, updated_at
) on public.schedule_slots to authenticated;
grant select (
  id, session_sequence, slot_id, workspace_id, student_user_id,
  state, requested_at, updated_at
) on public.schedule_sessions to authenticated;
grant select (
  id, event_sequence, session_id, workspace_id, actor_user_id,
  actor_role, action, created_at
) on public.schedule_session_events to authenticated;
grant select (
  id, event_sequence, slot_id, workspace_id, actor_user_id,
  actor_role, action, created_at
) on public.schedule_slot_events to authenticated;
grant select (
  id, message_sequence, workspace_id, student_user_id, sender_user_id,
  sender_role, body, redacted_at, created_at
) on public.thread_messages to authenticated;

revoke all on sequence public.schedule_sessions_session_sequence_seq,
  public.schedule_session_events_event_sequence_seq,
  public.schedule_slot_events_event_sequence_seq,
  public.thread_messages_message_sequence_seq from public, anon, authenticated;

create or replace function public.create_schedule_slot(
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_mode text,
  p_place text,
  p_capacity integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  resolved_workspace_id uuid;
  caller_role public.workspace_role;
  workspace_count integer;
  clean_place text;
  clean_mode public.schedule_mode;
  fingerprint bytea;
  existing_slot public.schedule_slots%rowtype;
  created_slot public.schedule_slots%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not private.valid_operation_idempotency_key(p_idempotency_key) then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;
  if p_mode is null or p_mode not in ('in_person', 'online', 'group') then
    raise exception using errcode = '22023', message = 'invalid schedule mode';
  end if;
  if p_start_at is null
     or p_duration_minutes is null or p_duration_minutes not between 15 and 240
     or p_capacity is null or p_capacity not between 1 and 50
     or p_place is null or char_length(p_place) not between 1 and 160
     or octet_length(convert_to(p_place, 'UTF8')) > 640
     or p_place ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid schedule slot';
  end if;

  clean_place := btrim(regexp_replace(p_place, '[[:space:]]+', ' ', 'g'));
  if char_length(clean_place) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid schedule place';
  end if;
  clean_mode := p_mode::public.schedule_mode;

  select count(*), min(member.workspace_id::text)::uuid
  into workspace_count, resolved_workspace_id
  from public.workspace_members as member
  where member.user_id = caller_id
    and member.role in ('owner', 'trainer')
    and member.status = 'active'
    and private.is_training_professional(caller_id, member.workspace_id);
  if workspace_count = 0 then
    raise exception using errcode = '42501', message = 'one active trainer workspace is required';
  elsif workspace_count > 1 then
    raise exception using errcode = '21000', message = 'trainer workspace is ambiguous';
  end if;

  select member.role
  into caller_role
  from public.workspace_members as member
  where member.workspace_id = resolved_workspace_id
    and member.user_id = caller_id
    and member.status = 'active'
    and member.role in ('owner', 'trainer')
    and private.is_training_professional(caller_id, member.workspace_id)
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'one active trainer workspace is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'schedule-slot:' || resolved_workspace_id::text || ':' || caller_id::text || ':' || p_idempotency_key,
      0
    )
  );

  fingerprint := extensions.digest(
    concat_ws(
      chr(31), resolved_workspace_id::text, caller_id::text,
      extract(epoch from p_start_at)::text, p_duration_minutes::text,
      clean_mode::text, clean_place, p_capacity::text
    ),
    'sha256'
  );

  select slot.* into existing_slot
  from public.schedule_slots as slot
  where slot.workspace_id = resolved_workspace_id
    and slot.created_by_user_id = caller_id
    and slot.idempotency_key = p_idempotency_key;
  if found then
    if existing_slot.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return private.public_schedule_slot(existing_slot);
  end if;

  if p_start_at < clock_timestamp() + interval '5 minutes'
     or p_start_at > clock_timestamp() + interval '365 days' then
    raise exception using errcode = '22023', message = 'invalid schedule slot';
  end if;

  perform private.consume_operations_mutation_budget(
    resolved_workspace_id, caller_id, 'create_slot', 20, 100
  );

  insert into public.schedule_slots (
    workspace_id, created_by_user_id, created_by_role, start_at,
    duration_minutes, mode, place, capacity, idempotency_key, request_fingerprint
  ) values (
    resolved_workspace_id, caller_id, caller_role, p_start_at,
    p_duration_minutes, clean_mode, clean_place, p_capacity, p_idempotency_key, fingerprint
  )
  on conflict (workspace_id, created_by_user_id, idempotency_key) do nothing
  returning * into created_slot;

  if created_slot.id is not null then return private.public_schedule_slot(created_slot); end if;
  select slot.* into existing_slot
  from public.schedule_slots as slot
  where slot.workspace_id = resolved_workspace_id
    and slot.created_by_user_id = caller_id
    and slot.idempotency_key = p_idempotency_key;
  if not found or existing_slot.request_fingerprint <> fingerprint then
    raise exception using errcode = '22023', message = 'idempotency key conflict';
  end if;
  return private.public_schedule_slot(existing_slot);
end;
$$;

create or replace function public.request_schedule_slot(
  p_slot_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_slot public.schedule_slots%rowtype;
  existing_session public.schedule_sessions%rowtype;
  created_session public.schedule_sessions%rowtype;
  confirmed_count integer;
  fingerprint bytea;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_slot_id is null or not private.valid_operation_idempotency_key(p_idempotency_key) then
    raise exception using errcode = '22023', message = 'invalid schedule request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('schedule-request:' || caller_id::text || ':' || p_idempotency_key, 0)
  );

  select slot.* into target_slot
  from public.schedule_slots as slot
  join public.workspace_members as member
    on member.workspace_id = slot.workspace_id
   and member.user_id = caller_id
   and member.role = 'student'
   and member.status = 'active'
  where slot.id = p_slot_id
  for update of slot
  for share of member;
  if not found then
    raise exception using errcode = '42501', message = 'schedule slot is unavailable';
  end if;

  fingerprint := extensions.digest(
    concat_ws(chr(31), target_slot.workspace_id::text, caller_id::text, p_slot_id::text),
    'sha256'
  );

  select session.* into existing_session
  from public.schedule_sessions as session
  where session.workspace_id = target_slot.workspace_id
    and session.student_user_id = caller_id
    and session.request_idempotency_key = p_idempotency_key;
  if found then
    if existing_session.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return private.public_schedule_session(existing_session);
  end if;

  perform private.consume_operations_mutation_budget(
    target_slot.workspace_id, caller_id, 'request_slot', 20, 100
  );

  if target_slot.state <> 'open' or target_slot.start_at <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'schedule slot is unavailable';
  end if;
  select count(*) into confirmed_count
  from public.schedule_sessions as session
  where session.slot_id = target_slot.id and session.state = 'confirmed';
  if confirmed_count >= target_slot.capacity then
    raise exception using errcode = 'P0001', message = 'schedule slot is unavailable';
  end if;
  if exists (
    select 1 from public.schedule_sessions as session
    where session.slot_id = target_slot.id
      and session.student_user_id = caller_id
      and session.state in ('requested', 'confirmed')
  ) then
    raise exception using errcode = 'P0001', message = 'schedule request already exists';
  end if;

  insert into public.schedule_sessions (
    slot_id, workspace_id, student_user_id, request_idempotency_key, request_fingerprint
  ) values (
    target_slot.id, target_slot.workspace_id, caller_id, p_idempotency_key, fingerprint
  )
  on conflict (workspace_id, student_user_id, request_idempotency_key) do nothing
  returning * into created_session;

  if created_session.id is not null then return private.public_schedule_session(created_session); end if;
  select session.* into existing_session
  from public.schedule_sessions as session
  where session.workspace_id = target_slot.workspace_id
    and session.student_user_id = caller_id
    and session.request_idempotency_key = p_idempotency_key;
  if not found or existing_session.request_fingerprint <> fingerprint then
    raise exception using errcode = '22023', message = 'idempotency key conflict';
  end if;
  return private.public_schedule_session(existing_session);
end;
$$;

create or replace function public.respond_schedule_session(
  p_session_id uuid,
  p_decision text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role public.workspace_role;
  target_session public.schedule_sessions%rowtype;
  target_slot public.schedule_slots%rowtype;
  existing_event public.schedule_session_events%rowtype;
  confirmed_count integer;
  decision_action public.schedule_session_action;
  fingerprint bytea;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_session_id is null
     or p_decision is null or p_decision not in ('confirmed', 'declined')
     or not private.valid_operation_idempotency_key(p_idempotency_key) then
    raise exception using errcode = '22023', message = 'invalid schedule response';
  end if;
  decision_action := p_decision::public.schedule_session_action;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('schedule-session-event:' || caller_id::text || ':' || p_idempotency_key, 0)
  );

  select session.*
  into target_session
  from public.schedule_sessions as session
  join public.workspace_members as member
    on member.workspace_id = session.workspace_id
   and member.user_id = caller_id
   and member.role in ('owner', 'trainer')
   and member.status = 'active'
   and private.is_training_professional(caller_id, session.workspace_id)
  where session.id = p_session_id
  for update of session;
  if not found then
    raise exception using errcode = '42501', message = 'schedule session is unavailable';
  end if;

  select member.role
  into caller_role
  from public.workspace_members as member
  where member.workspace_id = target_session.workspace_id
    and member.user_id = caller_id
    and member.role in ('owner', 'trainer')
    and member.status = 'active'
    and private.is_training_professional(caller_id, member.workspace_id)
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'schedule session is unavailable';
  end if;

  select slot.* into target_slot
  from public.schedule_slots as slot
  where slot.id = target_session.slot_id
    and slot.workspace_id = target_session.workspace_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'schedule session is unavailable';
  end if;

  fingerprint := extensions.digest(
    concat_ws(
      chr(31), target_session.workspace_id::text, p_session_id::text,
      caller_id::text, decision_action::text
    ),
    'sha256'
  );

  select event.* into existing_event
  from public.schedule_session_events as event
  where event.workspace_id = target_session.workspace_id
    and event.actor_user_id = caller_id
    and event.idempotency_key = p_idempotency_key;
  if found then
    if existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return private.public_schedule_session(target_session);
  end if;

  perform private.consume_operations_mutation_budget(
    target_session.workspace_id, caller_id, 'respond_session', 30, 200
  );

  if target_session.state <> 'requested' then
    raise exception using errcode = 'P0001', message = 'schedule session cannot be changed';
  end if;

  if decision_action = 'confirmed' then
    if target_slot.state <> 'open' or target_slot.start_at <= clock_timestamp() then
      raise exception using errcode = 'P0001', message = 'schedule slot is unavailable';
    end if;
    select count(*) into confirmed_count
    from public.schedule_sessions as session
    where session.slot_id = target_slot.id and session.state = 'confirmed';
    if confirmed_count >= target_slot.capacity then
      raise exception using errcode = 'P0001', message = 'schedule slot has no capacity';
    end if;

    update public.schedule_sessions
    set state = 'confirmed'
    where id = target_session.id
    returning * into target_session;

    if confirmed_count + 1 >= target_slot.capacity then
      update public.schedule_slots set state = 'full' where id = target_slot.id;
    end if;
  else
    update public.schedule_sessions
    set state = 'declined'
    where id = target_session.id
    returning * into target_session;
  end if;

  insert into public.schedule_session_events (
    session_id, workspace_id, actor_user_id, actor_role,
    action, idempotency_key, request_fingerprint
  ) values (
    target_session.id, target_session.workspace_id, caller_id, caller_role,
    decision_action, p_idempotency_key, fingerprint
  );

  return private.public_schedule_session(target_session);
end;
$$;

create or replace function public.cancel_own_schedule_session(
  p_session_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_session public.schedule_sessions%rowtype;
  target_slot public.schedule_slots%rowtype;
  existing_event public.schedule_session_events%rowtype;
  previous_state public.schedule_session_state;
  confirmed_count integer;
  fingerprint bytea;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_session_id is null or not private.valid_operation_idempotency_key(p_idempotency_key) then
    raise exception using errcode = '22023', message = 'invalid schedule cancellation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('schedule-session-event:' || caller_id::text || ':' || p_idempotency_key, 0)
  );

  select session.* into target_session
  from public.schedule_sessions as session
  join public.workspace_members as member
    on member.workspace_id = session.workspace_id
   and member.user_id = caller_id
   and member.role = 'student'
   and member.status = 'active'
  where session.id = p_session_id
    and session.student_user_id = caller_id
  for update of session
  for share of member;
  if not found then
    raise exception using errcode = '42501', message = 'schedule session is unavailable';
  end if;

  select slot.* into target_slot
  from public.schedule_slots as slot
  where slot.id = target_session.slot_id
    and slot.workspace_id = target_session.workspace_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'schedule session is unavailable';
  end if;

  fingerprint := extensions.digest(
    concat_ws(chr(31), target_session.workspace_id::text, p_session_id::text, caller_id::text, 'cancelled'),
    'sha256'
  );

  select event.* into existing_event
  from public.schedule_session_events as event
  where event.workspace_id = target_session.workspace_id
    and event.actor_user_id = caller_id
    and event.idempotency_key = p_idempotency_key;
  if found then
    if existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return private.public_schedule_session(target_session);
  end if;

  perform private.consume_operations_mutation_budget(
    target_session.workspace_id, caller_id, 'cancel_session', 30, 200
  );

  if target_session.state not in ('requested', 'confirmed')
     or target_slot.start_at <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'schedule session cannot be cancelled';
  end if;
  previous_state := target_session.state;

  update public.schedule_sessions
  set state = 'cancelled'
  where id = target_session.id
  returning * into target_session;

  if previous_state = 'confirmed' and target_slot.state = 'full' then
    select count(*) into confirmed_count
    from public.schedule_sessions as session
    where session.slot_id = target_slot.id and session.state = 'confirmed';
    if confirmed_count < target_slot.capacity then
      update public.schedule_slots set state = 'open' where id = target_slot.id;
    end if;
  end if;

  insert into public.schedule_session_events (
    session_id, workspace_id, actor_user_id, actor_role,
    action, idempotency_key, request_fingerprint
  ) values (
    target_session.id, target_session.workspace_id, caller_id, 'student',
    'cancelled', p_idempotency_key, fingerprint
  );

  return private.public_schedule_session(target_session);
end;
$$;

create or replace function public.cancel_schedule_session(
  p_session_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role public.workspace_role;
  target_session public.schedule_sessions%rowtype;
  target_slot public.schedule_slots%rowtype;
  existing_event public.schedule_session_events%rowtype;
  previous_state public.schedule_session_state;
  confirmed_count integer;
  fingerprint bytea;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_session_id is null or not private.valid_operation_idempotency_key(p_idempotency_key) then
    raise exception using errcode = '22023', message = 'invalid schedule cancellation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('schedule-session-event:' || caller_id::text || ':' || p_idempotency_key, 0)
  );

  select session.* into target_session
  from public.schedule_sessions as session
  join public.workspace_members as member
    on member.workspace_id = session.workspace_id
   and member.user_id = caller_id
   and member.role in ('owner', 'trainer')
   and member.status = 'active'
   and private.is_training_professional(caller_id, session.workspace_id)
  where session.id = p_session_id
  for update of session;
  if not found then
    raise exception using errcode = '42501', message = 'schedule session is unavailable';
  end if;

  select member.role into caller_role
  from public.workspace_members as member
  where member.workspace_id = target_session.workspace_id
    and member.user_id = caller_id
    and member.role in ('owner', 'trainer')
    and member.status = 'active'
    and private.is_training_professional(caller_id, member.workspace_id)
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'schedule session is unavailable';
  end if;

  select slot.* into target_slot
  from public.schedule_slots as slot
  where slot.id = target_session.slot_id
    and slot.workspace_id = target_session.workspace_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'schedule session is unavailable';
  end if;

  fingerprint := extensions.digest(
    concat_ws(chr(31), target_session.workspace_id::text, p_session_id::text, caller_id::text, 'cancelled'),
    'sha256'
  );

  select event.* into existing_event
  from public.schedule_session_events as event
  where event.workspace_id = target_session.workspace_id
    and event.actor_user_id = caller_id
    and event.idempotency_key = p_idempotency_key;
  if found then
    if existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return private.public_schedule_session(target_session);
  end if;

  perform private.consume_operations_mutation_budget(
    target_session.workspace_id, caller_id, 'cancel_session', 30, 200
  );

  if target_session.state not in ('requested', 'confirmed')
     or target_slot.start_at <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'schedule session cannot be cancelled';
  end if;
  previous_state := target_session.state;

  update public.schedule_sessions
  set state = 'cancelled'
  where id = target_session.id
  returning * into target_session;

  if previous_state = 'confirmed' and target_slot.state = 'full' then
    select count(*) into confirmed_count
    from public.schedule_sessions as session
    where session.slot_id = target_slot.id and session.state = 'confirmed';
    if confirmed_count < target_slot.capacity then
      update public.schedule_slots set state = 'open' where id = target_slot.id;
    end if;
  end if;

  insert into public.schedule_session_events (
    session_id, workspace_id, actor_user_id, actor_role,
    action, idempotency_key, request_fingerprint
  ) values (
    target_session.id, target_session.workspace_id, caller_id, caller_role,
    'cancelled', p_idempotency_key, fingerprint
  );

  return private.public_schedule_session(target_session);
end;
$$;

create or replace function public.cancel_schedule_slot(
  p_slot_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role public.workspace_role;
  target_slot public.schedule_slots%rowtype;
  existing_event public.schedule_slot_events%rowtype;
  fingerprint bytea;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_slot_id is null or not private.valid_operation_idempotency_key(p_idempotency_key) then
    raise exception using errcode = '22023', message = 'invalid slot cancellation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('schedule-slot-event:' || caller_id::text || ':' || p_idempotency_key, 0)
  );

  select slot.* into target_slot
  from public.schedule_slots as slot
  join public.workspace_members as member
    on member.workspace_id = slot.workspace_id
   and member.user_id = caller_id
   and member.role in ('owner', 'trainer')
   and member.status = 'active'
   and private.is_training_professional(caller_id, slot.workspace_id)
  where slot.id = p_slot_id
  for update of slot;
  if not found then
    raise exception using errcode = '42501', message = 'schedule slot is unavailable';
  end if;

  select member.role into caller_role
  from public.workspace_members as member
  where member.workspace_id = target_slot.workspace_id
    and member.user_id = caller_id
    and member.role in ('owner', 'trainer')
    and member.status = 'active'
    and private.is_training_professional(caller_id, member.workspace_id)
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'schedule slot is unavailable';
  end if;

  fingerprint := extensions.digest(
    concat_ws(chr(31), target_slot.workspace_id::text, p_slot_id::text, caller_id::text, 'cancelled'),
    'sha256'
  );

  select event.* into existing_event
  from public.schedule_slot_events as event
  where event.workspace_id = target_slot.workspace_id
    and event.actor_user_id = caller_id
    and event.idempotency_key = p_idempotency_key;
  if found then
    if existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return private.public_schedule_slot(target_slot);
  end if;

  perform private.consume_operations_mutation_budget(
    target_slot.workspace_id, caller_id, 'cancel_slot', 20, 100
  );

  if target_slot.state = 'cancelled' or target_slot.start_at <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'schedule slot cannot be cancelled';
  end if;

  update public.schedule_slots
  set state = 'cancelled'
  where id = target_slot.id
  returning * into target_slot;

  update public.schedule_sessions
  set state = 'cancelled'
  where slot_id = target_slot.id
    and workspace_id = target_slot.workspace_id
    and state in ('requested', 'confirmed');

  insert into public.schedule_slot_events (
    slot_id, workspace_id, actor_user_id, actor_role,
    action, idempotency_key, request_fingerprint
  ) values (
    target_slot.id, target_slot.workspace_id, caller_id, caller_role,
    'cancelled', p_idempotency_key, fingerprint
  );

  return private.public_schedule_slot(target_slot);
end;
$$;

create or replace function public.send_student_thread_message(
  p_body text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  resolved_workspace_id uuid;
  workspace_count integer;
  clean_body text;
  fingerprint bytea;
  existing_message public.thread_messages%rowtype;
  created_message public.thread_messages%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not private.valid_operation_idempotency_key(p_idempotency_key)
     or p_body is null or char_length(p_body) not between 1 and 1000
     or octet_length(convert_to(p_body, 'UTF8')) > 4000
     or p_body ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid message';
  end if;
  clean_body := btrim(regexp_replace(p_body, '[[:space:]]+', ' ', 'g'));
  if char_length(clean_body) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid message';
  end if;

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

  perform 1
  from public.workspace_members as member
  where member.workspace_id = resolved_workspace_id
    and member.user_id = caller_id
    and member.role = 'student'
    and member.status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'one active student workspace is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('thread-message:' || caller_id::text || ':' || p_idempotency_key, 0)
  );
  fingerprint := extensions.digest(
    concat_ws(
      chr(31), resolved_workspace_id::text, caller_id::text,
      caller_id::text, 'student', clean_body
    ),
    'sha256'
  );

  select message.* into existing_message
  from public.thread_messages as message
  where message.workspace_id = resolved_workspace_id
    and message.sender_user_id = caller_id
    and message.idempotency_key = p_idempotency_key;
  if found then
    if existing_message.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return private.public_thread_message(existing_message);
  end if;

  perform private.consume_operations_mutation_budget(
    resolved_workspace_id, caller_id, 'send_message', 30, 500
  );

  insert into public.thread_messages (
    workspace_id, student_user_id, sender_user_id, sender_role,
    body, idempotency_key, request_fingerprint
  ) values (
    resolved_workspace_id, caller_id, caller_id, 'student',
    clean_body, p_idempotency_key, fingerprint
  )
  on conflict (workspace_id, sender_user_id, idempotency_key) do nothing
  returning * into created_message;
  if created_message.id is not null then return private.public_thread_message(created_message); end if;

  select message.* into existing_message
  from public.thread_messages as message
  where message.workspace_id = resolved_workspace_id
    and message.sender_user_id = caller_id
    and message.idempotency_key = p_idempotency_key;
  if not found or existing_message.request_fingerprint <> fingerprint then
    raise exception using errcode = '22023', message = 'idempotency key conflict';
  end if;
  return private.public_thread_message(existing_message);
end;
$$;

create or replace function public.send_trainer_thread_message(
  p_student_user_id uuid,
  p_body text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  resolved_workspace_id uuid;
  caller_role public.workspace_role;
  workspace_count integer;
  clean_body text;
  fingerprint bytea;
  existing_message public.thread_messages%rowtype;
  created_message public.thread_messages%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_student_user_id is null
     or not private.valid_operation_idempotency_key(p_idempotency_key)
     or p_body is null or char_length(p_body) not between 1 and 1000
     or octet_length(convert_to(p_body, 'UTF8')) > 4000
     or p_body ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid message';
  end if;
  clean_body := btrim(regexp_replace(p_body, '[[:space:]]+', ' ', 'g'));
  if char_length(clean_body) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid message';
  end if;

  select count(*), min(member.workspace_id::text)::uuid
  into workspace_count, resolved_workspace_id
  from public.workspace_members as member
  where member.user_id = caller_id
    and member.role in ('owner', 'trainer')
    and member.status = 'active'
    and private.is_training_professional(caller_id, member.workspace_id);
  if workspace_count = 0 then
    raise exception using errcode = '42501', message = 'one active trainer workspace is required';
  elsif workspace_count > 1 then
    raise exception using errcode = '21000', message = 'trainer workspace is ambiguous';
  end if;

  select member.role into caller_role
  from public.workspace_members as member
  where member.workspace_id = resolved_workspace_id
    and member.user_id = caller_id
    and member.role in ('owner', 'trainer')
    and member.status = 'active'
    and private.is_training_professional(caller_id, member.workspace_id)
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'one active trainer workspace is required';
  end if;

  perform 1
    from public.workspace_members as student
    join public.profiles as profile on profile.id = student.user_id
    where student.workspace_id = resolved_workspace_id
      and student.user_id = p_student_user_id
      and student.role = 'student'
      and student.status = 'active'
      and profile.account_role = 'student'
  for share of student;
  if not found then
    raise exception using errcode = '42501', message = 'message thread is unavailable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('thread-message:' || caller_id::text || ':' || p_idempotency_key, 0)
  );
  fingerprint := extensions.digest(
    concat_ws(
      chr(31), resolved_workspace_id::text, p_student_user_id::text,
      caller_id::text, caller_role::text, clean_body
    ),
    'sha256'
  );

  select message.* into existing_message
  from public.thread_messages as message
  where message.workspace_id = resolved_workspace_id
    and message.sender_user_id = caller_id
    and message.idempotency_key = p_idempotency_key;
  if found then
    if existing_message.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return private.public_thread_message(existing_message);
  end if;

  perform private.consume_operations_mutation_budget(
    resolved_workspace_id, caller_id, 'send_message', 30, 500
  );

  insert into public.thread_messages (
    workspace_id, student_user_id, sender_user_id, sender_role,
    body, idempotency_key, request_fingerprint
  ) values (
    resolved_workspace_id, p_student_user_id, caller_id, caller_role,
    clean_body, p_idempotency_key, fingerprint
  )
  on conflict (workspace_id, sender_user_id, idempotency_key) do nothing
  returning * into created_message;
  if created_message.id is not null then return private.public_thread_message(created_message); end if;

  select message.* into existing_message
  from public.thread_messages as message
  where message.workspace_id = resolved_workspace_id
    and message.sender_user_id = caller_id
    and message.idempotency_key = p_idempotency_key;
  if not found or existing_message.request_fingerprint <> fingerprint then
    raise exception using errcode = '22023', message = 'idempotency key conflict';
  end if;
  return private.public_thread_message(existing_message);
end;
$$;

revoke all on function public.create_schedule_slot(timestamptz, integer, text, text, integer, text)
  from public, anon;
revoke all on function public.request_schedule_slot(uuid, text) from public, anon;
revoke all on function public.respond_schedule_session(uuid, text, text) from public, anon;
revoke all on function public.cancel_own_schedule_session(uuid, text) from public, anon;
revoke all on function public.cancel_schedule_session(uuid, text) from public, anon;
revoke all on function public.cancel_schedule_slot(uuid, text) from public, anon;
revoke all on function public.send_student_thread_message(text, text) from public, anon;
revoke all on function public.send_trainer_thread_message(uuid, text, text) from public, anon;

grant execute on function public.create_schedule_slot(timestamptz, integer, text, text, integer, text)
  to authenticated;
grant execute on function public.request_schedule_slot(uuid, text) to authenticated;
grant execute on function public.respond_schedule_session(uuid, text, text) to authenticated;
grant execute on function public.cancel_own_schedule_session(uuid, text) to authenticated;
grant execute on function public.cancel_schedule_session(uuid, text) to authenticated;
grant execute on function public.cancel_schedule_slot(uuid, text) to authenticated;
grant execute on function public.send_student_thread_message(text, text) to authenticated;
grant execute on function public.send_trainer_thread_message(uuid, text, text) to authenticated;

-- Minimal payload-retention hook. This pseudonymizes message content but does
-- not replace the production identity-deletion runbook.
create table private.operations_redaction_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subject_reference bytea not null check (octet_length(subject_reference) = 32),
  reason text not null check (
    char_length(reason) between 4 and 500
    and reason = btrim(reason)
    and reason !~ '[[:cntrl:]]'
  ),
  messages_redacted integer not null check (messages_redacted >= 0),
  executed_by text not null,
  executed_at timestamptz not null default clock_timestamp()
);

revoke all on private.operations_redaction_events from public, anon, authenticated;

create or replace function private.redact_operations_subject_messages(
  target_workspace_id uuid,
  target_student_user_id uuid,
  redaction_reason text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean_reason text;
  event_id uuid;
  message_count integer := 0;
begin
  if current_user not in ('postgres', 'supabase_admin')
    or target_workspace_id is null or target_student_user_id is null
    or redaction_reason is null
    or char_length(redaction_reason) not between 4 and 500
    or redaction_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '42501', message = 'retention_operation_unavailable';
  end if;
  clean_reason := btrim(redaction_reason);
  if char_length(clean_reason) not between 4 and 500 then
    raise exception using errcode = '42501', message = 'retention_operation_unavailable';
  end if;

  perform set_config('elo.operations_redaction', 'enabled', true);
  update public.thread_messages
  set body = '[conteudo removido por retencao]',
      request_fingerprint = extensions.digest(convert_to(gen_random_uuid()::text, 'UTF8'), 'sha256'),
      redacted_at = clock_timestamp()
  where workspace_id = target_workspace_id
    and student_user_id = target_student_user_id
    and redacted_at is null;
  get diagnostics message_count = row_count;

  insert into private.operations_redaction_events (
    workspace_id, subject_reference, reason, messages_redacted, executed_by
  ) values (
    target_workspace_id,
    extensions.digest(
      convert_to(target_workspace_id::text || ':' || target_student_user_id::text, 'UTF8'),
      'sha256'
    ),
    clean_reason,
    message_count,
    current_user
  ) returning id into event_id;
  return event_id;
end;
$$;

revoke all on function private.redact_operations_subject_messages(uuid, uuid, text)
  from public, anon, authenticated;

comment on table public.schedule_slots is
  'Workspace-scoped trainer-created availability; writes are RPC-only.';
comment on table public.schedule_sessions is
  'Student self-requests and their current trainer-reviewed schedule state.';
comment on table public.schedule_session_events is
  'Append-only idempotent decision and cancellation audit trail.';
comment on table public.schedule_slot_events is
  'Append-only professional cancellation audit trail for schedule slots.';
comment on table public.thread_messages is
  'Append-only private trainer/student workspace messages; sender identity is server-derived.';
comment on function private.redact_operations_subject_messages(uuid, uuid, text) is
  'Owner-only retention hook that pseudonymizes private message payloads and records aggregate audit evidence.';
