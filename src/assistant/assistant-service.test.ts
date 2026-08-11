import { describe, expect, it, vi } from 'vitest'
import { AssistantServiceError, createAssistantService, type AssistantBoundary, type AssistantProposal } from './assistant-service'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const studentId = '22222222-2222-4222-8222-222222222222'
const reportId = '33333333-3333-4333-8333-333333333333'
const proposalId = '44444444-4444-4444-8444-444444444444'
const runId = '55555555-5555-4555-8555-555555555555'
const key = 'ai-assistant:66666666-6666-4666-8666-666666666666'

const proposal: AssistantProposal = {
  summary: 'Proposta para revisão do professor — nenhuma alteração foi aplicada.',
  urgency: 'soon',
  red_flags: [],
  questions: [{ id: 'q1', question: 'A dor permaneceu?', reason: 'Define o próximo passo.', answer_type: 'yes_no' }],
  rationale: ['O sinal veio do relato estruturado.'],
  workout_changes: [{ operation: 'reduce_load_percent', target: 'Leg press', value_number: 20, value_text: null, duration_sessions: 2, guardrail: 'Interromper se piorar.' }],
  sources: [{ kind: 'user_report', label: 'Relato atual' }],
  uncertainties: ['Não houve avaliação presencial.'],
  disclaimer: 'Conteúdo informativo, sem diagnóstico, que não substitui avaliação profissional.',
}

function boundaryWith(data: unknown, error: unknown = null) {
  const invoke = vi.fn(async () => ({ data, error }))
  const rpc = vi.fn(async () => ({ data: '77777777-7777-4777-8777-777777777777', error: null }))
  return { boundary: { invoke, rpc } satisfies AssistantBoundary, invoke, rpc }
}

