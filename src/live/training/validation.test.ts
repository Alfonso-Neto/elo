import { describe, expect, it } from 'vitest'
import type { FormQuestion } from '../../types'
import { isUuid, validateAnswers, validateExercises, validateQuestions } from './validation'

describe('training JSON boundaries', () => {
  it('accepts generated UUIDs and rejects nil or malformed-variant identifiers', () => {
    expect(isUuid('23ccf1ec-a377-4b45-a401-11d28a8a1503')).toBe(true)
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(false)
    expect(isUuid('23ccf1ec-a377-4b45-7401-11d28a8a1503')).toBe(false)
  })

  it('requires the exact current Exercise shape', () => {
    const base = {
      id: 'ex-1', name: 'Remada baixa', muscle: 'Costas', sets: '3', reps: '12', load: '30 kg',
      rest: '60 s', tempo: '2-1-2', rir: '2', note: '',
    }
    expect(validateExercises([base])).toBe(true)
    expect(validateExercises([{ ...base, id: 'ex-1' }, { ...base, id: 'ex-1' }])).toBe(false)
    expect(validateExercises([{ ...base, serverOnly: true }])).toBe(false)
    const { rest: _rest, ...missing } = base
    expect(validateExercises([missing])).toBe(false)
  })

  it('requires strict question types, choice options, and unique identifiers', () => {
    expect(validateQuestions([{ id: 'q1', label: 'Qual é o seu objetivo?', type: 'single', options: ['Força', 'Mobilidade'], required: true }])).toBe(true)
    expect(validateQuestions([{ id: 'q1', label: 'Objetivo?', type: 'single', options: ['Força', 'Força'] }])).toBe(false)
    expect(validateQuestions([{ id: 'q1', label: 'Objetivo?', type: 'text', options: ['Não deveria existir'] }])).toBe(false)
    expect(validateQuestions([{ id: 'q1', label: 'Objetivo?', type: 'unknown' }])).toBe(false)
    expect(validateQuestions([{ id: 'q1', label: 'Objetivo\u202E?', type: 'text' }])).toBe(false)
  })

  it('matches answer values to the immutable question contract', () => {
    const questions: FormQuestion[] = [
      { id: 'short', label: 'Resposta curta', type: 'text', required: true },
      { id: 'choice', label: 'Escolha', type: 'single', options: ['A', 'B'] },
      { id: 'multi', label: 'Múltipla', type: 'multi', options: ['A', 'B', 'C'] },
      { id: 'scale', label: 'Escala', type: 'scale' },
      { id: 'yesno', label: 'Confirma?', type: 'yesno' },
      { id: 'number', label: 'Número', type: 'number' },
    ]
    expect(validateAnswers({ short: 'Ganhar força', choice: 'A', multi: ['A', 'C'], scale: '10', yesno: 'Não', number: '12,5' }, questions)).toBe(true)
    expect(validateAnswers({ choice: 'A' }, questions)).toBe(false)
    expect(validateAnswers({ short: 'x'.repeat(501) }, questions)).toBe(false)
    expect(validateAnswers({ short: 'ok', choice: 'fora da lista' }, questions)).toBe(false)
    expect(validateAnswers({ short: 'ok', multi: ['A', 'A'] }, questions)).toBe(false)
    expect(validateAnswers({ short: 'ok', scale: 4.5 }, questions)).toBe(false)
    expect(validateAnswers({ short: 'ok', unknown: 'valor' }, questions)).toBe(false)
    expect(validateAnswers({ short: 'texto\u200boculto' }, questions)).toBe(false)
    expect(validateAnswers({ short: 'ok', long: 'linha 1\nlinha 2' }, [...questions, { id: 'long', label: 'Detalhes', type: 'long' }])).toBe(true)
  })
})
