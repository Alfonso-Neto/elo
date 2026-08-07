import { requireSupabase } from '../lib/supabase'
import { idempotencyKeyPattern } from '../signals'

export const assistantUrgencies = ['routine', 'soon', 'urgent', 'emergency'] as const
export type AssistantUrgency = (typeof assistantUrgencies)[number]

export const assistantWorkoutOperations = [
  'reduce_load_percent', 'reduce_volume_percent', 'replace_exercise', 'remove_exercise',
  'add_rest_seconds', 'cap_rpe', 'pause_session', 'request_professional_review',
] as const

export type AssistantProposal = {
  summary: string
  urgency: AssistantUrgency
  red_flags: Array<{ code: string; label: string; evidence: string; recommended_action: string }>
  questions: Array<{ id: string; question: string; reason: string; answer_type: 'yes_no' | 'scale_0_10' | 'short_text' }>
  rationale: string[]
  workout_changes: Array<{
    operation: (typeof assistantWorkoutOperations)[number]
    target: string | null
    value_number: number | null
    value_text: string | null
    duration_sessions: number | null
    guardrail: string
  }>
  sources: Array<{ kind: 'user_report' | 'workspace_context' | 'safety_protocol'; label: string }>
  uncertainties: string[]
  disclaimer: string
}

export type AssistantResult =
  | { state: 'processing'; runId: string }
  | {
    state: 'complete'
    runId: string
    proposalId: string
    completionMode: 'model' | 'deterministic_safety'
    reused: boolean
    proposal: AssistantProposal
  }

export type TrainerCopilotContext = {
  training_goal?: string
  recent_feedback?: string[]
  constraints?: string[]
  current_workout?: Array<{ exercise: string; sets: number; reps: string; load?: string; rpe?: number }>
}