describe('assistant client boundary', () => {
  it('sends only authoritative pain identifiers and the stable retry key', async () => {
    const { boundary, invoke } = boundaryWith({ run_id: runId, proposal_id: proposalId, completion_mode: 'model', proposal })
    const service = createAssistantService(boundary)
    await expect(service.requestPainTriage({ workspaceId, studentId, painReportId: reportId, idempotencyKey: key })).resolves.toMatchObject({ state: 'complete', proposalId })
    expect(invoke).toHaveBeenCalledWith({ kind: 'pain_triage', workspace_id: workspaceId, subject_student_id: studentId, pain_report_id: reportId, locale: 'pt-BR' }, key)
  })

  it('recognizes an idempotent in-progress response without inventing a proposal', async () => {
    const { boundary } = boundaryWith({ run_id: runId, state: 'processing', reused: true })
    await expect(createAssistantService(boundary).requestPainTriage({ workspaceId, studentId, painReportId: reportId, idempotencyKey: key })).resolves.toEqual({ state: 'processing', runId })
  })

  it('fails closed on malformed model output', async () => {
    const { boundary } = boundaryWith({ run_id: runId, proposal_id: proposalId, completion_mode: 'model', proposal: { ...proposal, workout_changes: [{ operation: 'publish_workout' }] } })
    await expect(createAssistantService(boundary).requestPainTriage({ workspaceId, studentId, painReportId: reportId, idempotencyKey: key })).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('rejects out-of-range or semantically inconsistent workout changes', async () => {
    const invalidChanges = [
      { ...proposal.workout_changes[0], value_number: 90 },
      { ...proposal.workout_changes[0], operation: 'replace_exercise', value_number: null, value_text: null },
      { ...proposal.workout_changes[0], operation: 'pause_session', value_number: 1 },
    ]
    for (const workoutChange of invalidChanges) {
      const { boundary } = boundaryWith({ run_id: runId, proposal_id: proposalId, completion_mode: 'model', proposal: { ...proposal, workout_changes: [workoutChange] } })
      await expect(createAssistantService(boundary).requestPainTriage({ workspaceId, studentId, painReportId: reportId, idempotencyKey: key })).rejects.toMatchObject({ code: 'unavailable' })
    }
  })

  it('rejects unexpected fields at the proposal boundary', async () => {
    const { boundary } = boundaryWith({ run_id: runId, proposal_id: proposalId, completion_mode: 'model', proposal: { ...proposal, hidden_instruction: 'publish automatically' } })
    await expect(createAssistantService(boundary).requestPainTriage({ workspaceId, studentId, painReportId: reportId, idempotencyKey: key })).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('rejects duplicated identifiers, invisible text, and unsafe red-flag combinations', async () => {
    const invalidProposals = [
      { ...proposal, questions: [proposal.questions[0], proposal.questions[0]] },
      { ...proposal, summary: 'Resumo\u202einvisível' },
      {
        ...proposal,
        urgency: 'emergency',
        red_flags: [{ code: 'neurological', label: 'Sinal', evidence: 'Relato', recommended_action: 'Interromper' }],
      },
    ]
    for (const invalidProposal of invalidProposals) {
      const { boundary } = boundaryWith({ run_id: runId, proposal_id: proposalId, completion_mode: 'model', proposal: invalidProposal })
      await expect(createAssistantService(boundary).requestPainTriage({ workspaceId, studentId, painReportId: reportId, idempotencyKey: key }))
        .rejects.toMatchObject({ code: 'unavailable' })
    }
  })

  it('maps remote errors without retaining sensitive causes', async () => {
    const { boundary } = boundaryWith(null, { context: { status: 403 }, message: 'private workspace id' })
    let caught: unknown
    try {
      await createAssistantService(boundary).requestPainTriage({ workspaceId, studentId, painReportId: reportId, idempotencyKey: key })
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({ code: 'access' })
    const error = caught as AssistantServiceError
    expect(error.cause).toBeUndefined()
    expect(JSON.stringify(error)).not.toContain('private workspace id')
  })

  it('records only an explicit human decision and never publishes a workout', async () => {
    const { boundary, rpc } = boundaryWith(null)
    await createAssistantService(boundary).decideProposal({ proposalId, decision: 'accepted', note: 'Revisado; vou editar a carga.' })
    expect(rpc).toHaveBeenCalledWith('decide_ai_proposal', { p_proposal_id: proposalId, p_decision: 'accepted', p_note: 'Revisado; vou editar a carga.' })
  })

  it('bounds and normalizes trainer context before invoking the model boundary', async () => {
    const { boundary, invoke } = boundaryWith({ run_id: runId, proposal_id: proposalId, completion_mode: 'model', proposal })
    const service = createAssistantService(boundary)
    await service.requestTrainerCopilot({
      workspaceId,
      studentId,
      report: '  Dor relatada no movimento.  ',
      context: { training_goal: '  Retorno gradual  ', current_workout: [{ exercise: '  Leg press  ', sets: 3, reps: ' 10 ', load: ' 60 kg ' }] },
      idempotencyKey: key,
    })
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      report: 'Dor relatada no movimento.',
      context: { training_goal: 'Retorno gradual', current_workout: [{ exercise: 'Leg press', sets: 3, reps: '10', load: '60 kg' }] },
    }), key)
    await expect(service.requestTrainerCopilot({
      workspaceId,
      studentId,
      report: 'Dor relatada no movimento.',
      context: { current_workout: [{ exercise: 'Leg press', sets: 999, reps: '10' }] },
      idempotencyKey: key,
    })).rejects.toMatchObject({ code: 'validation' })
  })

  it('requests bounded form gaps and refuses any automatic workout action', async () => {
    const formProposal: AssistantProposal = {
      ...proposal,
      urgency: 'routine',
      questions: [{ id: 'sleep', question: 'Como está a qualidade do seu sono?', reason: 'Ajuda a contextualizar recuperação.', answer_type: 'scale_0_10' }],
      workout_changes: [],
    }
    const { boundary, invoke } = boundaryWith({ run_id: runId, proposal_id: proposalId, completion_mode: 'model', proposal: formProposal })
    const service = createAssistantService(boundary)
    await expect(service.requestFormQuestionSuggestions({
      workspaceId,
      studentId,
      title: '  Contexto inicial  ',
      existingQuestions: ['  Qual é seu objetivo principal?  '],
      idempotencyKey: key,
    })).resolves.toMatchObject({ state: 'complete', proposalId })
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'trainer_copilot',
      report: expect.stringContaining('FORM_BUILDER_CONTEXT_V1'),
      context: expect.objectContaining({ constraints: expect.arrayContaining(['Não sugerir nem aplicar mudanças de treino.']) }),
    }), key)

    const unsafe = boundaryWith({ run_id: runId, proposal_id: proposalId, completion_mode: 'model', proposal })
    await expect(createAssistantService(unsafe.boundary).requestFormQuestionSuggestions({
      workspaceId,
      studentId,
      title: 'Contexto inicial',
      existingQuestions: [],
      idempotencyKey: key,
    })).rejects.toMatchObject({ code: 'unavailable' })
  })
})
