import { describe, expect, it } from 'vitest'
import migration from '../supabase/migrations/20260807260000_jsonb_text_size_limits.sql?raw'

describe('JSONB text-size roll-forward migration', () => {
  it('replaces every affected validator with immutable text-byte limits', () => {
    const validators = [
      ['valid_red_flag_codes', '1024'],
      ['valid_workout_exercises', '65536'],
      ['valid_form_questions', '65536'],
      ['valid_exercise_id_array', '4096'],
      ['valid_form_answers', '131072'],
      ['valid_nutrition_meals', '65536'],
    ] as const

    for (const [name, limit] of validators) {
      const start = migration.indexOf(`create or replace function private.${name}`)
      const end = migration.indexOf('$$;', start)
      const definition = migration.slice(start, end)

      expect(start, name).toBeGreaterThan(-1)
      expect(definition, name).toContain('immutable')
      expect(definition, name).toContain("set search_path = ''")
      expect(definition, name).toContain(`octet_length(`)
      expect(definition, name).toContain(limit)
      expect(definition, name).not.toContain('pg_column_size')
      expect(migration).toContain(`revoke all on function private.${name}`)
    }
  })

  it('validates the replacement answers constraint immediately', () => {
    expect(migration).toContain('drop constraint if exists anamnesis_submissions_answers_check')
    expect(migration).toContain('add constraint anamnesis_submissions_answers_check check (')
    expect(migration).toContain("jsonb_typeof(answers) = 'object'")
    expect(migration).toContain('octet_length(answers::text) <= 131072')
    expect(migration).not.toMatch(/anamnesis_submissions_answers_check[\s\S]*?not valid/i)
  })

  it('transactionally revalidates every function-backed CHECK against existing rows', () => {
    expect(migration).toContain('lock table public.pain_reports,')
    expect(migration).toContain('in share row exclusive mode;')

    const preflights = [
      'public.pain_reports\n    where not private.valid_red_flag_codes(red_flags)',
      'public.workout_versions\n    where not private.valid_workout_exercises(exercises)',
      'public.workout_completion_events\n    where not private.valid_exercise_id_array(completed_exercise_ids)',
      'public.anamnesis_assignments\n    where not private.valid_form_questions(questions)',
      'public.nutrition_plan_versions\n    where redacted_at is null\n      and not private.valid_nutrition_meals(meals)',
    ]

    for (const preflight of preflights) {
      expect(migration).toContain(preflight)
    }
    expect(migration.match(/errcode = '23514'/g)).toHaveLength(5)
  })

  it('replaces the RPC precheck without weakening its security boundary', () => {
    const start = migration.indexOf('create or replace function public.submit_anamnesis')
    const end = migration.indexOf('$$;', start)
    const definition = migration.slice(start, end)

    expect(definition).toContain('security definer')
    expect(definition).toContain("set search_path = ''")
    expect(definition).toContain('octet_length(p_answers::text) > 131072')
    expect(definition).not.toContain('pg_column_size')
    expect(migration).toContain('revoke all on function public.submit_anamnesis(uuid, jsonb, text) from public, anon;')
    expect(migration).toContain('grant execute on function public.submit_anamnesis(uuid, jsonb, text) to authenticated;')
  })

  it('contains no active internal-storage JSONB size checks', () => {
    expect(migration).not.toContain('pg_column_size')
    expect(migration.match(/octet_length\([^)]*::text\)/g)).toHaveLength(8)
  })
})
