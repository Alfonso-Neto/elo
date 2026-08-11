import { describe, expect, it } from 'vitest'
import { isIsoTimestamp, parseIsoTimestamp } from './iso-timestamp'

describe('strict ISO timestamp boundary', () => {
  it('accepts valid UTC, fractional and offset timestamps', () => {
    expect(parseIsoTimestamp('2026-08-08T12:30:45Z')).toBe(Date.parse('2026-08-08T12:30:45Z'))
    expect(isIsoTimestamp('2024-02-29T23:59:59.123456-03:00')).toBe(true)
    expect(isIsoTimestamp('2026-08-08T12:30:45+14:00')).toBe(true)
  })

  it.each([
    '2026-02-29T12:00:00Z',
    '2026-02-31T12:00:00Z',
    '2026-13-01T12:00:00Z',
    '2026-08-08T24:00:00Z',
    '2026-08-08T12:60:00Z',
    '2026-08-08T12:00:60Z',
    '2026-08-08T12:00:00+24:00',
    '2026-08-08T12:00:00+14:01',
    '2026-08-08T12:00:00-15:00',
    '2026-08-08 12:00:00Z',
    '2026-08-08T12:00:00',
  ])('rejects impossible or non-contract timestamps: %s', (value) => {
    expect(parseIsoTimestamp(value)).toBeNull()
    expect(isIsoTimestamp(value)).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(parseIsoTimestamp(null)).toBeNull()
    expect(parseIsoTimestamp(0)).toBeNull()
  })
})
