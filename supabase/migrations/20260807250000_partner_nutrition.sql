-- Nutrition is intentionally integration-owned: authenticated trainers can
-- coordinate and read with current consent, but cannot author or alter diets.

create type public.nutrition_meal_action as enum ('completed', 'uncompleted');

create or replace function private.valid_nutrition_meals(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  meal jsonb;
  field_name text;
  numeric_value numeric;
begin
  if value is null or jsonb_typeof(value) <> 'array'
    or jsonb_array_length(value) not between 1 and 12
    or pg_column_size(value) > 65536 then
    return false;
  end if;

  for meal in select element from jsonb_array_elements(value) as entry(element) loop
    if jsonb_typeof(meal) <> 'object'
      or not (meal ?& array['id','time','title','description','protein_g','carbs_g','fat_g','kcal']) then
      return false;
    end if;
    for field_name in select key from jsonb_object_keys(meal) as fields(key) loop
      if field_name not in ('id','time','title','description','protein_g','carbs_g','fat_g','kcal') then
        return false;
      end if;
    end loop;
    if jsonb_typeof(meal -> 'id') <> 'string'
      or (meal ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
      or jsonb_typeof(meal -> 'time') <> 'string'
      or (meal ->> 'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or jsonb_typeof(meal -> 'title') <> 'string'
      or char_length(meal ->> 'title') not between 2 and 100
      or (meal ->> 'title') <> btrim(meal ->> 'title')
      or (meal ->> 'title') ~ '[[:cntrl:]]'
      or jsonb_typeof(meal -> 'description') <> 'string'
      or char_length(meal ->> 'description') not between 2 and 500
      or (meal ->> 'description') <> btrim(meal ->> 'description')
      or (meal ->> 'description') ~ '[[:cntrl:]]' then
      return false;
    end if;
    for field_name in select unnest(array['protein_g','carbs_g','fat_g','kcal']) loop
      if jsonb_typeof(meal -> field_name) <> 'number' then return false; end if;
      numeric_value := (meal ->> field_name)::numeric;
      if numeric_value < 0 or numeric_value > (case field_name
        when 'protein_g' then 300
        when 'carbs_g' then 500
        when 'fat_g' then 200
        else 3000
      end) then return false; end if;
      if field_name = 'kcal' and mod(numeric_value, 1) <> 0 then return false; end if;
    end loop;
  end loop;

  return (
    select count(*) = count(distinct element ->> 'id')
    from jsonb_array_elements(value) as entry(element)
  );
end;
$$;

revoke all on function private.valid_nutrition_meals(jsonb) from public, anon, authenticated;

create or replace function private.can_read_nutrition_subject(
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
        select 1 from public.workspace_members as student
        where student.workspace_id = target_workspace_id
          and student.user_id = target_student_user_id
          and student.role = 'student'
          and student.status = 'active'
      )
    )
    or (
      private.is_training_professional((select auth.uid()), target_workspace_id)
      and exists (
        select 1 from public.workspace_members as student
        where student.workspace_id = target_workspace_id
          and student.user_id = target_student_user_id
          and student.role = 'student'
          and student.status = 'active'
      )
      and private.has_current_nutrition_processing_consent(
        target_workspace_id,
        target_student_user_id
      )
    );
$$;

revoke all on function private.can_read_nutrition_subject(uuid, uuid) from public, anon;
grant execute on function private.can_read_nutrition_subject(uuid, uuid) to authenticated;

create table private.nutrition_mutation_budgets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null check (operation in ('meal_state','hydration_total')),
  window_started_at timestamptz not null default clock_timestamp(),
  window_count integer not null default 0 check (window_count >= 0),
  day_started_on date not null default current_date,
  daily_count integer not null default 0 check (daily_count >= 0),
  primary key (workspace_id, actor_user_id, operation)
);

revoke all on private.nutrition_mutation_budgets from public, anon, authenticated;

create or replace function private.consume_nutrition_mutation_budget(
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
  budget private.nutrition_mutation_budgets%rowtype;
begin
  if target_workspace_id is null or target_actor_user_id is null
    or target_operation not in ('meal_state','hydration_total')
    or window_limit not between 1 and 100
    or daily_limit not between window_limit and 1000 then
    raise exception using errcode = '22023', message = 'invalid_nutrition_budget';
  end if;
  insert into private.nutrition_mutation_budgets (workspace_id, actor_user_id, operation)
  values (target_workspace_id, target_actor_user_id, target_operation)
  on conflict do nothing;
  select * into budget
  from private.nutrition_mutation_budgets
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
    raise exception using errcode = '54000', message = 'nutrition_rate_limited';
  end if;
  update private.nutrition_mutation_budgets
  set window_started_at = budget.window_started_at,
      window_count = budget.window_count + 1,
      day_started_on = budget.day_started_on,
      daily_count = budget.daily_count + 1
  where workspace_id = target_workspace_id
    and actor_user_id = target_actor_user_id
    and operation = target_operation;
end;
$$;

revoke all on function private.consume_nutrition_mutation_budget(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;

create table public.nutrition_plan_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  student_user_id uuid not null references public.profiles(id) on delete restrict,
  student_role public.workspace_role not null default 'student' check (student_role = 'student'),
  version_number integer not null check (version_number >= 1),
  integration_source text not null check (
    char_length(integration_source) between 3 and 80
    and integration_source = btrim(integration_source)
    and integration_source ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  nutritionist_name text not null,
  nutritionist_crn text not null,
  title text not null,
  valid_from date not null,
  valid_until date not null,
  meals jsonb not null,
  hydration_target_ml integer not null check (hydration_target_ml between 500 and 6000),
  notes text,
  consent_event_id uuid not null,
  consent_policy_version text not null,
  partner_idempotency_hash bytea not null check (octet_length(partner_idempotency_hash) = 32),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  redacted_at timestamptz,
  published_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, student_user_id, student_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  foreign key (consent_event_id, workspace_id, student_user_id, consent_policy_version)
    references public.consent_events(id, workspace_id, student_user_id, policy_version) on update restrict on delete restrict,
  unique (id, workspace_id, student_user_id),
  unique (workspace_id, student_user_id, version_number),
  unique (workspace_id, integration_source, partner_idempotency_hash),
  check (valid_until >= valid_from and valid_until <= valid_from + 366),
  check (redacted_at is not null or (
    char_length(nutritionist_name) between 2 and 120
    and nutritionist_name = btrim(nutritionist_name)
    and nutritionist_name !~ '[[:cntrl:]]'
    and char_length(nutritionist_crn) between 3 and 40
    and nutritionist_crn = btrim(nutritionist_crn)
    and nutritionist_crn ~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]*$'
    and char_length(title) between 2 and 120
    and title = btrim(title)
    and title !~ '[[:cntrl:]]'
    and private.valid_nutrition_meals(meals)
    and (notes is null or (
      char_length(notes) between 1 and 1000
      and notes = btrim(notes)
      and notes !~ '[[:cntrl:]]'
    ))
  ))
);

create index nutrition_plan_versions_student_idx
  on public.nutrition_plan_versions(workspace_id, student_user_id, version_number desc);

create table public.nutrition_meal_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  plan_version_id uuid not null,
  workspace_id uuid not null,
  student_user_id uuid not null references public.profiles(id) on delete restrict,
  student_role public.workspace_role not null default 'student' check (student_role = 'student'),
  meal_id text not null check (meal_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  action public.nutrition_meal_action not null,
  recorded_on date not null default current_date,
  idempotency_key text not null check (private.valid_training_idempotency_key(idempotency_key)),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  redacted_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (plan_version_id, workspace_id, student_user_id)
    references public.nutrition_plan_versions(id, workspace_id, student_user_id) on update restrict on delete restrict,
  foreign key (workspace_id, student_user_id, student_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  unique (workspace_id, student_user_id, idempotency_key)
);

create index nutrition_meal_events_plan_idx
  on public.nutrition_meal_events(plan_version_id, recorded_on, event_sequence desc);

create table public.nutrition_hydration_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  plan_version_id uuid not null,
  workspace_id uuid not null,
  student_user_id uuid not null references public.profiles(id) on delete restrict,
  student_role public.workspace_role not null default 'student' check (student_role = 'student'),
  total_ml integer not null check (total_ml between 0 and 10000),
  recorded_on date not null default current_date,
  idempotency_key text not null check (private.valid_training_idempotency_key(idempotency_key)),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  redacted_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (plan_version_id, workspace_id, student_user_id)
    references public.nutrition_plan_versions(id, workspace_id, student_user_id) on update restrict on delete restrict,
  foreign key (workspace_id, student_user_id, student_role)
    references public.workspace_members(workspace_id, user_id, role) on update restrict on delete restrict,
  unique (workspace_id, student_user_id, idempotency_key)
);

create index nutrition_hydration_events_plan_day_idx
  on public.nutrition_hydration_events(plan_version_id, recorded_on, event_sequence desc);

create or replace function private.public_nutrition_plan(row_value public.nutrition_plan_versions)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(row_value)
    - 'student_role' - 'integration_source'
    - 'consent_event_id' - 'consent_policy_version'
    - 'partner_idempotency_hash' - 'request_fingerprint';
$$;

create or replace function private.public_nutrition_meal_event(row_value public.nutrition_meal_events)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(row_value) - 'student_role' - 'idempotency_key' - 'request_fingerprint';
$$;

create or replace function private.public_nutrition_hydration_event(row_value public.nutrition_hydration_events)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(row_value) - 'student_role' - 'idempotency_key' - 'request_fingerprint';
$$;

revoke all on function private.public_nutrition_plan(public.nutrition_plan_versions) from public, anon, authenticated;
revoke all on function private.public_nutrition_meal_event(public.nutrition_meal_events) from public, anon, authenticated;
revoke all on function private.public_nutrition_hydration_event(public.nutrition_hydration_events) from public, anon, authenticated;

create or replace function private.reject_nutrition_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and current_user in ('postgres', 'supabase_admin')
    and current_setting('elo.nutrition_redaction', true) = 'enabled'
    and old.redacted_at is null
    and new.redacted_at is not null then
    if tg_table_name = 'nutrition_plan_versions'
      and (to_jsonb(new) - 'nutritionist_name' - 'nutritionist_crn' - 'title' - 'meals' - 'notes' - 'request_fingerprint' - 'redacted_at')
        = (to_jsonb(old) - 'nutritionist_name' - 'nutritionist_crn' - 'title' - 'meals' - 'notes' - 'request_fingerprint' - 'redacted_at') then
      return new;
    elsif tg_table_name = 'nutrition_meal_events'
      and (to_jsonb(new) - 'meal_id' - 'request_fingerprint' - 'redacted_at')
        = (to_jsonb(old) - 'meal_id' - 'request_fingerprint' - 'redacted_at') then
      return new;
    elsif tg_table_name = 'nutrition_hydration_events'
      and (to_jsonb(new) - 'total_ml' - 'request_fingerprint' - 'redacted_at')
        = (to_jsonb(old) - 'total_ml' - 'request_fingerprint' - 'redacted_at') then
      return new;
    end if;
  end if;
  raise exception using errcode = '55000', message = 'append_only_resource';
end;
$$;

revoke all on function private.reject_nutrition_mutation() from public, anon, authenticated;

create or replace function private.set_nutrition_event_time()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.recorded_at := clock_timestamp();
  if tg_table_name in ('nutrition_meal_events', 'nutrition_hydration_events') then
    new.recorded_on := current_date;
  end if;
  return new;
end;
$$;

revoke all on function private.set_nutrition_event_time() from public, anon, authenticated;

create trigger nutrition_plans_are_immutable before update or delete on public.nutrition_plan_versions
for each row execute function private.reject_nutrition_mutation();
create trigger nutrition_meal_events_server_timestamp before insert on public.nutrition_meal_events
for each row execute function private.set_nutrition_event_time();
create trigger nutrition_meal_events_are_append_only before update or delete on public.nutrition_meal_events
for each row execute function private.reject_nutrition_mutation();
create trigger nutrition_hydration_events_server_timestamp before insert on public.nutrition_hydration_events
for each row execute function private.set_nutrition_event_time();
create trigger nutrition_hydration_events_are_append_only before update or delete on public.nutrition_hydration_events
for each row execute function private.reject_nutrition_mutation();

alter table public.nutrition_plan_versions enable row level security;
alter table public.nutrition_meal_events enable row level security;
alter table public.nutrition_hydration_events enable row level security;

create policy nutrition_plans_select_scoped on public.nutrition_plan_versions
for select to authenticated
using (private.can_read_nutrition_subject(workspace_id, student_user_id));
create policy nutrition_meal_events_select_scoped on public.nutrition_meal_events
for select to authenticated
using (private.can_read_nutrition_subject(workspace_id, student_user_id));
create policy nutrition_hydration_events_select_scoped on public.nutrition_hydration_events
for select to authenticated
using (private.can_read_nutrition_subject(workspace_id, student_user_id));

revoke all on public.nutrition_plan_versions, public.nutrition_meal_events,
  public.nutrition_hydration_events from public, anon, authenticated;
grant select (
  id, workspace_id, student_user_id, version_number, nutritionist_name,
  nutritionist_crn, title, valid_from, valid_until, meals,
  hydration_target_ml, notes, redacted_at, published_at
) on public.nutrition_plan_versions to authenticated;
grant select (
  id, event_sequence, plan_version_id, workspace_id, student_user_id,
  meal_id, action, recorded_on, redacted_at, recorded_at
) on public.nutrition_meal_events to authenticated;
grant select (
  id, event_sequence, plan_version_id, workspace_id, student_user_id,
  total_ml, recorded_on, redacted_at, recorded_at
) on public.nutrition_hydration_events to authenticated;
revoke all on sequence public.nutrition_meal_events_event_sequence_seq,
  public.nutrition_hydration_events_event_sequence_seq from public, anon, authenticated;

create or replace function public.ingest_partner_nutrition_plan(
  p_workspace_id uuid,
  p_student_user_id uuid,
  p_integration_source text,
  p_nutritionist_name text,
  p_nutritionist_crn text,
  p_title text,
  p_valid_from date,
  p_valid_until date,
  p_meals jsonb,
  p_hydration_target_ml integer,
  p_notes text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_source text;
  clean_name text;
  clean_crn text;
  clean_title text;
  clean_notes text;
  consent_id uuid;
  consent_version text;
  key_hash bytea;
  fingerprint bytea;
  next_version integer;
  existing_plan public.nutrition_plan_versions%rowtype;
  created_plan public.nutrition_plan_versions%rowtype;
begin
  if (select auth.role()) <> 'service_role'
    or p_workspace_id is null or p_student_user_id is null
    or not private.valid_training_idempotency_key(p_idempotency_key)
    or p_integration_source is null
    or char_length(p_integration_source) not between 3 and 80
    or p_integration_source !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or p_nutritionist_name is null or char_length(p_nutritionist_name) not between 2 and 120
    or p_nutritionist_name ~ '[[:cntrl:]]'
    or p_nutritionist_crn is null or char_length(p_nutritionist_crn) not between 3 and 40
    or p_nutritionist_crn !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]*$'
    or p_title is null or char_length(p_title) not between 2 and 120
    or p_title ~ '[[:cntrl:]]'
    or p_valid_from is null or p_valid_until is null
    or p_valid_until < p_valid_from or p_valid_until > p_valid_from + 366
    or not private.valid_nutrition_meals(p_meals)
    or p_hydration_target_ml is null or p_hydration_target_ml not between 500 and 6000
    or (p_notes is not null and (
      char_length(p_notes) not between 1 and 1000 or p_notes ~ '[[:cntrl:]]'
    )) then
    raise exception using errcode = '22023', message = 'invalid_partner_nutrition_plan';
  end if;
  clean_source := btrim(p_integration_source);
  clean_name := btrim(p_nutritionist_name);
  clean_crn := btrim(p_nutritionist_crn);
  clean_title := btrim(p_title);
  clean_notes := nullif(btrim(p_notes), '');

  perform 1
  from public.workspace_members as student
  join public.profiles as profile on profile.id = student.user_id
  where student.workspace_id = p_workspace_id
    and student.user_id = p_student_user_id
    and student.role = 'student'
    and student.status = 'active'
    and profile.account_role = 'student'
  for share of student;
  if not found then
    raise exception using errcode = '42501', message = 'nutrition_subject_unavailable';
  end if;

  select consent_event_id, policy_version into consent_id, consent_version
  from private.current_nutrition_consent_evidence(p_workspace_id, p_student_user_id);
  if consent_id is null then
    raise exception using errcode = '42501', message = 'nutrition_consent_unavailable';
  end if;

  key_hash := extensions.digest(convert_to(clean_source || ':' || p_idempotency_key, 'UTF8'), 'sha256');
  fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'workspace_id', p_workspace_id,
    'student_user_id', p_student_user_id,
    'integration_source', clean_source,
    'nutritionist_name', clean_name,
    'nutritionist_crn', clean_crn,
    'title', clean_title,
    'valid_from', p_valid_from,
    'valid_until', p_valid_until,
    'meals', p_meals,
    'hydration_target_ml', p_hydration_target_ml,
    'notes', clean_notes
  )::text, 'UTF8'), 'sha256');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nutrition-plan:' || p_workspace_id::text || ':' || encode(key_hash, 'hex'), 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nutrition-plan-version:' || p_workspace_id::text || ':' || p_student_user_id::text, 0)
  );
  select plan.* into existing_plan
  from public.nutrition_plan_versions as plan
  where plan.workspace_id = p_workspace_id
    and plan.integration_source = clean_source
    and plan.partner_idempotency_hash = key_hash;
  if found then
    if existing_plan.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return private.public_nutrition_plan(existing_plan);
  end if;

  select coalesce(max(plan.version_number), 0) + 1 into next_version
  from public.nutrition_plan_versions as plan
  where plan.workspace_id = p_workspace_id
    and plan.student_user_id = p_student_user_id;

  insert into public.nutrition_plan_versions (
    workspace_id, student_user_id, version_number, integration_source,
    nutritionist_name, nutritionist_crn, title, valid_from, valid_until,
    meals, hydration_target_ml, notes, consent_event_id,
    consent_policy_version, partner_idempotency_hash, request_fingerprint
  ) values (
    p_workspace_id, p_student_user_id, next_version, clean_source,
    clean_name, clean_crn, clean_title, p_valid_from, p_valid_until,
    p_meals, p_hydration_target_ml, clean_notes, consent_id,
    consent_version, key_hash, fingerprint
  ) returning * into created_plan;
  return private.public_nutrition_plan(created_plan);