export type AssistantBoundary = {
  invoke: (body: Record<string, unknown>, idempotencyKey: string) => Promise<{ data: unknown; error: unknown }>
  rpc: (name: string, arguments_: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const text = (value: unknown, min: number, max: number): value is string => typeof value === 'string' && value.trim().length >= min && value.length <= max
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const stringArray = (value: unknown, maxItems: number, maxLength: number): value is string[] => Array.isArray(value) && value.length <= maxItems && value.every((item) => text(item, 1, maxLength))
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

const defaultBoundary: AssistantBoundary = {
  async invoke(body, idempotencyKey) {
    const { data, error } = await requireSupabase().functions.invoke('assistant-triage', {
      body,
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return { data, error }
  },
  async rpc(name, arguments_) {
    const { data, error } = await requireSupabase().rpc(name, arguments_)
    return { data, error }
  },
}

export type AssistantErrorCode = 'validation' | 'access' | 'conflict' | 'rate_limited' | 'unavailable'

const errorMessages: Record<AssistantErrorCode, string> = {
  validation: 'Revise os dados do contexto e tente novamente.',
  access: 'Este contexto não está disponível para esta conta.',
  conflict: 'O pedido mudou durante uma tentativa anterior. Crie uma nova análise.',
  rate_limited: 'O limite temporário do copiloto foi atingido. Aguarde alguns minutos.',
  unavailable: 'O copiloto está indisponível agora. O dado original continua salvo.',
}

export class AssistantServiceError extends Error {
  constructor(readonly code: AssistantErrorCode) {
    super(errorMessages[code])
    this.name = 'AssistantServiceError'
  }
}

function statusFrom(error: unknown) {
  if (!record(error)) return null
  if (typeof error.status === 'number') return error.status
  if (record(error.context) && typeof error.context.status === 'number') return error.context.status
  return null
}

function mapBoundaryError(error: unknown) {
  const status = statusFrom(error)
  if (status === 401 || status === 403) return new AssistantServiceError('access')
  if (status === 409) return new AssistantServiceError('conflict')
  if (status === 429) return new AssistantServiceError('rate_limited')
  return new AssistantServiceError('unavailable')
}

function assertUuid(value: string) {
  if (!uuidPattern.test(value)) throw new AssistantServiceError('validation')
}

function assertCommand(workspaceId: string, studentId: string, idempotencyKey: string) {
  assertUuid(workspaceId)
  assertUuid(studentId)
  if (!idempotencyKeyPattern.test(idempotencyKey)) throw new AssistantServiceError('validation')
}

function normalizeTrainerContext(value: TrainerCopilotContext): TrainerCopilotContext {
  if (!record(value) || Object.keys(value).some((key) => !['training_goal', 'recent_feedback', 'constraints', 'current_workout'].includes(key))) throw new AssistantServiceError('validation')
  const result: TrainerCopilotContext = {}
  if (value.training_goal !== undefined) {
    if (!text(value.training_goal, 1, 500)) throw new AssistantServiceError('validation')
    result.training_goal = value.training_goal.trim()
  }
  if (value.recent_feedback !== undefined) {
    if (!stringArray(value.recent_feedback, 4, 300)) throw new AssistantServiceError('validation')
    result.recent_feedback = value.recent_feedback.map((item) => item.trim())
  }
  if (value.constraints !== undefined) {
    if (!stringArray(value.constraints, 8, 200)) throw new AssistantServiceError('validation')
    result.constraints = value.constraints.map((item) => item.trim())
  }
  if (value.current_workout !== undefined) {
    if (!Array.isArray(value.current_workout) || value.current_workout.length > 20) throw new AssistantServiceError('validation')
    result.current_workout = value.current_workout.map((item) => {
      if (!record(item) || Object.keys(item).some((key) => !['exercise', 'sets', 'reps', 'load', 'rpe'].includes(key))) throw new AssistantServiceError('validation')
      if (!text(item.exercise, 1, 120) || !Number.isInteger(item.sets) || item.sets < 1 || item.sets > 20 || !text(item.reps, 1, 40)) throw new AssistantServiceError('validation')
      if (item.load !== undefined && !text(item.load, 1, 40)) throw new AssistantServiceError('validation')
      if (item.rpe !== undefined && (typeof item.rpe !== 'number' || !Number.isFinite(item.rpe) || item.rpe < 0 || item.rpe > 10)) throw new AssistantServiceError('validation')
      return { exercise: item.exercise.trim(), sets: item.sets, reps: item.reps.trim(), ...(item.load === undefined ? {} : { load: item.load.trim() }), ...(item.rpe === undefined ? {} : { rpe: item.rpe }) }
    })
  }
  return result
}

function isNullableText(value: unknown, max: number) {
  return value === null || text(value, 1, max)
}

function validWorkoutChange(value: unknown) {
  if (!record(value) || !exactKeys(value, ['operation', 'target', 'value_number', 'value_text', 'duration_sessions', 'guardrail'])) return false
  if (!assistantWorkoutOperations.includes(value.operation as (typeof assistantWorkoutOperations)[number])) return false
  if (!isNullableText(value.target, 120) || !isNullableText(value.value_text, 160) || !text(value.guardrail, 1, 240)) return false
  if (value.value_number !== null && (typeof value.value_number !== 'number' || !Number.isFinite(value.value_number))) return false
  if (value.duration_sessions !== null && (!Number.isInteger(value.duration_sessions) || Number(value.duration_sessions) < 1 || Number(value.duration_sessions) > 4)) return false

  if (value.operation === 'reduce_load_percent' || value.operation === 'reduce_volume_percent') {
    return value.value_text === null && typeof value.value_number === 'number' && value.value_number >= 5 && value.value_number <= 50
  }
  if (value.operation === 'add_rest_seconds') {
    return value.value_text === null && typeof value.value_number === 'number' && value.value_number >= 15 && value.value_number <= 180
  }
  if (value.operation === 'cap_rpe') {
    return value.value_text === null && typeof value.value_number === 'number' && value.value_number >= 1 && value.value_number <= 10
  }
  if (value.operation === 'replace_exercise') {
    return value.target !== null && value.value_text !== null && value.value_number === null
  }
  if (value.operation === 'remove_exercise') {
    return value.target !== null && value.value_text === null && value.value_number === null
  }
  return value.value_text === null && value.value_number === null
}

export function parseAssistantProposal(value: unknown): AssistantProposal | null {
  if (!record(value) || !exactKeys(value, ['summary', 'urgency', 'red_flags', 'questions', 'rationale', 'workout_changes', 'sources', 'uncertainties', 'disclaimer'])) return null
  if (!text(value.summary, 1, 1000) || !assistantUrgencies.includes(value.urgency as AssistantUrgency)) return null
  if (!text(value.disclaimer, 20, 1000) || !stringArray(value.rationale, 8, 500) || !stringArray(value.uncertainties, 8, 500)) return null
  if (!Array.isArray(value.red_flags) || value.red_flags.length > 6 || !value.red_flags.every((item) => record(item) && exactKeys(item, ['code', 'label', 'evidence', 'recommended_action']) && text(item.code, 1, 48) && text(item.label, 1, 160) && text(item.evidence, 1, 300) && text(item.recommended_action, 1, 300))) return null
  if (!Array.isArray(value.questions) || value.questions.length > 8 || !value.questions.every((item) => record(item) && exactKeys(item, ['id', 'question', 'reason', 'answer_type']) && text(item.id, 1, 48) && text(item.question, 1, 300) && text(item.reason, 1, 300) && ['yes_no', 'scale_0_10', 'short_text'].includes(String(item.answer_type)))) return null
  if (!Array.isArray(value.sources) || value.sources.length > 8 || !value.sources.every((item) => record(item) && exactKeys(item, ['kind', 'label']) && ['user_report', 'workspace_context', 'safety_protocol'].includes(String(item.kind)) && text(item.label, 1, 240))) return null
  if (!Array.isArray(value.workout_changes) || value.workout_changes.length > 8 || !value.workout_changes.every(validWorkoutChange)) return null
  return value as AssistantProposal
}

function parseResult(data: unknown): AssistantResult {
  if (!record(data) || typeof data.run_id !== 'string' || !uuidPattern.test(data.run_id)) throw new AssistantServiceError('unavailable')
  if (data.state === 'processing') return { state: 'processing', runId: data.run_id }
  if (typeof data.proposal_id !== 'string' || !uuidPattern.test(data.proposal_id) || !['model', 'deterministic_safety'].includes(String(data.completion_mode))) {
    throw new AssistantServiceError('unavailable')
  }
  const proposal = parseAssistantProposal(data.proposal)
  if (!proposal) throw new AssistantServiceError('unavailable')
  return {
    state: 'complete',
    runId: data.run_id,
    proposalId: data.proposal_id,
    completionMode: data.completion_mode as 'model' | 'deterministic_safety',
    reused: data.reused === true,
    proposal,
  }
}

export function createAssistantService(boundary: AssistantBoundary = defaultBoundary) {
  async function invoke(body: Record<string, unknown>, idempotencyKey: string) {
    const result = await boundary.invoke(body, idempotencyKey).catch(() => { throw new AssistantServiceError('unavailable') })
    if (result.error) throw mapBoundaryError(result.error)
    return parseResult(result.data)
  }

  async function requestPainTriage(command: { workspaceId: string; studentId: string; painReportId: string; idempotencyKey: string }) {
    assertCommand(command.workspaceId, command.studentId, command.idempotencyKey)
    assertUuid(command.painReportId)
    return invoke({
      kind: 'pain_triage', workspace_id: command.workspaceId, subject_student_id: command.studentId,
      pain_report_id: command.painReportId, locale: 'pt-BR',
    }, command.idempotencyKey)
  }

  async function requestTrainerCopilot(command: { workspaceId: string; studentId: string; report: string; context: TrainerCopilotContext; idempotencyKey: string }) {
    assertCommand(command.workspaceId, command.studentId, command.idempotencyKey)
    if (!text(command.report, 3, 2000)) throw new AssistantServiceError('validation')
    const context = normalizeTrainerContext(command.context)
    return invoke({
      kind: 'trainer_copilot', workspace_id: command.workspaceId, subject_student_id: command.studentId,
      report: command.report.trim(), context, locale: 'pt-BR',
    }, command.idempotencyKey)
  }

  async function decideProposal(command: { proposalId: string; decision: 'accepted' | 'rejected' | 'dismissed'; note?: string }) {
    assertUuid(command.proposalId)
    const note = command.note?.trim() || null
    if (note && note.length > 500) throw new AssistantServiceError('validation')
    const result = await boundary.rpc('decide_ai_proposal', { p_proposal_id: command.proposalId, p_decision: command.decision, p_note: note }).catch(() => { throw new AssistantServiceError('unavailable') })
    if (result.error) throw mapBoundaryError(result.error)
    if (typeof result.data !== 'string' || !uuidPattern.test(result.data)) throw new AssistantServiceError('unavailable')
    return result.data
  }

  return { requestPainTriage, requestTrainerCopilot, decideProposal }
}
