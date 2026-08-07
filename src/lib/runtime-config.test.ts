import { describe, expect, it } from 'vitest'
import { validatePublicSupabaseConfig } from './runtime-config'

describe('public Supabase configuration', () => {
  it('supports an intentionally unconfigured local checkout', () => {
    expect(validatePublicSupabaseConfig()).toMatchObject({ configured: false, issue: null })
  })

  it('accepts HTTPS and local Supabase projects', () => {
    expect(validatePublicSupabaseConfig('https://example.supabase.co', `sb_publishable_${'a'.repeat(24)}`).configured).toBe(true)
    expect(validatePublicSupabaseConfig('http://127.0.0.1:54321', `eyJ${'a'.repeat(30)}`).configured).toBe(true)
  })

  it('fails closed for partial, insecure or secret configuration', () => {
    expect(validatePublicSupabaseConfig('https://example.supabase.co')).toMatchObject({ configured: false })
    expect(validatePublicSupabaseConfig('http://example.com', `eyJ${'a'.repeat(30)}`)).toMatchObject({ configured: false })
    expect(validatePublicSupabaseConfig('https://example.supabase.co', `sb_secret_${'a'.repeat(24)}`)).toMatchObject({ configured: false, publishableKey: '' })
  })
})
