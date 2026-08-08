-- Notifications are derived from authoritative domain events. Only read receipts
-- are stored, so the feed cannot drift away from training, health, schedule,
-- messaging, or nutrition state.

create table private.notification_read_receipts (
  workspace_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_key text not null check (
    char_length(item_key) between 3 and 160
    and item_key ~ '^[a-z][A-Za-z0-9:_-]*$'
  ),
  read_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, user_id, item_key),
  foreign key (workspace_id, user_id)
    references public.workspace_members(workspace_id, user_id) on update restrict on delete cascade
);

create index notification_receipts_retention_idx
  on private.notification_read_receipts(read_at);

revoke all on private.notification_read_receipts from public, anon, authenticated;

create or replace function private.current_notification_scope()
returns table (
  resolved_workspace_id uuid,
  resolved_user_id uuid,
  resolved_role public.workspace_role
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  membership_count integer;
  workspace_id uuid;
  membership_role public.workspace_role;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'notification_scope_unavailable';
  end if;
  select count(*), min(member.workspace_id::text)::uuid
  into membership_count, workspace_id
  from public.workspace_members as member
  where member.user_id = caller_id
    and member.status = 'active';
  if membership_count = 0 then
    raise exception using errcode = '42501', message = 'notification_scope_unavailable';
  elsif membership_count > 1 then
    raise exception using errcode = '21000', message = 'notification_scope_ambiguous';
  end if;
  select member.role into membership_role
  from public.workspace_members as member
  where member.workspace_id = workspace_id
    and member.user_id = caller_id
    and member.status = 'active';
  if membership_role is null then
    raise exception using errcode = '42501', message = 'notification_scope_unavailable';
  elsif membership_role in ('owner','trainer')
    and not private.is_training_professional(caller_id, workspace_id) then
    raise exception using errcode = '42501', message = 'notification_scope_unavailable';
  end if;
  return query select workspace_id, caller_id, membership_role;
end;
$$;

revoke all on function private.current_notification_scope() from public, anon, authenticated;

create or replace function public.list_my_notifications(p_limit integer default 20)
returns table (
  item_key text,
  kind text,
  title text,
  detail text,
  occurred_at timestamptz,
  target_page text,
  student_user_id uuid,
  is_read boolean,
  priority smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  scope record;
begin
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode = '22023', message = 'invalid_notification_limit';
  end if;
  select * into scope from private.current_notification_scope();

  return query
  with activity as (
    -- Professional attention: consented health signals.
    select
      'pain:' || report.id::text as item_key,
      'pain_report'::text as kind,
      profile.display_name || ' compartilhou um sinal' as title,
      report.region || ' · intensidade ' || report.intensity::text || '/10' as detail,
      report.created_at as occurred_at,
      'copilot'::text as target_page,
      report.student_user_id,
      (case when report.intensity >= 8 or jsonb_array_length(report.red_flags) > 0 then 3 else 2 end)::smallint as priority
    from public.pain_reports as report
    join public.workspace_members as student
      on student.workspace_id = report.workspace_id
     and student.user_id = report.student_user_id
     and student.role = 'student'
     and student.status = 'active'
    join public.profiles as profile on profile.id = report.student_user_id
    where scope.resolved_role in ('owner','trainer')
      and report.workspace_id = scope.resolved_workspace_id
      and report.created_at >= now() - interval '90 days'
      and private.has_current_health_processing_consent(report.workspace_id, report.student_user_id)

    union all

    -- Professional attention: schedule requests waiting for a decision.
    select
      'schedule-request:' || session.id::text || ':' || session.session_sequence::text,
      'schedule_request',
      profile.display_name || ' solicitou um horário',
      slot.place,
      session.requested_at,
      'schedule',
      session.student_user_id,
      2::smallint
    from public.schedule_sessions as session
    join public.schedule_slots as slot
      on slot.id = session.slot_id and slot.workspace_id = session.workspace_id
    join public.workspace_members as student
      on student.workspace_id = session.workspace_id
     and student.user_id = session.student_user_id
     and student.role = 'student'
     and student.status = 'active'
    join public.profiles as profile on profile.id = session.student_user_id
    where scope.resolved_role in ('owner','trainer')
      and session.workspace_id = scope.resolved_workspace_id
      and session.state = 'requested'
      and slot.state <> 'cancelled'
      and session.requested_at >= now() - interval '90 days'

    union all

    -- Professional attention: consented anamnesis submissions.
    select
      'anamnesis-submission:' || submission.id::text,
      'anamnesis_submission',
      profile.display_name || ' respondeu uma anamnese',
      assignment.title,
      submission.submitted_at,
      'forms',
      submission.student_user_id,
      2::smallint
    from public.anamnesis_submissions as submission
    join public.anamnesis_assignments as assignment
      on assignment.id = submission.assignment_id
     and assignment.workspace_id = submission.workspace_id
     and assignment.student_user_id = submission.student_user_id
    join public.workspace_members as student
      on student.workspace_id = submission.workspace_id
     and student.user_id = submission.student_user_id
     and student.role = 'student'
     and student.status = 'active'
    join public.profiles as profile on profile.id = submission.student_user_id
    where scope.resolved_role in ('owner','trainer')
      and submission.workspace_id = scope.resolved_workspace_id
      and submission.redacted_at is null
      and submission.submitted_at >= now() - interval '90 days'
      and private.has_current_health_processing_consent(submission.workspace_id, submission.student_user_id)

    union all

    -- Professional attention: consented completion feedback.
    select
      'workout-completion:' || completion.id::text,
      'workout_completion',
      profile.display_name || ' concluiu um treino',
      workout.title || ' · RPE ' || completion.rpe::text || '/10',
      completion.completed_at,
      'student-detail',
      completion.student_user_id,
      1::smallint
    from public.workout_completion_events as completion
    join public.workout_versions as workout
      on workout.id = completion.workout_version_id
     and workout.workspace_id = completion.workspace_id
     and workout.student_user_id = completion.student_user_id
    join public.workspace_members as student
      on student.workspace_id = completion.workspace_id
     and student.user_id = completion.student_user_id
     and student.role = 'student'
     and student.status = 'active'
    join public.profiles as profile on profile.id = completion.student_user_id
    where scope.resolved_role in ('owner','trainer')
      and completion.workspace_id = scope.resolved_workspace_id
      and completion.redacted_at is null
      and workout.redacted_at is null
      and completion.completed_at >= now() - interval '90 days'
      and private.has_current_health_processing_consent(completion.workspace_id, completion.student_user_id)

    union all

    -- Private messages intentionally do not expose their body in the feed.
    select
      'message:' || message.id::text,
      'message',
      profile.display_name || ' enviou uma mensagem',
      'Conversa privada atualizada',
      message.created_at,
      'messages',
      message.student_user_id,
      1::smallint
    from public.thread_messages as message
    join public.workspace_members as student
      on student.workspace_id = message.workspace_id
     and student.user_id = message.student_user_id
     and student.role = 'student'
     and student.status = 'active'
    join public.profiles as profile on profile.id = message.student_user_id
    where scope.resolved_role in ('owner','trainer')
      and message.workspace_id = scope.resolved_workspace_id
      and message.sender_role = 'student'
      and message.redacted_at is null
      and message.created_at >= now() - interval '90 days'

    union all

    -- Student updates: immutable workout publication.
    select
      'workout:' || workout.id::text,
      'workout',
      'Novo treino publicado',
      workout.title,
      workout.published_at,
      'workout',
      null::uuid,
      2::smallint
    from public.workout_versions as workout
    where scope.resolved_role = 'student'
      and workout.workspace_id = scope.resolved_workspace_id
      and workout.student_user_id = scope.resolved_user_id
      and workout.redacted_at is null
      and workout.published_at >= now() - interval '90 days'

    union all

    -- Student updates: form assignment.
    select
      'anamnesis:' || assignment.id::text,
      'anamnesis',
      'Nova anamnese para responder',
      assignment.title,
      assignment.assigned_at,
      'student-form',
      null::uuid,
      2::smallint
    from public.anamnesis_assignments as assignment
    where scope.resolved_role = 'student'
      and assignment.workspace_id = scope.resolved_workspace_id
      and assignment.student_user_id = scope.resolved_user_id
      and assignment.assigned_at >= now() - interval '90 days'

    union all

    -- Student updates: every distinct schedule state becomes its own receipt key.
    select
      'schedule:' || session.id::text || ':' || session.state::text,
      'schedule',
      case session.state
        when 'requested' then 'Solicitação de horário enviada'
        when 'confirmed' then 'Sessão confirmada'
        when 'declined' then 'Solicitação de horário recusada'
        else 'Sessão cancelada'
      end,
      slot.place,
      session.updated_at,
      'schedule',
      null::uuid,
      (case when session.state = 'confirmed' then 2 else 1 end)::smallint
    from public.schedule_sessions as session
    join public.schedule_slots as slot
      on slot.id = session.slot_id and slot.workspace_id = session.workspace_id
    where scope.resolved_role = 'student'
      and session.workspace_id = scope.resolved_workspace_id
      and session.student_user_id = scope.resolved_user_id
      and session.updated_at >= now() - interval '90 days'

    union all

    -- Student updates: professional messages, without message content.
    select
      'message:' || message.id::text,
      'message',
      'Nova mensagem do seu professor',
      'Conversa privada atualizada',
      message.created_at,
      'messages',
      null::uuid,
      1::smallint
    from public.thread_messages as message
    where scope.resolved_role = 'student'
      and message.workspace_id = scope.resolved_workspace_id
      and message.student_user_id = scope.resolved_user_id
      and message.sender_role in ('owner','trainer')
      and message.redacted_at is null
      and message.created_at >= now() - interval '90 days'

    union all

    -- Student updates: nutritionist-authored plan. The student remains the data subject.
    select
      'nutrition:' || plan.id::text,
      'nutrition',
      'Novo plano nutricional disponível',
      plan.title || ' · ' || plan.nutritionist_name,
      plan.published_at,
      'nutrition',
      null::uuid,
      2::smallint
    from public.nutrition_plan_versions as plan
    where scope.resolved_role = 'student'
      and plan.workspace_id = scope.resolved_workspace_id
      and plan.student_user_id = scope.resolved_user_id
      and plan.redacted_at is null
      and plan.published_at >= now() - interval '90 days'

    union all

    -- Student updates: professional review of a pain report.
    select
      'pain-event:' || event.id::text,
      'pain_update',
      case event.action when 'resolved' then 'Relato marcado como resolvido' else 'Seu relato foi revisado' end,
      'A atualização está no seu histórico protegido',
      event.created_at,
      'assistant',
      null::uuid,
      1::smallint
    from public.pain_report_events as event
    where scope.resolved_role = 'student'
      and event.workspace_id = scope.resolved_workspace_id
      and event.student_user_id = scope.resolved_user_id
      and event.created_at >= now() - interval '90 days'
  )
  select
    activity.item_key,
    activity.kind,
    activity.title,
    activity.detail,
    activity.occurred_at,
    activity.target_page,
    activity.student_user_id,
    receipt.item_key is not null as is_read,
    activity.priority
  from activity
  left join private.notification_read_receipts as receipt
    on receipt.workspace_id = scope.resolved_workspace_id
   and receipt.user_id = scope.resolved_user_id
   and receipt.item_key = activity.item_key
  order by activity.priority desc, activity.occurred_at desc, activity.item_key desc
  limit p_limit;
end;
$$;

revoke all on function public.list_my_notifications(integer) from public, anon;
grant execute on function public.list_my_notifications(integer) to authenticated;

create or replace function public.mark_my_notifications_read(p_item_keys text[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  scope record;
  requested_count integer;
  available_count integer;
begin
  if p_item_keys is null
    or coalesce(array_length(p_item_keys, 1), 0) not between 1 and 50
    or exists (
      select 1 from unnest(p_item_keys) as requested(value)
      where requested.value is null
        or char_length(requested.value) not between 3 and 160
        or requested.value !~ '^[a-z][A-Za-z0-9:_-]*$'
    ) then
    raise exception using errcode = '22023', message = 'invalid_notification_items';
  end if;
  select count(distinct requested.value) into requested_count
  from unnest(p_item_keys) as requested(value);
  if requested_count <> array_length(p_item_keys, 1) then
    raise exception using errcode = '22023', message = 'duplicate_notification_items';
  end if;

  select * into scope from private.current_notification_scope();
  select count(*) into available_count
  from public.list_my_notifications(50) as feed
  where feed.item_key = any(p_item_keys);
  if available_count <> requested_count then
    raise exception using errcode = '42501', message = 'notification_items_unavailable';
  end if;

  insert into private.notification_read_receipts (workspace_id, user_id, item_key, read_at)
  select scope.resolved_workspace_id, scope.resolved_user_id, requested.value, clock_timestamp()
  from unnest(p_item_keys) as requested(value)
  on conflict (workspace_id, user_id, item_key)
  do update set read_at = excluded.read_at;
  return requested_count;
end;
$$;

revoke all on function public.mark_my_notifications_read(text[]) from public, anon;
grant execute on function public.mark_my_notifications_read(text[]) to authenticated;

create or replace function private.prune_notification_read_receipts(retain_since timestamptz)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if current_user not in ('postgres','supabase_admin')
    or retain_since is null
    or retain_since > clock_timestamp() - interval '30 days' then
    raise exception using errcode = '42501', message = 'notification_retention_unavailable';
  end if;
  delete from private.notification_read_receipts where read_at < retain_since;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function private.prune_notification_read_receipts(timestamptz)
  from public, anon, authenticated;

comment on function public.list_my_notifications(integer) is
  'Returns a bounded, role-scoped activity feed derived from authoritative Elo domain records.';
comment on function public.mark_my_notifications_read(text[]) is
  'Records read receipts only for currently visible notifications in the caller active workspace.';
