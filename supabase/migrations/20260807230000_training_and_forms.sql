-- Immutable training prescriptions, workout feedback, anamnesis, and private notes.
-- This migration depends on identity/access (193000), consent/signals (203000),
-- and the one-active-student membership invariant (220000). No sample data is added.

create or replace function private.valid_workout_exercises(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  field_name text;
begin
  if value is null or jsonb_typeof(value) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(value) < 1
    or jsonb_array_length(value) > 50
    or pg_column_size(value) > 65536 then
    return false;
  end if;

  for item in select element from jsonb_array_elements(value) as entry(element) loop
    if jsonb_typeof(item) <> 'object'
      or not (item ?& array['id','name','muscle','sets','reps','load','rest','tempo','rir','note']) then
      return false;
    end if;

    for field_name in select key from jsonb_object_keys(item) as fields(key) loop
      if field_name not in ('id','name','muscle','sets','reps','load','rest','tempo','rir','note','suggested') then
        return false;
      end if;
    end loop;

    if jsonb_typeof(item -> 'id') <> 'string'
      or (item ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
      or jsonb_typeof(item -> 'name') <> 'string'
      or char_length(item ->> 'name') not between 2 and 120
      or (item ->> 'name') <> btrim(item ->> 'name')
      or (item ->> 'name') ~ '[[:cntrl:]]'
      or jsonb_typeof(item -> 'muscle') <> 'string'
      or char_length(item ->> 'muscle') not between 1 and 80
      or (item ->> 'muscle') <> btrim(item ->> 'muscle')
      or (item ->> 'muscle') ~ '[[:cntrl:]]'
      or jsonb_typeof(item -> 'sets') <> 'string'
      or char_length(item ->> 'sets') not between 1 and 40
      or (item ->> 'sets') <> btrim(item ->> 'sets')
      or (item ->> 'sets') ~ '[[:cntrl:]]'
      or jsonb_typeof(item -> 'reps') <> 'string'
      or char_length(item ->> 'reps') not between 1 and 40
      or (item ->> 'reps') <> btrim(item ->> 'reps')
      or (item ->> 'reps') ~ '[[:cntrl:]]'
      or jsonb_typeof(item -> 'load') <> 'string'
      or char_length(item ->> 'load') not between 1 and 40
      or (item ->> 'load') <> btrim(item ->> 'load')
      or (item ->> 'load') ~ '[[:cntrl:]]'
      or jsonb_typeof(item -> 'rest') <> 'string'
      or char_length(item ->> 'rest') not between 1 and 40
      or (item ->> 'rest') <> btrim(item ->> 'rest')
      or (item ->> 'rest') ~ '[[:cntrl:]]'
      or jsonb_typeof(item -> 'tempo') <> 'string'
      or char_length(item ->> 'tempo') not between 1 and 40
      or (item ->> 'tempo') <> btrim(item ->> 'tempo')
      or (item ->> 'tempo') ~ '[[:cntrl:]]'
      or jsonb_typeof(item -> 'rir') <> 'string'
      or char_length(item ->> 'rir') not between 1 and 40
      or (item ->> 'rir') <> btrim(item ->> 'rir')
      or (item ->> 'rir') ~ '[[:cntrl:]]'
      or jsonb_typeof(item -> 'note') <> 'string'
      or char_length(item ->> 'note') > 500
      or ((item ->> 'note') <> '' and (item ->> 'note') <> btrim(item ->> 'note'))
      or (item ->> 'note') ~ '[[:cntrl:]]'
      or (item ? 'suggested' and jsonb_typeof(item -> 'suggested') <> 'boolean') then
      return false;
    end if;
  end loop;

  return (
    select count(*) = count(distinct element ->> 'id')
    from jsonb_array_elements(value) as entry(element)
  );
end;
$$;

create or replace function private.valid_form_questions(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  option_value jsonb;
  field_name text;
  question_type text;
begin
  if value is null or jsonb_typeof(value) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(value) < 1
    or jsonb_array_length(value) > 50
    or pg_column_size(value) > 65536 then
    return false;
  end if;

  for item in select element from jsonb_array_elements(value) as entry(element) loop
    if jsonb_typeof(item) <> 'object' or not (item ?& array['id','label','type']) then
      return false;
    end if;

    for field_name in select key from jsonb_object_keys(item) as fields(key) loop
      if field_name not in ('id','label','type','options','required') then
        return false;
      end if;
    end loop;

    question_type := item ->> 'type';
    if jsonb_typeof(item -> 'id') <> 'string'
      or (item ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
      or jsonb_typeof(item -> 'label') <> 'string'
      or char_length(item ->> 'label') not between 2 and 180
      or (item ->> 'label') <> btrim(item ->> 'label')
      or (item ->> 'label') ~ '[[:cntrl:]]'
      or jsonb_typeof(item -> 'type') <> 'string'
      or question_type not in ('text','long','single','multi','scale','yesno','number')
      or (item ? 'required' and jsonb_typeof(item -> 'required') <> 'boolean') then
      return false;
    end if;

    if question_type in ('single','multi') then
      if not (item ? 'options') or jsonb_typeof(item -> 'options') <> 'array' then
        return false;
      end if;
      if jsonb_array_length(item -> 'options') not between 2 and 20 then
        return false;
      end if;
      for option_value in select element from jsonb_array_elements(item -> 'options') as options(element) loop
        if jsonb_typeof(option_value) <> 'string'
          or char_length(option_value #>> '{}') not between 1 and 100
          or (option_value #>> '{}') <> btrim(option_value #>> '{}')
          or (option_value #>> '{}') ~ '[[:cntrl:]]' then
          return false;
        end if;
      end loop;
      if (
        select count(*) <> count(distinct element)
        from jsonb_array_elements(item -> 'options') as options(element)
      ) then
        return false;
      end if;
    elsif item ? 'options' then
      return false;
    end if;
  end loop;

  return (
    select count(*) = count(distinct element ->> 'id')
    from jsonb_array_elements(value) as entry(element)
  );
end;
$$;

create or replace function private.valid_exercise_id_array(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null or jsonb_typeof(value) <> 'array' then false
    when jsonb_array_length(value) > 50
      or pg_column_size(value) > 4096 then false
    else
      not exists (
        select 1
        from jsonb_array_elements(value) as completed(element)
        where jsonb_typeof(element) <> 'string'
          or (element #>> '{}') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
      )
      and (
        select count(*) = count(distinct element)
        from jsonb_array_elements(value) as completed(element)
      )
  end;
$$;

create or replace function private.valid_completed_exercise_ids(value jsonb, exercises jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when not private.valid_exercise_id_array(value) then false
    else not exists (
        select 1
        from jsonb_array_elements(value) as completed(element)
        where not exists (
          select 1
          from jsonb_array_elements(exercises) as prescribed(exercise)
          where prescribed.exercise ->> 'id' = completed.element #>> '{}'
        )
      )
  end;
$$;

create or replace function private.valid_form_answers(answers jsonb, questions jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  question jsonb;
  answer jsonb;
  answer_item jsonb;
  answer_key text;
  question_id text;
  question_type text;
  is_required boolean;
begin
  if answers is null
    or jsonb_typeof(answers) <> 'object'
    or pg_column_size(answers) > 131072 then
    return false;
  end if;

  for answer_key in select key from jsonb_object_keys(answers) as fields(key) loop
    if not exists (
      select 1 from jsonb_array_elements(questions) as item(question)
      where item.question ->> 'id' = answer_key
    ) then
      return false;
    end if;
  end loop;

  for question in select element from jsonb_array_elements(questions) as item(element) loop
    question_id := question ->> 'id';
    question_type := question ->> 'type';
    is_required := coalesce((question ->> 'required')::boolean, false);

    if not (answers ? question_id) then
      if is_required then return false; end if;
      continue;
    end if;
    answer := answers -> question_id;

    if question_type = 'text' then
      if jsonb_typeof(answer) <> 'string'
        or char_length(answer #>> '{}') not between 1 and 500
        or (answer #>> '{}') <> btrim(answer #>> '{}') then return false; end if;
    elsif question_type = 'long' then
      if jsonb_typeof(answer) <> 'string'
        or char_length(answer #>> '{}') not between 1 and 4000
        or (answer #>> '{}') <> btrim(answer #>> '{}') then return false; end if;
    elsif question_type = 'single' then
      if jsonb_typeof(answer) <> 'string' or not exists (
        select 1 from jsonb_array_elements(question -> 'options') as option_value(element)
        where option_value.element = answer
      ) then return false; end if;
    elsif question_type = 'multi' then
      if jsonb_typeof(answer) <> 'array' then return false; end if;
      if jsonb_array_length(answer) < 1
        or jsonb_array_length(answer) > jsonb_array_length(question -> 'options') then return false; end if;
      for answer_item in select element from jsonb_array_elements(answer) as selected(element) loop
        if jsonb_typeof(answer_item) <> 'string' or not exists (
          select 1 from jsonb_array_elements(question -> 'options') as option_value(element)
          where option_value.element = answer_item
        ) then return false; end if;
      end loop;
      if (select count(*) <> count(distinct element) from jsonb_array_elements(answer) as selected(element)) then
        return false;
      end if;
    elsif question_type = 'scale' then
      if not (
        (jsonb_typeof(answer) = 'number' and (answer #>> '{}') ~ '^(10|[0-9])$')
        or (jsonb_typeof(answer) = 'string' and (answer #>> '{}') ~ '^(10|[0-9])$')
      ) then return false; end if;
    elsif question_type = 'yesno' then
      if jsonb_typeof(answer) <> 'string' or (answer #>> '{}') not in ('Sim','Não') then return false; end if;
    elsif question_type = 'number' then
      if not (
        (jsonb_typeof(answer) = 'number' and abs((answer #>> '{}')::numeric) <= 1000000000)
        or (jsonb_typeof(answer) = 'string' and (answer #>> '{}') ~ '^-?[0-9]{1,9}([.,][0-9]{1,4})?$')
      ) then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function private.valid_training_text(
  value text,
  minimum_length integer,
  maximum_length integer,
  allow_null boolean default false
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  clean_value text;
begin
  if value is null then return allow_null; end if;
  -- Reject oversized values before trimming, hashing, authorization lookups, or
  -- row locks. Four UTF-8 bytes per character plus a small normalization margin.
  if octet_length(value) > (maximum_length * 4) + 32 then return false; end if;
  clean_value := btrim(value);
  return char_length(clean_value) between minimum_length and maximum_length
    and clean_value !~ '[[:cntrl:]]';
end;
$$;

create or replace function private.valid_training_idempotency_key(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is not null
    and octet_length(value) between 16 and 128
    and value ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$';
$$;

-- A professional action requires both workspace authority and professional
-- verification. During homologation, the same explicit, enabled, unexpired
-- workspace allowlist used by the assistant is the only exception.
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
  select exists (
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
      and (
        trainer.verification_status = 'verified'
        or exists (
          select 1
          from private.ai_workspace_access as access
          where access.workspace_id = target_workspace_id
            and access.enabled
            and access.expires_at > statement_timestamp()
        )
      )
  );
$$;

create or replace function private.can_read_training_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_training_professional((select auth.uid()), target_workspace_id);
$$;

create or replace function private.can_read_current_training_health(
  target_workspace_id uuid,
  target_student_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_training_professional((select auth.uid()), target_workspace_id)
    and exists (
      select 1
      from public.workspace_members as student
      where student.workspace_id = target_workspace_id
        and student.user_id = target_student_user_id
        and student.role = 'student'
        and student.status = 'active'
    )
    and private.has_current_health_processing_consent(
      target_workspace_id,
      target_student_user_id
    );
$$;

create or replace function private.current_training_health_consent_evidence(
  target_workspace_id uuid,
  target_student_user_id uuid
)
returns table (consent_event_id uuid, policy_version text)
language sql
stable
security definer
set search_path = ''
as $$
  select consent.id, consent.policy_version
  from public.consent_policies as policy
  join lateral (
    select event.id, event.policy_version, event.action
    from public.consent_events as event
    where event.workspace_id = target_workspace_id
      and event.student_user_id = target_student_user_id
      and event.purpose = policy.purpose
      and event.policy_version = policy.policy_version
    order by event.event_sequence desc
    limit 1
  ) as consent on true
  where policy.purpose = 'health_processing'
    and policy.is_current
    and consent.action = 'granted';
$$;

revoke all on function private.valid_training_text(text, integer, integer, boolean) from public, anon, authenticated;
revoke all on function private.valid_training_idempotency_key(text) from public, anon, authenticated;
revoke all on function private.is_training_professional(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_read_training_workspace(uuid) from public, anon;
grant execute on function private.can_read_training_workspace(uuid) to authenticated;
revoke all on function private.can_read_current_training_health(uuid, uuid) from public, anon;
grant execute on function private.can_read_current_training_health(uuid, uuid) to authenticated;
revoke all on function private.current_training_health_consent_evidence(uuid, uuid) from public, anon, authenticated;

create or replace function private.resolve_trainer_student_workspace(target_student_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select student.workspace_id
  from public.workspace_members as student
  join public.workspace_members as trainer
    on trainer.workspace_id = student.workspace_id
   and trainer.user_id = (select auth.uid())
   and trainer.status = 'active'
   and trainer.role in ('owner','trainer')
  join public.profiles as trainer_profile
    on trainer_profile.id = trainer.user_id
   and trainer_profile.account_role = 'trainer'
  join public.profiles as student_profile
    on student_profile.id = student.user_id
   and student_profile.account_role = 'student'
  where student.user_id = target_student_user_id
    and student.status = 'active'
    and student.role = 'student'
    and private.is_training_professional(trainer.user_id, student.workspace_id)
  limit 1;
$$;

revoke all on function private.valid_workout_exercises(jsonb) from public, anon, authenticated;
revoke all on function private.valid_form_questions(jsonb) from public, anon, authenticated;
revoke all on function private.valid_exercise_id_array(jsonb) from public, anon, authenticated;
revoke all on function private.valid_completed_exercise_ids(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.valid_form_answers(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.resolve_trainer_student_workspace(uuid) from public, anon, authenticated;

-- Consent changes and anamnesis submission serialize on the same membership row.
-- This closes the race where a withdrawal could otherwise commit between the
-- submission's current-consent check and its immutable insert.
create or replace function private.lock_consent_student_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.workspace_members
  where workspace_id = new.workspace_id
    and user_id = new.student_user_id
    and role = 'student'
    and status = 'active'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'consent_resource_unavailable';
  end if;
  return new;
end;
$$;

revoke all on function private.lock_consent_student_membership() from public, anon, authenticated;

create trigger consent_events_lock_student_membership
before insert on public.consent_events
for each row execute function private.lock_consent_student_membership();

-- Conservative mutation budgets reduce accidental floods and bound lock pressure.
-- Gateway rate limiting is still required because failed transactions roll back
-- these counters by design.
create table private.training_mutation_budgets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null check (operation in ('publish_workout','complete_workout','assign_anamnesis','submit_anamnesis','create_note')),
  window_started_at timestamptz not null default clock_timestamp(),
  window_count integer not null default 0 check (window_count >= 0),
  day_started_on date not null default current_date,
  daily_count integer not null default 0 check (daily_count >= 0),
  primary key (workspace_id, actor_user_id, operation)
);

revoke all on private.training_mutation_budgets from public, anon, authenticated;

create or replace function private.consume_training_mutation_budget(
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
  budget private.training_mutation_budgets%rowtype;
begin
  if target_workspace_id is null or target_actor_user_id is null
    or target_operation not in ('publish_workout','complete_workout','assign_anamnesis','submit_anamnesis','create_note')
    or window_limit not between 1 and 100 or daily_limit not between window_limit and 1000 then
    raise exception using errcode = '22023', message = 'invalid_training_budget';
  end if;

  insert into private.training_mutation_budgets (workspace_id, actor_user_id, operation)
  values (target_workspace_id, target_actor_user_id, target_operation)
  on conflict do nothing;

  select * into budget
  from private.training_mutation_budgets
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
    raise exception using errcode = '54000', message = 'training_rate_limited';
  end if;

  update private.training_mutation_budgets
  set window_started_at = budget.window_started_at,
      window_count = budget.window_count + 1,
      day_started_on = budget.day_started_on,
      daily_count = budget.daily_count + 1
  where workspace_id = target_workspace_id
    and actor_user_id = target_actor_user_id
    and operation = target_operation;
end;
$$;

revoke all on function private.consume_training_mutation_budget(uuid, uuid, text, integer, integer) from public, anon, authenticated;

create table public.workout_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  student_user_id uuid not null references public.profiles(id) on delete restrict,
  student_membership_role public.workspace_role not null default 'student' check (student_membership_role = 'student'),
  published_by_user_id uuid not null references public.profiles(id) on delete restrict,
  published_by_role public.workspace_role not null check (published_by_role in ('owner','trainer')),
  version_number bigint not null check (version_number > 0),
  title text not null check (char_length(title) between 2 and 120 and title = btrim(title) and title !~ '[[:cntrl:]]'),
  exercises jsonb not null check (private.valid_workout_exercises(exercises)),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  redacted_at timestamptz,
  published_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, student_user_id, student_membership_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  foreign key (workspace_id, published_by_user_id, published_by_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  unique (id, workspace_id, student_user_id),
  unique (workspace_id, student_user_id, version_number),
  unique (workspace_id, published_by_user_id, idempotency_key)
);

create index workout_versions_student_latest_idx on public.workout_versions(workspace_id, student_user_id, published_at desc, id desc);

create table public.workout_completion_events (
  id uuid primary key default gen_random_uuid(),
  workout_version_id uuid not null,
  workspace_id uuid not null,
  student_user_id uuid not null references public.profiles(id) on delete restrict,
  student_membership_role public.workspace_role not null default 'student' check (student_membership_role = 'student'),
  rpe smallint not null check (rpe between 0 and 10),
  mood text not null check (char_length(mood) between 2 and 40 and mood = btrim(mood) and mood !~ '[[:cntrl:]]'),
  comment text check (comment is null or (char_length(comment) between 1 and 1000 and comment = btrim(comment))),
  completed_exercise_ids jsonb not null check (private.valid_exercise_id_array(completed_exercise_ids)),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  redacted_at timestamptz,
  completed_at timestamptz not null default clock_timestamp(),
  foreign key (workout_version_id, workspace_id, student_user_id)
    references public.workout_versions(id, workspace_id, student_user_id) on update restrict on delete restrict,
  foreign key (workspace_id, student_user_id, student_membership_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  unique (workspace_id, student_user_id, idempotency_key)
);

create index workout_completion_student_idx on public.workout_completion_events(workspace_id, student_user_id, completed_at desc, id desc);

create table public.anamnesis_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  student_user_id uuid not null references public.profiles(id) on delete restrict,
  student_membership_role public.workspace_role not null default 'student' check (student_membership_role = 'student'),
  assigned_by_user_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by_role public.workspace_role not null check (assigned_by_role in ('owner','trainer')),
  title text not null check (char_length(title) between 2 and 120 and title = btrim(title) and title !~ '[[:cntrl:]]'),
  questions jsonb not null check (private.valid_form_questions(questions)),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  assigned_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, student_user_id, student_membership_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  foreign key (workspace_id, assigned_by_user_id, assigned_by_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  unique (id, workspace_id, student_user_id),
  unique (workspace_id, assigned_by_user_id, idempotency_key)
);

create index anamnesis_assignments_student_idx on public.anamnesis_assignments(workspace_id, student_user_id, assigned_at desc, id desc);

create unique index if not exists consent_events_tenant_reference_idx
  on public.consent_events(id, workspace_id, student_user_id, policy_version);

create table public.anamnesis_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  workspace_id uuid not null,
  student_user_id uuid not null references public.profiles(id) on delete restrict,
  student_membership_role public.workspace_role not null default 'student' check (student_membership_role = 'student'),
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 131072),
  consent_event_id uuid not null,
  consent_policy_version text not null,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  redacted_at timestamptz,
  submitted_at timestamptz not null default clock_timestamp(),
  foreign key (assignment_id, workspace_id, student_user_id)
    references public.anamnesis_assignments(id, workspace_id, student_user_id) on update restrict on delete restrict,
  foreign key (workspace_id, student_user_id, student_membership_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  foreign key (consent_event_id, workspace_id, student_user_id, consent_policy_version)
    references public.consent_events(id, workspace_id, student_user_id, policy_version) on update restrict on delete restrict,
  unique (assignment_id, student_user_id),
  unique (workspace_id, student_user_id, idempotency_key)
);

create index anamnesis_submissions_student_idx on public.anamnesis_submissions(workspace_id, student_user_id, submitted_at desc, id desc);

create table public.trainer_student_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  student_user_id uuid not null references public.profiles(id) on delete restrict,
  student_membership_role public.workspace_role not null default 'student' check (student_membership_role = 'student'),
  author_user_id uuid not null references public.profiles(id) on delete restrict,
  author_role public.workspace_role not null check (author_role in ('owner','trainer')),
  note text not null check (char_length(note) between 1 and 2000 and note = btrim(note)),
  consent_event_id uuid not null,
  consent_policy_version text not null,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  redacted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, student_user_id, student_membership_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  foreign key (workspace_id, author_user_id, author_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  foreign key (consent_event_id, workspace_id, student_user_id, consent_policy_version)
    references public.consent_events(id, workspace_id, student_user_id, policy_version) on update restrict on delete restrict,
  unique (workspace_id, author_user_id, idempotency_key)
);

create index trainer_student_notes_student_idx on public.trainer_student_notes(workspace_id, student_user_id, created_at desc, id desc);

create or replace function private.reject_training_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and current_setting('elo.training_redaction', true) = 'enabled'
    and current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  raise exception using errcode = '55000', message = 'append_only_resource';
end;
$$;

revoke all on function private.reject_training_mutation() from public, anon, authenticated;

create trigger workout_versions_are_immutable before update or delete on public.workout_versions
for each row execute function private.reject_training_mutation();
create trigger workout_completions_are_immutable before update or delete on public.workout_completion_events
for each row execute function private.reject_training_mutation();
create trigger anamnesis_assignments_are_immutable before update or delete on public.anamnesis_assignments
for each row execute function private.reject_training_mutation();
create trigger anamnesis_submissions_are_immutable before update or delete on public.anamnesis_submissions
for each row execute function private.reject_training_mutation();
create trigger trainer_student_notes_are_immutable before update or delete on public.trainer_student_notes
for each row execute function private.reject_training_mutation();

alter table public.workout_versions enable row level security;
alter table public.workout_completion_events enable row level security;
alter table public.anamnesis_assignments enable row level security;
alter table public.anamnesis_submissions enable row level security;
alter table public.trainer_student_notes enable row level security;

create policy workout_versions_read_scoped on public.workout_versions for select to authenticated
using (student_user_id = (select auth.uid()) or private.can_read_training_workspace(workspace_id));
create policy workout_completions_read_scoped on public.workout_completion_events for select to authenticated
using (student_user_id = (select auth.uid()) or private.can_read_current_training_health(workspace_id, student_user_id));
create policy anamnesis_assignments_read_scoped on public.anamnesis_assignments for select to authenticated
using (student_user_id = (select auth.uid()) or private.can_read_training_workspace(workspace_id));
create policy anamnesis_submissions_read_scoped on public.anamnesis_submissions for select to authenticated
using (student_user_id = (select auth.uid()) or private.can_read_current_training_health(workspace_id, student_user_id));
create policy trainer_student_notes_read_trainer on public.trainer_student_notes for select to authenticated
using (private.can_read_current_training_health(workspace_id, student_user_id));

revoke all on public.workout_versions, public.workout_completion_events, public.anamnesis_assignments,
  public.anamnesis_submissions, public.trainer_student_notes from public, anon, authenticated;
grant select (id, workspace_id, student_user_id, published_by_user_id, published_by_role, version_number, title, exercises, published_at)
  on public.workout_versions to authenticated;
grant select (id, workout_version_id, workspace_id, student_user_id, rpe, mood, comment, completed_exercise_ids, completed_at)
  on public.workout_completion_events to authenticated;
grant select (id, workspace_id, student_user_id, assigned_by_user_id, assigned_by_role, title, questions, assigned_at)
  on public.anamnesis_assignments to authenticated;
grant select (id, assignment_id, workspace_id, student_user_id, answers, submitted_at)
  on public.anamnesis_submissions to authenticated;
grant select (id, workspace_id, student_user_id, author_user_id, author_role, note, created_at)
  on public.trainer_student_notes to authenticated;

create or replace function public.publish_workout_version(
  p_student_user_id uuid,
  p_title text,
  p_exercises jsonb,
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
  caller_role public.workspace_role;
  clean_title text;
  fingerprint bytea;
  existing_id uuid;
  existing_fingerprint bytea;
  created_id uuid;
  next_version bigint;
begin
  if caller_id is null or p_student_user_id is null
    or not private.valid_training_text(p_title, 2, 120)
    or not private.valid_training_idempotency_key(p_idempotency_key)
    or not private.valid_workout_exercises(p_exercises) then
    raise exception using errcode = '22023', message = 'invalid_training_request';
  end if;
  clean_title := btrim(p_title);
  resolved_workspace_id := private.resolve_trainer_student_workspace(p_student_user_id);
  if resolved_workspace_id is null then
    raise exception using errcode = '42501', message = 'training_resource_unavailable';
  end if;

  fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'workspace', resolved_workspace_id, 'student', p_student_user_id,
    'title', clean_title, 'exercises', p_exercises
  )::text, 'UTF8'), 'sha256');

  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.workout_versions
  where workspace_id = resolved_workspace_id
    and published_by_user_id = caller_id and idempotency_key = p_idempotency_key;
  if existing_id is not null then
    if existing_fingerprint <> fingerprint then raise exception using errcode = '22023', message = 'idempotency_conflict'; end if;
    return existing_id;
  end if;

  select trainer.role into caller_role
  from public.workspace_members as trainer
  join public.workspace_members as student on student.workspace_id = trainer.workspace_id
  where trainer.workspace_id = resolved_workspace_id
    and trainer.user_id = caller_id and trainer.status = 'active' and trainer.role in ('owner','trainer')
    and student.user_id = p_student_user_id and student.status = 'active' and student.role = 'student'
  for update of trainer, student;
  if caller_role is null then
    raise exception using errcode = '42501', message = 'training_resource_unavailable';
  end if;

  perform private.consume_training_mutation_budget(resolved_workspace_id, caller_id, 'publish_workout', 10, 60);

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.workout_versions where workspace_id = resolved_workspace_id and student_user_id = p_student_user_id;

  insert into public.workout_versions (
    workspace_id, student_user_id, published_by_user_id, published_by_role, version_number,
    title, exercises, idempotency_key, request_fingerprint
  ) values (
    resolved_workspace_id, p_student_user_id, caller_id, caller_role, next_version,
    clean_title, p_exercises, p_idempotency_key, fingerprint
  ) on conflict (workspace_id, published_by_user_id, idempotency_key) do nothing returning id into created_id;

  if created_id is not null then return created_id; end if;
  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.workout_versions where workspace_id = resolved_workspace_id
    and published_by_user_id = caller_id and idempotency_key = p_idempotency_key;
  if existing_id is null or existing_fingerprint <> fingerprint then
    raise exception using errcode = '22023', message = 'idempotency_conflict';
  end if;
  return existing_id;
end;
$$;

create or replace function public.complete_workout_version(
  p_workout_version_id uuid,
  p_rpe smallint,
  p_mood text,
  p_comment text,
  p_completed_exercise_ids jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target public.workout_versions%rowtype;
  clean_mood text;
  clean_comment text;
  fingerprint bytea;
  existing_id uuid;
  existing_fingerprint bytea;
  created_id uuid;
begin
  if caller_id is null or p_workout_version_id is null or p_rpe not between 0 and 10
    or not private.valid_training_text(p_mood, 2, 40)
    or not private.valid_training_text(p_comment, 1, 1000, true)
    or not private.valid_training_idempotency_key(p_idempotency_key)
    or not private.valid_exercise_id_array(p_completed_exercise_ids) then
    raise exception using errcode = '22023', message = 'invalid_training_request';
  end if;
  clean_mood := btrim(p_mood);
  clean_comment := nullif(btrim(p_comment), '');

  select workout.* into target from public.workout_versions as workout
  where workout.id = p_workout_version_id and workout.student_user_id = caller_id;
  if target.id is null or not private.valid_completed_exercise_ids(p_completed_exercise_ids, target.exercises) then
    raise exception using errcode = '42501', message = 'training_resource_unavailable';
  end if;

  fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'workspace', target.workspace_id, 'workout', p_workout_version_id, 'rpe', p_rpe, 'mood', clean_mood,
    'comment', clean_comment, 'completed', p_completed_exercise_ids
  )::text, 'UTF8'), 'sha256');
  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.workout_completion_events where workspace_id = target.workspace_id
    and student_user_id = caller_id and idempotency_key = p_idempotency_key;
  if existing_id is not null then
    if existing_fingerprint <> fingerprint then raise exception using errcode = '22023', message = 'idempotency_conflict'; end if;
    return existing_id;
  end if;

  perform 1 from public.workspace_members as member
  where member.workspace_id = target.workspace_id and member.user_id = caller_id
    and member.role = 'student' and member.status = 'active'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'training_resource_unavailable';
  end if;
  perform private.consume_training_mutation_budget(target.workspace_id, caller_id, 'complete_workout', 20, 100);

  insert into public.workout_completion_events (
    workout_version_id, workspace_id, student_user_id, rpe, mood, comment,
    completed_exercise_ids, idempotency_key, request_fingerprint
  ) values (
    target.id, target.workspace_id, caller_id, p_rpe, clean_mood, clean_comment,
    p_completed_exercise_ids, p_idempotency_key, fingerprint
  ) on conflict (workspace_id, student_user_id, idempotency_key) do nothing returning id into created_id;
  if created_id is not null then return created_id; end if;

  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.workout_completion_events where workspace_id = target.workspace_id
    and student_user_id = caller_id and idempotency_key = p_idempotency_key;
  if existing_id is null or existing_fingerprint <> fingerprint then
    raise exception using errcode = '22023', message = 'idempotency_conflict';
  end if;
  return existing_id;
end;
$$;

create or replace function public.assign_anamnesis(
  p_student_user_id uuid,
  p_title text,
  p_questions jsonb,
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
  caller_role public.workspace_role;
  clean_title text;
  fingerprint bytea;
  existing_id uuid;
  existing_fingerprint bytea;
  created_id uuid;
begin
  if caller_id is null or p_student_user_id is null
    or not private.valid_training_text(p_title, 2, 120)
    or not private.valid_training_idempotency_key(p_idempotency_key)
    or not private.valid_form_questions(p_questions) then
    raise exception using errcode = '22023', message = 'invalid_form_request';
  end if;
  clean_title := btrim(p_title);
  resolved_workspace_id := private.resolve_trainer_student_workspace(p_student_user_id);
  if resolved_workspace_id is null then
    raise exception using errcode = '42501', message = 'form_resource_unavailable';
  end if;

  fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'workspace', resolved_workspace_id, 'student', p_student_user_id,
    'title', clean_title, 'questions', p_questions
  )::text, 'UTF8'), 'sha256');
  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.anamnesis_assignments where workspace_id = resolved_workspace_id
    and assigned_by_user_id = caller_id and idempotency_key = p_idempotency_key;
  if existing_id is not null then
    if existing_fingerprint <> fingerprint then raise exception using errcode = '22023', message = 'idempotency_conflict'; end if;
    return existing_id;
  end if;
  select trainer.role into caller_role
  from public.workspace_members as trainer
  join public.workspace_members as student on student.workspace_id = trainer.workspace_id
  where trainer.workspace_id = resolved_workspace_id
    and trainer.user_id = caller_id and trainer.status = 'active' and trainer.role in ('owner','trainer')
    and student.user_id = p_student_user_id and student.status = 'active' and student.role = 'student'
  for update of trainer, student;
  if caller_role is null then
    raise exception using errcode = '42501', message = 'form_resource_unavailable';
  end if;

  perform private.consume_training_mutation_budget(resolved_workspace_id, caller_id, 'assign_anamnesis', 10, 60);

  insert into public.anamnesis_assignments (
    workspace_id, student_user_id, assigned_by_user_id, assigned_by_role, title,
    questions, idempotency_key, request_fingerprint
  ) values (
    resolved_workspace_id, p_student_user_id, caller_id, caller_role, clean_title,
    p_questions, p_idempotency_key, fingerprint
  ) on conflict (workspace_id, assigned_by_user_id, idempotency_key) do nothing returning id into created_id;
  if created_id is not null then return created_id; end if;
  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.anamnesis_assignments where workspace_id = resolved_workspace_id
    and assigned_by_user_id = caller_id and idempotency_key = p_idempotency_key;
  if existing_id is null or existing_fingerprint <> fingerprint then
    raise exception using errcode = '22023', message = 'idempotency_conflict';
  end if;
  return existing_id;
end;
$$;

create or replace function public.submit_anamnesis(
  p_assignment_id uuid,
  p_answers jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target public.anamnesis_assignments%rowtype;
  current_consent_event_id uuid;
  current_policy_version text;
  fingerprint bytea;
  existing_id uuid;
  existing_fingerprint bytea;
  created_id uuid;
begin
  if caller_id is null or p_assignment_id is null
    or not private.valid_training_idempotency_key(p_idempotency_key)
    or p_answers is null or jsonb_typeof(p_answers) <> 'object'
    or pg_column_size(p_answers) > 131072 then
    raise exception using errcode = '22023', message = 'invalid_form_request';
  end if;

  select assignment.* into target from public.anamnesis_assignments as assignment
  where assignment.id = p_assignment_id and assignment.student_user_id = caller_id;
  if target.id is null or not private.valid_form_answers(p_answers, target.questions) then
    raise exception using errcode = '42501', message = 'form_resource_unavailable';
  end if;

  fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'workspace', target.workspace_id, 'assignment', p_assignment_id, 'answers', p_answers
  )::text, 'UTF8'), 'sha256');
  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.anamnesis_submissions
  where (workspace_id = target.workspace_id and student_user_id = caller_id and idempotency_key = p_idempotency_key)
     or (assignment_id = p_assignment_id and workspace_id = target.workspace_id and student_user_id = caller_id)
  order by case when idempotency_key = p_idempotency_key then 0 else 1 end limit 1;
  if existing_id is not null then
    if existing_fingerprint <> fingerprint then raise exception using errcode = '22023', message = 'idempotency_conflict'; end if;
    return existing_id;
  end if;

  perform 1 from public.workspace_members
  where workspace_id = target.workspace_id and user_id = caller_id
    and role = 'student' and status = 'active'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'form_resource_unavailable';
  end if;

  select consent.id, consent.policy_version into current_consent_event_id, current_policy_version
  from public.consent_policies as policy
  join lateral (
    select event.id, event.policy_version, event.action
    from public.consent_events as event
    where event.workspace_id = target.workspace_id and event.student_user_id = caller_id
      and event.purpose = policy.purpose and event.policy_version = policy.policy_version
    order by event.event_sequence desc limit 1
  ) as consent on true
  where policy.purpose = 'health_processing' and policy.is_current and consent.action = 'granted';
  if current_consent_event_id is null then
    raise exception using errcode = '42501', message = 'form_resource_unavailable';
  end if;
  perform private.consume_training_mutation_budget(target.workspace_id, caller_id, 'submit_anamnesis', 10, 30);

  insert into public.anamnesis_submissions (
    assignment_id, workspace_id, student_user_id, answers, consent_event_id,
    consent_policy_version, idempotency_key, request_fingerprint
  ) values (
    target.id, target.workspace_id, caller_id, p_answers, current_consent_event_id,
    current_policy_version, p_idempotency_key, fingerprint
  ) on conflict do nothing returning id into created_id;
  if created_id is not null then return created_id; end if;

  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.anamnesis_submissions
  where (workspace_id = target.workspace_id and student_user_id = caller_id and idempotency_key = p_idempotency_key)
     or (assignment_id = p_assignment_id and workspace_id = target.workspace_id and student_user_id = caller_id)
  order by case when idempotency_key = p_idempotency_key then 0 else 1 end limit 1;
  if existing_id is null or existing_fingerprint <> fingerprint then
    raise exception using errcode = '22023', message = 'idempotency_conflict';
  end if;
  return existing_id;
end;
$$;

create or replace function public.create_trainer_student_note(
  p_student_user_id uuid,
  p_note text,
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
  caller_role public.workspace_role;
  clean_note text;
  current_consent_event_id uuid;
  current_policy_version text;
  fingerprint bytea;
  existing_id uuid;
  existing_fingerprint bytea;
  created_id uuid;
begin
  if caller_id is null or p_student_user_id is null
    or not private.valid_training_text(p_note, 1, 2000)
    or not private.valid_training_idempotency_key(p_idempotency_key) then
    raise exception using errcode = '22023', message = 'invalid_note_request';
  end if;
  clean_note := btrim(p_note);
  resolved_workspace_id := private.resolve_trainer_student_workspace(p_student_user_id);
  if resolved_workspace_id is null then
    raise exception using errcode = '42501', message = 'note_resource_unavailable';
  end if;

  fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'workspace', resolved_workspace_id, 'student', p_student_user_id, 'note', clean_note
  )::text, 'UTF8'), 'sha256');
  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.trainer_student_notes where workspace_id = resolved_workspace_id
    and author_user_id = caller_id and idempotency_key = p_idempotency_key;
  if existing_id is not null then
    if existing_fingerprint <> fingerprint then raise exception using errcode = '22023', message = 'idempotency_conflict'; end if;
    return existing_id;
  end if;
  select trainer.role into caller_role
  from public.workspace_members as trainer
  join public.workspace_members as student on student.workspace_id = trainer.workspace_id
  where trainer.workspace_id = resolved_workspace_id
    and trainer.user_id = caller_id and trainer.status = 'active' and trainer.role in ('owner','trainer')
    and student.user_id = p_student_user_id and student.status = 'active' and student.role = 'student'
  for update of trainer, student;
  if caller_role is null then
    raise exception using errcode = '42501', message = 'note_resource_unavailable';
  end if;

  select consent_event_id, policy_version
  into current_consent_event_id, current_policy_version
  from private.current_training_health_consent_evidence(resolved_workspace_id, p_student_user_id);
  if current_consent_event_id is null then
    raise exception using errcode = '42501', message = 'note_resource_unavailable';
  end if;
  perform private.consume_training_mutation_budget(resolved_workspace_id, caller_id, 'create_note', 30, 200);

  insert into public.trainer_student_notes (
    workspace_id, student_user_id, author_user_id, author_role, note,
    consent_event_id, consent_policy_version, idempotency_key, request_fingerprint
  ) values (
    resolved_workspace_id, p_student_user_id, caller_id, caller_role, clean_note,
    current_consent_event_id, current_policy_version, p_idempotency_key, fingerprint
  ) on conflict (workspace_id, author_user_id, idempotency_key) do nothing returning id into created_id;
  if created_id is not null then return created_id; end if;
  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.trainer_student_notes where workspace_id = resolved_workspace_id
    and author_user_id = caller_id and idempotency_key = p_idempotency_key;
  if existing_id is null or existing_fingerprint <> fingerprint then
    raise exception using errcode = '22023', message = 'idempotency_conflict';
  end if;
  return existing_id;
end;
$$;

revoke all on function public.publish_workout_version(uuid, text, jsonb, text) from public, anon;
grant execute on function public.publish_workout_version(uuid, text, jsonb, text) to authenticated;
revoke all on function public.complete_workout_version(uuid, smallint, text, text, jsonb, text) from public, anon;
grant execute on function public.complete_workout_version(uuid, smallint, text, text, jsonb, text) to authenticated;
revoke all on function public.assign_anamnesis(uuid, text, jsonb, text) from public, anon;
grant execute on function public.assign_anamnesis(uuid, text, jsonb, text) to authenticated;
revoke all on function public.submit_anamnesis(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_anamnesis(uuid, jsonb, text) to authenticated;
revoke all on function public.create_trainer_student_note(uuid, text, text) from public, anon;
grant execute on function public.create_trainer_student_note(uuid, text, text) to authenticated;

-- Privileged retention redacts mutable health payloads while preserving a
-- minimal append-only event envelope. This is pseudonymization, not full
-- account erasure; production must pair it with the identity deletion runbook.
create table private.training_redaction_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subject_reference bytea not null check (octet_length(subject_reference) = 32),
  reason text not null check (char_length(reason) between 4 and 500 and reason = btrim(reason)),
  workout_versions_redacted integer not null check (workout_versions_redacted >= 0),
  completions_redacted integer not null check (completions_redacted >= 0),
  submissions_redacted integer not null check (submissions_redacted >= 0),
  notes_redacted integer not null check (notes_redacted >= 0),
  executed_by text not null,
  executed_at timestamptz not null default clock_timestamp()
);

revoke all on private.training_redaction_events from public, anon, authenticated;

create or replace function private.redact_training_subject_payloads(
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
  workout_count integer := 0;
  completion_count integer := 0;
  submission_count integer := 0;
  note_count integer := 0;
begin
  if current_user not in ('postgres', 'supabase_admin')
    or target_workspace_id is null or target_student_user_id is null
    or not private.valid_training_text(redaction_reason, 4, 500) then
    raise exception using errcode = '42501', message = 'retention_operation_unavailable';
  end if;
  clean_reason := btrim(redaction_reason);
  perform set_config('elo.training_redaction', 'enabled', true);

  update public.workout_versions as workout
  set exercises = (
        select jsonb_agg(jsonb_set(entry.exercise, '{note}', to_jsonb('[conteúdo removido por retenção]'::text), true) order by entry.ordinality)
        from jsonb_array_elements(workout.exercises) with ordinality as entry(exercise, ordinality)
      ),
      request_fingerprint = extensions.digest(convert_to(gen_random_uuid()::text, 'UTF8'), 'sha256'),
      redacted_at = clock_timestamp()
  where workout.workspace_id = target_workspace_id
    and workout.student_user_id = target_student_user_id
    and workout.redacted_at is null;
  get diagnostics workout_count = row_count;

  update public.workout_completion_events
  set comment = null,
      request_fingerprint = extensions.digest(convert_to(gen_random_uuid()::text, 'UTF8'), 'sha256'),
      redacted_at = clock_timestamp()
  where workspace_id = target_workspace_id
    and student_user_id = target_student_user_id
    and redacted_at is null;
  get diagnostics completion_count = row_count;

  update public.anamnesis_submissions
  set answers = '{}'::jsonb,
      request_fingerprint = extensions.digest(convert_to(gen_random_uuid()::text, 'UTF8'), 'sha256'),
      redacted_at = clock_timestamp()
  where workspace_id = target_workspace_id
    and student_user_id = target_student_user_id
    and redacted_at is null;
  get diagnostics submission_count = row_count;

  update public.trainer_student_notes
  set note = '[conteúdo removido por retenção]',
      request_fingerprint = extensions.digest(convert_to(gen_random_uuid()::text, 'UTF8'), 'sha256'),
      redacted_at = clock_timestamp()
  where workspace_id = target_workspace_id
    and student_user_id = target_student_user_id
    and redacted_at is null;
  get diagnostics note_count = row_count;

  insert into private.training_redaction_events (
    workspace_id, subject_reference, reason, workout_versions_redacted,
    completions_redacted, submissions_redacted, notes_redacted, executed_by
  ) values (
    target_workspace_id,
    extensions.digest(convert_to(target_workspace_id::text || ':' || target_student_user_id::text, 'UTF8'), 'sha256'),
    clean_reason, workout_count, completion_count, submission_count, note_count, current_user
  ) returning id into event_id;
  return event_id;
end;
$$;

revoke all on function private.redact_training_subject_payloads(uuid, uuid, text) from public, anon, authenticated;

comment on table public.workout_versions is 'Immutable published workout versions scoped to one active workspace student.';
comment on table public.workout_completion_events is 'Append-only student workout completion and feedback events.';
comment on table public.anamnesis_assignments is 'Immutable trainer-authored anamnesis assignments.';
comment on table public.anamnesis_submissions is 'Immutable student answers tied to the current health-processing consent evidence.';
comment on table public.trainer_student_notes is 'Private append-only trainer notes; students have no read policy or column grants.';
comment on function private.redact_training_subject_payloads(uuid, uuid, text) is 'Owner-only retention hook that pseudonymizes health payloads and records aggregate audit evidence.';
