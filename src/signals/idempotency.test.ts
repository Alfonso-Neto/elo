import { describe, expect, it } from 'vitest'
import { SignalDomainError, toSignalDomainError } from './errors'
import { createIdempotencyKey, idempotencyKeyPattern } from './idempotency'

describe('signal idempotency', () => {
  it('builds a database-compatible key from a cryptographic UUID source', () => {
    const source = {
      randomUUID: () => 'e1f2a3b4-5c6d-47e8-9f01-23456789abcd',
    } as Pick<Crypto, 'randomUUID'>

    const key = createIdempotencyKey('pain-report', source)

    expect(key).toBe('pain-report:e1f2a3b4-5c6d-47e8-9f01-23456789abcd')
    expect(key.length).toBeGreaterThanOrEqual(16)
    expect(idempotencyKeyPattern.test(key)).toBe(true)
  })

  it('never falls back to non-cryptographic randomness', () => {
    expect(() => createIdempotencyKey('pain-report', null)).toThrow(SignalDomainError)
    expect(() => createIdempotencyKey('invalid prefix!', {
      randomUUID: () => 'e1f2a3b4-5c6d-47e8-9f01-23456789abcd',
    } as Pick<Crypto, 'randomUUID'>)).toThrow(SignalDomainError)
  })
})

describe('signal access errors', () => {
  it('maps backend authorization details to a generic public error', () => {
    const error = toSignalDomainError({
      code: '42501',
      message: 'private row and workspace details that must not be exposed',
    })

    expect(error.code).toBe('access_unavailable')
    expect(error.message).toBe('Este registro não está disponível para esta conta.')
    expect(error.message).not.toContain('workspace')
    expect(error.cause).toBeUndefined()
    expect(error.stack).not.toContain('private row')
    expect(JSON.stringify(error)).not.toContain('private row')
  })
})
