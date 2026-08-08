import { describe, expect, it } from 'vitest'
import { normalizeCreateSlotCommand, normalizeSafeText, parsePageOptions } from './validation'

const key = 'slot:e1f2a3b4-5c6d-47e8-9f01-23456789abcd'

describe('operations validation', () => {
  it('normalizes bounded schedule fields without changing the caller key', () => {
    const now = Date.parse('2026-08-07T12:00:00.000Z')
    expect(normalizeCreateSlotCommand({
      idempotencyKey: key,
      startAt: '2026-08-07T14:00:00-03:00',
      durationMinutes: 45,
      mode: 'group',
      place: '  Parque   central  ',
      capacity: 8,
    }, now)).toEqual({
      idempotencyKey: key,
      startAt: '2026-08-07T17:00:00.000Z',
      durationMinutes: 45,
      mode: 'group',
      place: 'Parque central',
      capacity: 8,
    })
  })

  it('rejects out-of-window times and bounded numeric fields', () => {
    const now = Date.parse('2026-08-07T12:00:00.000Z')
    const base = {
      idempotencyKey: key,
      startAt: '2026-08-07T14:00:00.000Z',
      durationMinutes: 60,
      mode: 'online' as const,
      place: 'Sala virtual',
      capacity: 1,
    }
    expect(() => normalizeCreateSlotCommand({ ...base, startAt: '2026-08-07T12:04:59.000Z' }, now)).toThrow()
    expect(() => normalizeCreateSlotCommand({ ...base, durationMinutes: 241 }, now)).toThrow()
    expect(() => normalizeCreateSlotCommand({ ...base, capacity: 0 }, now)).toThrow()
  })

  it('rejects control characters and raw oversized input even when trimming could shorten it', () => {
    expect(() => normalizeSafeText('olá\nmundo', 'body', 1000)).toThrow()
    expect(() => normalizeSafeText(` ${'x'.repeat(1000)} `, 'body', 1000)).toThrow()
  })

  it('uses bounded offset pagination', () => {
    expect(parsePageOptions()).toEqual({ limit: 25, offset: 0 })
    expect(parsePageOptions({ limit: 50, offset: 100_000 })).toEqual({ limit: 50, offset: 100_000 })
    expect(() => parsePageOptions({ offset: 100_001 })).toThrow()
  })
})