end;
$$;

revoke all on function public.ingest_partner_nutrition_plan(
  uuid, uuid, text, text, text, text, date, date, jsonb, integer, text, text
) from public, anon, authenticated;
grant execute on function public.ingest_partner_nutrition_plan(
  uuid, uuid, text, text, text, text, date, date, jsonb, integer, text, text
) to service_role;

create or replace function public.record_nutrition_meal_state(
  p_plan_version_id uuid,
  p_meal_id text,
  p_action text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target public.nutrition_plan_versions%rowtype;
  clean_action public.nutrition_meal_action;
  fingerprint bytea;
  existing_event public.nutrition_meal_events%rowtype;
  created_event public.nutrition_meal_events%rowtype;
begin
  if caller_id is null or p_plan_version_id is null
    or p_meal_id is null or p_meal_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
    or p_action is null or p_action not in ('completed','uncompleted')
    or not private.valid_training_idempotency_key(p_idempotency_key) then
    raise exception using errcode = '22023', message = 'invalid_nutrition_meal_state';
  end if;
  clean_action := p_action::public.nutrition_meal_action;

  select plan.* into target
  from public.nutrition_plan_versions as plan
  join public.workspace_members as student
    on student.workspace_id = plan.workspace_id
   and student.user_id = caller_id
   and student.role = 'student'
   and student.status = 'active'
  where plan.id = p_plan_version_id
    and plan.student_user_id = caller_id
    and plan.redacted_at is null
  for share of plan, student;
  if not found
    or current_date not between target.valid_from and target.valid_until
    or not private.has_current_nutrition_processing_consent(target.workspace_id, caller_id)
    or not exists (
      select 1 from jsonb_array_elements(target.meals) as meal(value)
      where meal.value ->> 'id' = p_meal_id
    ) then
    raise exception using errcode = '42501', message = 'nutrition_resource_unavailable';
  end if;

  fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'workspace_id', target.workspace_id,
    'student_user_id', caller_id,
    'plan_version_id', target.id,
    'meal_id', p_meal_id,
    'action', clean_action,
    'recorded_on', current_date
  )::text, 'UTF8'), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nutrition-meal:' || caller_id::text || ':' || p_idempotency_key, 0)
  );
  select event.* into existing_event
  from public.nutrition_meal_events as event
  where event.workspace_id = target.workspace_id
    and event.student_user_id = caller_id
    and event.idempotency_key = p_idempotency_key;
  if found then
    if existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return private.public_nutrition_meal_event(existing_event);
  end if;

  perform private.consume_nutrition_mutation_budget(target.workspace_id, caller_id, 'meal_state', 60, 500);
  insert into public.nutrition_meal_events (
    plan_version_id, workspace_id, student_user_id, meal_id,
    action, idempotency_key, request_fingerprint
  ) values (
    target.id, target.workspace_id, caller_id, p_meal_id,
    clean_action, p_idempotency_key, fingerprint
  ) returning * into created_event;
  return private.public_nutrition_meal_event(created_event);
