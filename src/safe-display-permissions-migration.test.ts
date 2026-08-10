import { describe, expect, it } from 'vitest'
import migration from '../supabase/migrations/20260807261000_authenticated_safe_display_checks.sql?raw'

describe('safe display permissions migration contract', () => {
  it('allows authenticated DML to evaluate the text CHECK without exposing the JSON validator', () => {
    expect(migration).toContain(
      'grant execute on function private.has_unsafe_display_characters(text, boolean)',
    )
    expect(migration).toContain('to authenticated')
    expect(migration).not.toContain('jsonb_has_unsafe_display_characters')
    expect(migration).not.toContain('to anon')
    expect(migration).not.toContain('to public')
  })
})
