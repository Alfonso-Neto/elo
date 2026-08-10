import { describe, expect, it } from 'vitest'
import migration from '../supabase/migrations/20260807255000_safe_display_text.sql?raw'

describe('safe display text migration contract', () => {
  it('rejects controls, invisible separators, and bidirectional formatting at the database boundary', () => {
    expect(migration).toContain("~ '[[:cntrl:]]'")
    expect(migration).toContain("U&'[\\200B-\\200F\\202A-\\202E\\2060-\\206F\\FEFF]'")
    expect(migration).toContain('immutable')
    expect(migration).toContain("translate(value, chr(9) || chr(10) || chr(13), '')")
    expect(migration).toContain('private.jsonb_has_unsafe_display_characters')
    expect(migration).toContain('jsonb_array_elements(input_value)')
    expect(migration).toContain('jsonb_each(input_value)')
    expect(migration).toContain("input_value #>> '{}'")
    expect(migration).not.toContain('exercises::text')
    expect(migration).not.toContain('questions::text')
    expect(migration).not.toContain('answers::text')
  })

  it('covers identity and every user-visible sensitive domain', () => {
    for (const table of [
      'profiles', 'workspaces', 'trainer_profiles', 'pain_reports', 'pain_report_events',
      'workout_versions', 'workout_completion_events', 'anamnesis_assignments',
      'anamnesis_submissions', 'trainer_student_notes', 'schedule_slots', 'thread_messages',
      'nutrition_plan_versions', 'ai_proposals', 'ai_proposal_decisions',
    ]) expect(migration).toContain(`alter table public.${table}`)
  })
})
