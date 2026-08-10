-- JSONB limits are wire/text limits, not internal-storage limits. The previous
-- internal-representation helper is STABLE, so it must not be used by validators
-- declared IMMUTABLE. Recreate every affected validator
-- with the canonical JSON text byte length instead.

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
      and octet_length(value::text) <= 1024
      and not exists (
        select 1
        from jsonb_array_elements(value) as item(element)
        where jsonb_typeof(element) <> 'string'
          or (element #>> '{}') not in (
            'chest_pain',
            'shortness_of_breath',
            'fainting',
            'major_trauma',
            'loss_of_strength',
            'loss_of_sensation',
            'fever',
            'bowel_bladder_change',
            'major_swelling',
            'loss_of_motion',
            'numbness_or_weakness'
          )
      )
      and (
        select count(*) = count(distinct element)
        from jsonb_array_elements(value) as item(element)
      )
  end;
$$;

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
    or octet_length(value::text) > 65536 then
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
    or octet_length(value::text) > 65536 then
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
      or octet_length(value::text) > 4096 then false
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
    or octet_length(answers::text) > 131072 then
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
    or octet_length(value::text) > 65536 then
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

-- Function-backed CHECK constraints are not automatically revalidated by
-- CREATE OR REPLACE FUNCTION. Block concurrent writers, then preflight every
-- affected table against the function-backed predicate whose semantics changed.
-- A single violation raises CHECK_VIOLATION and rolls back all replacements.
lock table public.pain_reports,
  public.workout_versions,
  public.workout_completion_events,
  public.anamnesis_assignments,
  public.nutrition_plan_versions
in share row exclusive mode;

do $$
begin
  if exists (
    select 1 from public.pain_reports
    where not private.valid_red_flag_codes(red_flags)
  ) then
    raise exception using errcode = '23514', message = 'pain_reports_red_flags_revalidation_failed';
  end if;

  if exists (
    select 1 from public.workout_versions
    where not private.valid_workout_exercises(exercises)
  ) then
    raise exception using errcode = '23514', message = 'workout_versions_exercises_revalidation_failed';
  end if;

  if exists (
    select 1 from public.workout_completion_events
    where not private.valid_exercise_id_array(completed_exercise_ids)
  ) then
    raise exception using errcode = '23514', message = 'workout_completion_ids_revalidation_failed';
  end if;

  if exists (
    select 1 from public.anamnesis_assignments
    where not private.valid_form_questions(questions)
  ) then
    raise exception using errcode = '23514', message = 'anamnesis_questions_revalidation_failed';
  end if;

  if exists (
    select 1 from public.nutrition_plan_versions
    where redacted_at is null
      and not private.valid_nutrition_meals(meals)
  ) then
    raise exception using errcode = '23514', message = 'nutrition_meals_revalidation_failed';
  end if;
end;
$$;

-- Replacing the constraint validates every existing row immediately. Because
-- migrations run transactionally, an incompatible row aborts this migration
-- and restores the previous constraint and function definitions.
alter table public.anamnesis_submissions
  drop constraint if exists anamnesis_submissions_answers_check;

alter table public.anamnesis_submissions
  add constraint anamnesis_submissions_answers_check check (
    jsonb_typeof(answers) = 'object'
    and octet_length(answers::text) <= 131072
  );

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
    or octet_length(p_answers::text) > 131072 then
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

-- CREATE OR REPLACE preserves existing ACLs, but keep the intended boundary
-- explicit so a manually altered environment converges during this rollout.
revoke all on function private.valid_red_flag_codes(jsonb) from public, anon, authenticated;
revoke all on function private.valid_workout_exercises(jsonb) from public, anon, authenticated;
revoke all on function private.valid_form_questions(jsonb) from public, anon, authenticated;
revoke all on function private.valid_exercise_id_array(jsonb) from public, anon, authenticated;
revoke all on function private.valid_form_answers(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.valid_nutrition_meals(jsonb) from public, anon, authenticated;
revoke all on function public.submit_anamnesis(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_anamnesis(uuid, jsonb, text) to authenticated;
