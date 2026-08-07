import { describe, expect, it } from 'vitest'
import { SignalDomainError } from './errors'
import { detectRedFlags, mapPainReportDraft } from './mapping'

describe('pain-report mapping', () => {
  it('maps Portuguese UI labels to the constrained database payload', () => {
    const result = mapPainReportDraft({
      region: '  Joelho  ',
      side: 'Lado esquerdo',
      movement: '  Agachamento  ',
      timing: 'Durante o treino',
      intensity: '7',
      onset: '2026-08-07T12:30:00-03:00',
      detail: '   ',
      redFlagAnswers: { loss_of_strength: true, fever: false },
      redFlags: ['major_trauma'],
    }, { now: new Date('2026-08-07T16:00:00.000Z') })

    expect(result).toEqual({
      region: 'Joelho',
      side: 'left',
      movement: 'Agachamento',
      timing: 'during_activity',
      intensity: 7,
      onset: '2026-08-07T15:30:00.000Z',
      detail: null,
      redFlags: ['loss_of_strength', 'major_trauma'],
    })
  })

  it('returns field-safe validation errors without echoing health content', () => {
    let captured: unknown
    try {
      mapPainReportDraft({
        region: 'A',
        side: 'lado desconhecido',
        movement: 'Corrida',
        timing: 'quando der',
        intensity: 11,
        onset: '2026-08-08T12:00:00.000Z',
        detail: null,
        redFlags: ['unreviewed_free_text'],
      }, { now: new Date('2026-08-07T12:00:00.000Z') })
    } catch (error) {
      captured = error
    }

    expect(captured).toBeInstanceOf(SignalDomainError)
    const error = captured as SignalDomainError
    expect(error.code).toBe('validation')
    expect(error.fieldErrors).toMatchObject({
      region: expect.any(String),
      side: expect.any(String),
      timing: expect.any(String),
      intensity: expect.any(String),
      onset: expect.any(String),
      redFlags: expect.any(String),
    })
    expect(error.message).not.toContain('unreviewed_free_text')
  })

  it('detects only explicit structured red-flag answers in stable order', () => {
    expect(detectRedFlags({
      fever: true,
      chest_pain: true,
      fainting: false,
    })).toEqual({
      codes: ['chest_pain', 'fever'],
      requiresPromptEscalation: true,
    })

    expect(detectRedFlags()).toEqual({ codes: [], requiresPromptEscalation: false })
  })

  it('canonicalizes the safety questionnaire codes already used by the UI', () => {
    const result = mapPainReportDraft({
      region: 'Joelho',
      side: 'left',
      movement: 'Agachamento',
      timing: 'during_activity',
      intensity: 5,
      onset: '2026-08-07T12:00:00.000Z',
      redFlags: ['trauma', 'major_swelling', 'loss_of_motion', 'numbness_or_weakness'],
    }, { now: new Date('2026-08-07T13:00:00.000Z') })

    expect(result.redFlags).toEqual([
      'major_trauma',
      'major_swelling',
      'loss_of_motion',
      'numbness_or_weakness',
    ])
  })
})
