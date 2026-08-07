import { describe, expect, it } from 'vitest'
import type { AssistantProposal } from '../assistant/assistant-service'
import type { PainReportSummary } from '../signals'
import type { Exercise } from '../types'
import { applyAssistantProposalToDraft, formatPainReportForAssistant } from './LiveTrainerCopilot'

const exercise: Exercise = { id: 'leg', name: 'Leg press', muscle: 'Quadríceps', sets: '4', reps: '10', load: '100 kg', rest: '60s', tempo: '2-0-2', rir: '2', note: '' }
const base: AssistantProposal = {
  summary: 'Revisar o estímulo.', urgency: 'soon', red_flags: [], questions: [], rationale: [], sources: [], uncertainties: [], disclaimer: 'Apoio sem diagnóstico e sujeito à revisão profissional.',
  workout_changes: [],
}

describe('live trainer copilot helpers', () => {
  it('creates an editable draft without mutating the published workout', () => {
    const proposal: AssistantProposal = { ...base, workout_changes: [
      { operation: 'reduce_load_percent', target: 'Leg press', value_number: 20, value_text: null, duration_sessions: 2, guardrail: 'Interromper se o sinal reaparecer.' },
      { operation: 'reduce_volume_percent', target: 'Leg press', value_number: 25, value_text: null, duration_sessions: 2, guardrail: 'Manter execução confortável.' },
      { operation: 'add_rest_seconds', target: 'Leg press', value_number: 30, value_text: null, duration_sessions: null, guardrail: 'Reavaliar resposta.' },
    ] }
    const result = applyAssistantProposalToDraft([exercise], proposal)
    expect(result[0]).toMatchObject({ load: '80 kg', sets: '3', rest: '90s', suggested: true })
    expect(result[0].note).toContain('Interromper')
    expect(exercise).toMatchObject({ load: '100 kg', sets: '4', rest: '60s', note: '' })
  })

  it('does not touch an exercise when the model target does not match', () => {
    const proposal: AssistantProposal = { ...base, workout_changes: [{ operation: 'remove_exercise', target: 'Agachamento', value_number: null, value_text: null, duration_sessions: 1, guardrail: 'Revisar.' }] }
    expect(applyAssistantProposalToDraft([exercise], proposal)).toEqual([exercise])
  })

  it('keeps pause and professional-review operations outside the workout draft', () => {
    const proposal: AssistantProposal = { ...base, workout_changes: [
      { operation: 'pause_session', target: null, value_number: null, value_text: null, duration_sessions: null, guardrail: 'Não iniciar a sessão.' },
      { operation: 'request_professional_review', target: null, value_number: null, value_text: null, duration_sessions: null, guardrail: 'Encaminhar para avaliação.' },
    ] }
    expect(applyAssistantProposalToDraft([exercise], proposal)).toEqual([exercise])
  })

  it('formats only structured report data and marks absent flags explicitly', () => {
    const report: PainReportSummary = {
      id: '33333333-3333-4333-8333-333333333333', sequence: 1, workspaceId: '11111111-1111-4111-8111-111111111111', studentUserId: '22222222-2222-4222-8222-222222222222',
      region: 'Joelho', side: 'right', movement: 'Leg press', timing: 'during_activity', intensity: 5, onset: '2026-08-07T10:00:00.000Z', redFlags: [], createdAt: '2026-08-07T10:01:00.000Z',
    }
    const result = formatPainReportForAssistant(report)
    expect(result).toContain('nenhum sinal de alerta marcado')
    expect(result).not.toContain(report.id)
    expect(result).not.toContain(report.studentUserId)
  })
})
