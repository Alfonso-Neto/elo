import { describe, expect, it } from 'vitest'
import { hasUnsafeDisplayCharacters } from './safe-text'

describe('safe display text', () => {
  it('rejects controls, invisible separators, and bidirectional overrides', () => {
    expect(hasUnsafeDisplayCharacters('texto\u0000oculto')).toBe(true)
    expect(hasUnsafeDisplayCharacters('texto\u200boculto')).toBe(true)
    expect(hasUnsafeDisplayCharacters('texto\u202Eenganoso')).toBe(true)
  })

  it('allows ordinary Unicode and only permits line breaks in multiline fields', () => {
    expect(hasUnsafeDisplayCharacters('João · mobilidade')).toBe(false)
    expect(hasUnsafeDisplayCharacters('linha 1\nlinha 2')).toBe(true)
    expect(hasUnsafeDisplayCharacters('linha 1\nlinha 2', true)).toBe(false)
  })
})
