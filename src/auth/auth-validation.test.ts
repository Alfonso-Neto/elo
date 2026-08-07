import { describe, expect, it } from 'vitest'
import { validatePasswordReset, validateRegistration } from './auth-validation'

describe('auth validation', () => {
  it('requires 12-character matching passwords and trainer credentials', () => {
    const errors = validateRegistration({
      role: 'trainer', displayName: 'Ana Lima', email: 'ana@example.com', password: 'curta', confirmation: 'outra',
      crefNumber: '', crefState: '', studioName: '', acceptedTerms: true,
    })
    expect(errors.password).toMatch(/12 caracteres/i)
    expect(errors.confirmation).toMatch(/iguais/i)
    expect(errors.crefNumber).toBeTruthy()
    expect(errors.crefState).toBeTruthy()
  })

  it('accepts a valid student identity without trainer fields', () => {
    expect(validateRegistration({
      role: 'student', displayName: 'Marina Costa', email: 'marina@example.com', password: 'uma-senha-segura', confirmation: 'uma-senha-segura',
      crefNumber: '', crefState: '', studioName: '', acceptedTerms: true,
    })).toEqual({})
  })

  it('rejects a mismatched password reset', () => {
    expect(validatePasswordReset('uma-senha-segura', 'uma-senha-diferente').confirmation).toBeTruthy()
  })
})
