import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/20260807230000_training_and_forms.sql?raw'

describe('training and anamnesis migration static safety contract', () => {
  it('requires verified or explicitly allow-listed professionals for reads and writes', () => {
    expect(migration).toContain("trainer.verification_status = 'verified'")
    expect(migration).toContain('from private.ai_workspace_access as access')
    expect(migration).toContain('private.is_training_professional(trainer.user_id, student.workspace_id)')
    expect(migration).not.toContain('or private.is_workspace_trainer(workspace_id)')
    expect(migration).toContain('private.can_read_current_training_health(workspace_id, student_user_id)')
  })

  it('binds every retry key and fingerprint to the resolved tenant', () => {
    expect(migration).toContain('unique (workspace_id, published_by_user_id, idempotency_key)')
    expect(migration).toContain('unique (workspace_id, assigned_by_user_id, idempotency_key)')
    expect(migration).toContain('unique (workspace_id, author_user_id, idempotency_key)')
    expect(migration.match(/'workspace', (?:resolved_workspace_id|target\.workspace_id)/g)?.length).toBeGreaterThanOrEqual(5)
    expect(migration).not.toMatch(/on conflict \((?:published_by_user_id|assigned_by_user_id|author_user_id), idempotency_key\)/)
  })

  it('returns an existing anamnesis submission before checking renewed consent', () => {
    const start = migration.indexOf('create or replace function public.submit_anamnesis')
    const body = migration.slice(start, migration.indexOf('create or replace function public.create_trainer_student_note', start))
    const replay = body.indexOf('if existing_id is not null then')
    const consent = body.indexOf("where policy.purpose = 'health_processing'")
    expect(replay).toBeGreaterThan(0)
    expect(consent).toBeGreaterThan(replay)
    expect(body).toContain("perform private.consume_training_mutation_budget(target.workspace_id, caller_id, 'submit_anamnesis'")
  })

  it('validates bounded inputs before locks and applies per-operation budgets', () => {
    expect(migration.match(/not private\.valid_training_idempotency_key\(p_idempotency_key\)/g)).toHaveLength(5)
    expect(migration.match(/perform private\.consume_training_mutation_budget\(/g)).toHaveLength(5)
    expect(migration).toContain("operation in ('publish_workout','complete_workout','assign_anamnesis','submit_anamnesis','create_note')")
  })

  it('ties private notes to consent and exposes an owner-only retention hook', () => {
    expect(migration).toContain('consent_event_id, consent_policy_version, idempotency_key, request_fingerprint')
    expect(migration).toContain('private.current_training_health_consent_evidence(resolved_workspace_id, p_student_user_id)')
    expect(migration).toContain('create or replace function private.redact_training_subject_payloads')
    expect(migration).toContain("set answers = '{}'::jsonb")
    expect(migration).toContain("set note = '[conteúdo removido por retenção]'")
    expect(migration).toContain('revoke all on function private.redact_training_subject_payloads(uuid, uuid, text) from public, anon, authenticated;')
  })

  it('keeps direct writes unavailable to authenticated clients', () => {
    expect(migration).toContain('revoke all on public.workout_versions, public.workout_completion_events, public.anamnesis_assignments,')
    expect(migration).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.(?:workout_versions|workout_completion_events|anamnesis_assignments|anamnesis_submissions|trainer_student_notes)/i)
  })
})