end;
$$;

create or replace function public.record_nutrition_hydration_total(
  p_plan_version_id uuid,
  p_total_ml integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target public.nutrition_plan_versions%rowtype;
  fingerprint bytea;
  existing_event public.nutrition_hydration_events%rowtype;
  created_event public.nutrition_hydration_events%rowtype;
begin
  if caller_id is null or p_plan_version_id is null
    or p_total_ml is null or p_total_ml not between 0 and 10000
    or not private.valid_training_idempotency_key(p_idempotency_key) then
    raise exception using errcode = '22023', message = 'invalid_nutrition_hydration_total';
  end if;
  select plan.* into target
  from public.nutrition_plan_versions as plan
  join public.workspace_members as student
    on student.workspace_id = plan.workspace_id
   and student.user_id = caller_id
   and student.role = 'student'
   and student.status = 'active'
  where plan.id = p_plan_version_id
    and plan.student_user_id = caller_id
    and plan.redacted_at is null
  for share of plan, student;
  if not found
    or current_date not between target.valid_from and target.valid_until
    or not private.has_current_nutrition_processing_consent(target.workspace_id, caller_id) then
    raise exception using errcode = '42501', message = 'nutrition_resource_unavailable';
  end if;

  fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'workspace_id', target.workspace_id,
    'student_user_id', caller_id,
    'plan_version_id', target.id,
    'recorded_on', current_date,
    'total_ml', p_total_ml
  )::text, 'UTF8'), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nutrition-hydration:' || caller_id::text || ':' || p_idempotency_key, 0)
  );
  select event.* into existing_event
  from public.nutrition_hydration_events as event
  where event.workspace_id = target.workspace_id
    and event.student_user_id = caller_id
    and event.idempotency_key = p_idempotency_key;
  if found then
    if existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different input';
    end if;
    return private.public_nutrition_hydration_event(existing_event);
  end if;

  perform private.consume_nutrition_mutation_budget(target.workspace_id, caller_id, 'hydration_total', 60, 500);
  insert into public.nutrition_hydration_events (
    plan_version_id, workspace_id, student_user_id, total_ml,
    idempotency_key, request_fingerprint
  ) values (
    target.id, target.workspace_id, caller_id, p_total_ml,
    p_idempotency_key, fingerprint
  ) returning * into created_event;
  return private.public_nutrition_hydration_event(created_event);
