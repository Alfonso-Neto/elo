-- Keep user-visible text unambiguous even when a client bypasses the web UI.
-- Line breaks remain valid only in fields that intentionally support paragraphs.

create or replace function private.has_unsafe_display_characters(
  value text,
  allow_multiline boolean default false
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when value is null then false
    else (
      (case
        when allow_multiline then translate(value, chr(9) || chr(10) || chr(13), '')
        else value
      end) ~ '[[:cntrl:]]'
      or value ~ U&'[\200B-\200F\202A-\202E\2060-\206F\FEFF]'
    )
  end;
$$;

comment on function private.has_unsafe_display_characters(text, boolean) is
  'Rejects controls, invisible separators and bidirectional formatting in display text.';

create or replace function private.jsonb_has_unsafe_display_characters(
  input_value jsonb,
  allow_multiline boolean default false
)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  item jsonb;
  object_key text;
begin
  if input_value is null then
    return false;
  end if;

  case jsonb_typeof(input_value)
    when 'string' then
      return private.has_unsafe_display_characters(input_value #>> '{}', allow_multiline);
    when 'array' then
      for item in select element.value from pg_catalog.jsonb_array_elements(input_value) as element(value)
      loop
        if private.jsonb_has_unsafe_display_characters(item, allow_multiline) then
          return true;
        end if;
      end loop;
    when 'object' then
      for object_key, item in
        select entry.key, entry.value from pg_catalog.jsonb_each(input_value) as entry(key, value)
      loop
        if private.has_unsafe_display_characters(object_key)
          or private.jsonb_has_unsafe_display_characters(item, allow_multiline) then
          return true;
        end if;
      end loop;
    else
      return false;
  end case;

  return false;
end;
$$;

comment on function private.jsonb_has_unsafe_display_characters(jsonb, boolean) is
  'Recursively checks JSON object keys and string values without relying on escaped JSON serialization.';

revoke all on function private.has_unsafe_display_characters(text, boolean)
  from public, anon, authenticated;
revoke all on function private.jsonb_has_unsafe_display_characters(jsonb, boolean)
  from public, anon, authenticated;

alter table public.profiles
  add constraint profiles_display_name_safe_check check (
    display_name = btrim(display_name)
    and not private.has_unsafe_display_characters(display_name)
  );

alter table public.workspaces
  add constraint workspaces_name_safe_check check (
    name = btrim(name)
    and not private.has_unsafe_display_characters(name)
  );

alter table public.trainer_profiles
  add constraint trainer_profiles_display_text_safe_check check (
    (studio_name is null or not private.has_unsafe_display_characters(studio_name))
    and (
      verification_rejection_reason is null
      or not private.has_unsafe_display_characters(verification_rejection_reason, true)
    )
  );

alter table public.pain_reports
  add constraint pain_reports_display_text_safe_check check (
    not private.has_unsafe_display_characters(region)
    and not private.has_unsafe_display_characters(movement)
    and (detail is null or not private.has_unsafe_display_characters(detail, true))
  );

alter table public.pain_report_events
  add constraint pain_report_events_note_safe_check check (
    note is null or not private.has_unsafe_display_characters(note, true)
  );

alter table public.workout_versions
  add constraint workout_versions_display_text_safe_check check (
    not private.has_unsafe_display_characters(title)
    and not private.jsonb_has_unsafe_display_characters(exercises, true)
  );

alter table public.workout_completion_events
  add constraint workout_completion_display_text_safe_check check (
    not private.has_unsafe_display_characters(mood)
    and (comment is null or not private.has_unsafe_display_characters(comment, true))
  );

alter table public.anamnesis_assignments
  add constraint anamnesis_assignments_display_text_safe_check check (
    not private.has_unsafe_display_characters(title)
    and not private.jsonb_has_unsafe_display_characters(questions, true)
  );

alter table public.anamnesis_submissions
  add constraint anamnesis_submissions_display_text_safe_check check (
    not private.jsonb_has_unsafe_display_characters(answers, true)
  );

alter table public.trainer_student_notes
  add constraint trainer_student_notes_display_text_safe_check check (
    not private.has_unsafe_display_characters(note, true)
  );

alter table public.schedule_slots
  add constraint schedule_slots_place_safe_check check (
    not private.has_unsafe_display_characters(place)
  );

alter table public.thread_messages
  add constraint thread_messages_body_safe_check check (
    not private.has_unsafe_display_characters(body)
  );

alter table public.nutrition_plan_versions
  add constraint nutrition_plan_display_text_safe_check check (
    not private.has_unsafe_display_characters(nutritionist_name)
    and not private.has_unsafe_display_characters(nutritionist_crn)
    and not private.has_unsafe_display_characters(title)
    and not private.jsonb_has_unsafe_display_characters(meals, true)
    and (notes is null or not private.has_unsafe_display_characters(notes, true))
  );

alter table public.ai_proposals
  add constraint ai_proposals_display_text_safe_check check (
    not private.has_unsafe_display_characters(summary, true)
    and not private.has_unsafe_display_characters(disclaimer, true)
    and not private.jsonb_has_unsafe_display_characters(red_flags, true)
    and not private.jsonb_has_unsafe_display_characters(questions, true)
    and not private.jsonb_has_unsafe_display_characters(rationale, true)
    and not private.jsonb_has_unsafe_display_characters(workout_changes, true)
    and not private.jsonb_has_unsafe_display_characters(sources, true)
    and not private.jsonb_has_unsafe_display_characters(uncertainties, true)
  );

alter table public.ai_proposal_decisions
  add constraint ai_proposal_decisions_note_safe_check check (
    note is null or not private.has_unsafe_display_characters(note, true)
  );
