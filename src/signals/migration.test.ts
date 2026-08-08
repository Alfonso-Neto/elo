import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/20260807253000_pain_report_lifecycle.sql?raw'

describe('pain report lifecycle migration static safety contract', () => {
  it('enforces one acknowledgement and one terminal resolution per report', () => {
    expect(migration).toContain('create unique index pain_report_events_one_acknowledgement_idx')
    expect(migration).toContain("where action = 'acknowledged'::public.pain_report_action")
    expect(migration).toContain('create unique index pain_report_events_one_resolution_idx')
    expect(migration).toContain("where action = 'resolved'::public.pain_report_action")
    expect(migration).toContain('for update of report')
    expect(migration).toContain("errcode = '55000', message = 'pain report is already resolved'")
  })

  it('replays an identical key before mutable authority and lifecycle checks', () => {
    const actionFunction = migration.match(
      /create or replace function private\.record_pain_report_action[\s\S]*?drop policy if exists pain_reports_read_scoped/,
    )?.[0] ?? ''
    const replay = actionFunction.indexOf('if found then')
    const reportLock = actionFunction.indexOf('for update of report')
    const professionalGate = actionFunction.indexOf('private.is_training_professional(caller_id, target_workspace_id)')
    const consentGate = actionFunction.indexOf('private.has_current_health_processing_consent(')
    const terminalGate = actionFunction.indexOf("message = 'pain report is already resolved'")

    expect(replay).toBeGreaterThan(-1)
    expect(reportLock).toBeGreaterThan(replay)
    expect(professionalGate).toBeGreaterThan(reportLock)
    expect(consentGate).toBeGreaterThan(professionalGate)
    expect(terminalGate).toBeGreaterThan(consentGate)
    expect(actionFunction).toContain('existing_fingerprint is distinct from fingerprint')
  })

  it('replaces weak pain RLS with verified-professional and current-consent policies', () => {
    expect(migration).toContain('drop policy if exists pain_reports_read_scoped')
    expect(migration).toContain('drop policy if exists pain_report_events_read_scoped')
    expect(migration).toContain('drop policy if exists pain_report_events_insert_trainer')
    expect(migration.match(/private\.can_read_current_training_health\(workspace_id, student_user_id\)/g)).toHaveLength(3)
    expect(migration).not.toContain('private.is_workspace_trainer')
  })

  it('derives a verified professional scope and filters unresolved rows before pagination', () => {
    expect(migration).toContain('create or replace function public.list_trainer_pain_reports(')
    expect(migration).toContain('p_workspace_id uuid')
    expect(migration).toContain('p_student_user_id uuid default null')
    expect(migration).toContain('caller_id uuid := (select auth.uid())')
    expect(migration).toContain('private.is_training_professional(caller_id, p_workspace_id)')
    expect(migration).toContain('private.can_read_current_training_health(')

    const listFunction = migration.match(
      /create or replace function public\.list_trainer_pain_reports[\s\S]*?-- Reads remain RLS-scoped/,
    )?.[0] ?? ''
    expect(listFunction.indexOf('and (not p_only_unresolved or resolution.id is null)'))
      .toBeLessThan(listFunction.indexOf('limit (p_limit + 1)'))
    expect(listFunction).toContain('resolution.note')
    expect(listFunction).toContain('resolution_note text')
    expect(listFunction).not.toContain('report.detail')
    expect(listFunction).toContain('(p_student_user_id is null or report.student_user_id = p_student_user_id)')
    expect(listFunction).toContain('limit (p_limit + 1)')
  })

  it('validates bounded inputs, exposes only authenticated RPCs, and grants no writes', () => {
    expect(migration).toContain('p_limit not between 1 and 50')
    expect(migration).toContain('p_offset not between 0 and 100000')
    expect(migration).toContain('private.valid_training_idempotency_key(p_idempotency_key)')
    expect(migration).toContain('revoke insert, update, delete on public.pain_reports from authenticated')
    expect(migration).toContain('revoke insert, update, delete on public.pain_report_events from authenticated')
    expect(migration).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.pain_report/i)
    expect(migration).toContain('grant execute on function public.list_trainer_pain_reports(uuid, uuid, boolean, integer, integer)')
  })
})