end;
$$;

revoke all on function public.record_nutrition_meal_state(uuid, text, text, text) from public, anon;
revoke all on function public.record_nutrition_hydration_total(uuid, integer, text) from public, anon;
grant execute on function public.record_nutrition_meal_state(uuid, text, text, text) to authenticated;
grant execute on function public.record_nutrition_hydration_total(uuid, integer, text) to authenticated;

create table private.nutrition_redaction_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subject_reference bytea not null check (octet_length(subject_reference) = 32),
  reason text not null check (char_length(reason) between 4 and 500 and reason = btrim(reason)),
  plans_redacted integer not null check (plans_redacted >= 0),
  meal_events_redacted integer not null check (meal_events_redacted >= 0),
  hydration_events_redacted integer not null check (hydration_events_redacted >= 0),
  executed_by text not null,
  executed_at timestamptz not null default clock_timestamp()
);

revoke all on private.nutrition_redaction_events from public, anon, authenticated;

create or replace function private.redact_nutrition_subject_payloads(
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
  plan_count integer := 0;
  meal_count integer := 0;
  hydration_count integer := 0;
begin
  if current_user not in ('postgres','supabase_admin')
    or target_workspace_id is null or target_student_user_id is null
    or redaction_reason is null or char_length(redaction_reason) not between 4 and 500
    or redaction_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '42501', message = 'retention_operation_unavailable';
  end if;
  clean_reason := btrim(redaction_reason);
  if char_length(clean_reason) not between 4 and 500 then
    raise exception using errcode = '42501', message = 'retention_operation_unavailable';
  end if;
  perform set_config('elo.nutrition_redaction', 'enabled', true);

  update public.nutrition_plan_versions
  set nutritionist_name = 'conteudo removido',
      nutritionist_crn = 'redacted',
      title = 'conteudo removido',
      meals = '[]'::jsonb,
      notes = null,
      request_fingerprint = extensions.digest(convert_to(gen_random_uuid()::text, 'UTF8'), 'sha256'),
      redacted_at = clock_timestamp()
  where workspace_id = target_workspace_id
    and student_user_id = target_student_user_id
    and redacted_at is null;
  get diagnostics plan_count = row_count;

  update public.nutrition_meal_events
  set meal_id = 'redacted',
      request_fingerprint = extensions.digest(convert_to(gen_random_uuid()::text, 'UTF8'), 'sha256'),
      redacted_at = clock_timestamp()
  where workspace_id = target_workspace_id
    and student_user_id = target_student_user_id
    and redacted_at is null;
  get diagnostics meal_count = row_count;

  update public.nutrition_hydration_events
  set total_ml = 0,
      request_fingerprint = extensions.digest(convert_to(gen_random_uuid()::text, 'UTF8'), 'sha256'),
      redacted_at = clock_timestamp()
  where workspace_id = target_workspace_id
    and student_user_id = target_student_user_id
    and redacted_at is null;
  get diagnostics hydration_count = row_count;

  insert into private.nutrition_redaction_events (
    workspace_id, subject_reference, reason, plans_redacted,
    meal_events_redacted, hydration_events_redacted, executed_by
  ) values (
    target_workspace_id,
    extensions.digest(convert_to(target_workspace_id::text || ':' || target_student_user_id::text, 'UTF8'), 'sha256'),
    clean_reason, plan_count, meal_count, hydration_count, current_user
  ) returning id into event_id;
  return event_id;
end;
$$;

revoke all on function private.redact_nutrition_subject_payloads(uuid, uuid, text)
  from public, anon, authenticated;

comment on table public.nutrition_plan_versions is
  'Immutable nutritionist-authored plans accepted only through a service-role partner integration.';
comment on table public.nutrition_meal_events is
  'Append-only student meal-state events for an active partner plan.';
comment on table public.nutrition_hydration_events is
  'Append-only student hydration-total events for an active partner plan.';
comment on function public.ingest_partner_nutrition_plan(
  uuid, uuid, text, text, text, text, date, date, jsonb, integer, text, text
) is 'Service-role-only ingestion boundary; authenticated trainers cannot author or mutate diets.';
