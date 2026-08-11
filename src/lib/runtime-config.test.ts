import { describe, expect, it } from 'vitest'
import { validatePublicSupabaseConfig } from './runtime-config'

describe('public Supabase configuration', () => {
  it('supports an intentionally unconfigured local checkout', () => {
    expect(validatePublicSupabaseConfig()).toMatchObject({ configured: false, issue: null })
  })

  it('accepts HTTPS and local Supabase projects', () => {
    expect(validatePublicSupabaseConfig('https://example.supabase.co', `sb_publishable_${'a'.repeat(24)}`).configured).toBe(true)
    expect(validatePublicSupabaseConfig('http://127.0.0.1:54321', `sb_publishable_${'b'.repeat(24)}`).configured).toBe(true)
  })

  it('fails closed for partial, insecure or secret configuration', () => {
    const legacyServiceRolePayload = btoa(JSON.stringify({ role: 'service_role' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const legacyServiceRoleKey = `eyJhbGciOiJIUzI1NiJ9.${legacyServiceRolePayload}.synthetic-signature`
    const legacyAnonPayload = btoa(JSON.stringify({ role: 'anon' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const legacyAnonKey = `eyJhbGciOiJIUzI1NiJ9.${legacyAnonPayload}.synthetic-signature`
    const userTokenPayload = btoa(JSON.stringify({ role: 'authenticated', sub: 'synthetic-user' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const userAccessToken = `eyJhbGciOiJIUzI1NiJ9.${userTokenPayload}.synthetic-signature`

    expect(validatePublicSupabaseConfig('https://example.supabase.co')).toMatchObject({ configured: false })
    expect(validatePublicSupabaseConfig('http://example.com', `eyJ${'a'.repeat(30)}`)).toMatchObject({ configured: false })
    expect(validatePublicSupabaseConfig('https://user:password@example.supabase.co', `sb_publishable_${'a'.repeat(24)}`)).toMatchObject({ configured: false })
    expect(validatePublicSupabaseConfig('https://example.supabase.co', `sb_secret_${'a'.repeat(24)}`)).toMatchObject({ configured: false, publishableKey: '' })
    expect(validatePublicSupabaseConfig('https://example.supabase.co', legacyServiceRoleKey)).toMatchObject({ configured: false, publishableKey: '' })
    expect(validatePublicSupabaseConfig('https://example.supabase.co', legacyAnonKey)).toMatchObject({ configured: false, publishableKey: '' })
    expect(validatePublicSupabaseConfig('https://example.supabase.co', userAccessToken)).toMatchObject({ configured: false, publishableKey: '' })
    expect(validatePublicSupabaseConfig('https://example.supabase.co', `opaque_${'a'.repeat(30)}`)).toMatchObject({ configured: false, publishableKey: '' })
    expect(validatePublicSupabaseConfig('https://example.supabase.co', `sb_publishable_${'a'.repeat(19)}`)).toMatchObject({ configured: false, publishableKey: '' })
  })
})
