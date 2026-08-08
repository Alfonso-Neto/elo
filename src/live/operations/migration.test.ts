import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/20260807240000_schedule_and_messages.sql?raw'

describe('schedule and messages migration static safety contract', () => {
  it('keeps table writes RPC-only and grants authenticated reads', () => {
    expect(migration).toContain('revoke all on public.schedule_slots, public.schedule_sessions,')
    expect(migration).toContain(') on public.schedule_slots to authenticated;')
    expect(migration).toContain(') on public.thread_messages to authenticated;')
    expect(migration).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.(?:schedule_|thread_messages)/i)
    expect(migration).not.toMatch(/grant\s+select\s+on\s+public\.(?:schedule_|thread_messages)/i)
    expect(migration).toContain("to_jsonb(row_value) - 'idempotency_key' - 'request_fingerprint'")
    expect(migration).toContain("to_jsonb(row_value) - 'student_role' - 'request_idempotency_key' - 'request_fingerprint'")
  })

  it('uses security-definer RPCs with auth-derived identity and no workspace parameter', () => {
    const publicRpcSection = migration.match(/create or replace function public\.create_schedule_slot[\s\S]*?create table private\.operations_redaction_events/)?.[0] ?? ''
    expect(publicRpcSection.match(/security definer/g)).toHaveLength(8)
    expect(publicRpcSection.match(/caller_id uuid := \(select auth\.uid\(\)\)/g)).toHaveLength(8)
    expect(migration).not.toMatch(/create or replace function public\.[^(]+\([^)]*p_workspace_id/is)
    expect(migration).not.toMatch(/create or replace function public\.[^(]+\([^)]*p_sender_user_id/is)
  })

  it('locks schedule decisions and scopes all selectable tables with RLS', () => {
    expect(migration.match(/enable row level security/g)).toHaveLength(5)
    expect(migration).toContain('for update of slot')
    expect(migration).toContain('for update of session')
    expect(migration).toContain("where session.id = schedule_session_events.session_id")
  })

  it('enforces stable idempotency and append-only message history', () => {
    expect(migration).toContain('unique (workspace_id, sender_user_id, idempotency_key)')
    expect(migration).toContain('unique (workspace_id, student_user_id, request_idempotency_key)')
    expect(migration).toContain('thread_messages_are_append_only')
    expect(migration).toContain('schedule_session_events_are_append_only')
    expect(migration).toContain("'schedule-session-event:' || caller_id::text")
    expect(migration.match(/'schedule-session-event:' \|\| caller_id::text/g)).toHaveLength(3)
    expect(migration).toContain("return private.public_thread_message(existing_message);")
    expect(migration).not.toMatch(/insert\s+into\s+public\.(?:schedule_slots|schedule_sessions|thread_messages)[\s\S]*?random\s*\(/i)
  })

  it('requires verified professionals and rate-limits non-replay mutations', () => {
    expect(migration).not.toContain('private.is_workspace_trainer')
    expect(migration).toContain('private.is_training_professional(caller_id, member.workspace_id)')
    expect(migration).toContain('create table private.operations_mutation_budgets')
    expect(migration.match(/perform private\.consume_operations_mutation_budget/g)).toHaveLength(8)
    expect(migration).toContain("'send_message', 30, 500")
  })

  it('supports auditable professional cancellations and private message retention', () => {
    expect(migration).toContain('create table public.schedule_slot_events')
    expect(migration).toContain('create or replace function public.cancel_schedule_session')
    expect(migration).toContain('create or replace function public.cancel_schedule_slot')
    expect(migration).toContain('create or replace function private.redact_operations_subject_messages')
    expect(migration).toContain("current_setting('elo.operations_redaction', true) = 'enabled'")
    expect(migration).toContain('redacted_at timestamptz')
  })
})
