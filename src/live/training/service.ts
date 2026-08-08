import { requireSupabase } from '../../lib/supabase'
import type {
  AnamnesisAssignment,
  AnamnesisSubmission,
  AssignAnamnesisInput,
  CompleteWorkoutInput,
  CreateTrainerNoteInput,
  PageOptions,
  PageResult,
  PublishWorkoutInput,
  SubmitAnamnesisInput,
  TrainerStudentNote,
  TrainingScope,
  WorkoutCompletion,
  WorkoutVersion,
} from './types'
import {
  boundedString,
  isIdempotencyKey,
  isIsoTimestamp,
  isUuid,
  normalizeLimit,
  validateAnswerEnvelope,
  validateAnswers,
  validateCursor,
  validateExerciseIds,
  validateExercises,
  validateQuestions,
  validateScope,
} from './validation'

export const trainingMutationError = 'Não foi possível salvar o treino agora. Revise os dados e tente novamente.'
export const trainingReadError = 'Não foi possível carregar os treinos agora.'
export const anamnesisMutationError = 'Não foi possível salvar a anamnese agora. Revise os dados e tente novamente.'
export const anamnesisReadError = 'Não foi possível carregar as anamneses agora.'
export const trainerNoteError = 'Não foi possível salvar ou carregar a nota profissional agora.'

type RpcResult = { data: unknown; error: unknown }
type SelectResult = { data: unknown; error: unknown }

export type SelectSpec = {
  table: 'workout_versions' | 'workout_completion_events' | 'anamnesis_assignments' | 'anamnesis_submissions' | 'trainer_student_notes'
  columns: string
  equals: Record<string, string>
  orderAt: string
  limit: number
  before?: { at: string; id: string }
}

export type TrainingDataBoundary = {
  rpc: (functionName: string, arguments_: Record<string, unknown>) => Promise<RpcResult>
  select: (spec: SelectSpec) => Promise<SelectResult>
}

const supabaseBoundary: TrainingDataBoundary = {
  async rpc(functionName, arguments_) {
    const { data, error } = await requireSupabase().rpc(functionName, arguments_)
    return { data, error }
  },
  async select(spec) {
    let query = requireSupabase().from(spec.table).select(spec.columns)
    for (const [column, value] of Object.entries(spec.equals)) query = query.eq(column, value)
    if (spec.before) {
      query = query.or(`${spec.orderAt}.lt.${spec.before.at},and(${spec.orderAt}.eq.${spec.before.at},id.lt.${spec.before.id})`)
    }
    const { data, error } = await query.order(spec.orderAt, { ascending: false }).order('id', { ascending: false }).limit(spec.limit + 1)
    return { data, error }
  },
}

function rowObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function mutationId(result: RpcResult, message: string) {
  if (result.error || !isUuid(result.data)) throw new Error(message)
  return result.data
}

function requireRole(scope: TrainingScope, role: TrainingScope['role'], message: string) {
  if (!validateScope(scope) || scope.role !== role) throw new Error(message)
}

function subjectFor(scope: TrainingScope, requested: string | undefined, message: string) {
  if (!validateScope(scope)) throw new Error(message)
  if (scope.role === 'student') {
    if (requested && requested !== scope.userId) throw new Error(message)
    return scope.userId
  }
  if (!isUuid(requested)) throw new Error(message)
  return requested
}

function pageConfiguration(options: PageOptions | undefined, message: string) {
  const limit = normalizeLimit(options?.limit)
  if (limit === null || !validateCursor(options?.before)) throw new Error(message)
  return { limit, before: options?.before }
}

function pageFrom<T extends { id: string }>(items: T[], hasMore: boolean, timestamp: (item: T) => string): PageResult<T> {
  const last = items.at(-1)
  return { items, nextCursor: last && hasMore ? { at: timestamp(last), id: last.id } : null }
}

function normalizeNullableText(value: unknown, maximum: number) {
  if (value === null) return null
  return boundedString(value, 1, maximum)
}

function parseWorkout(value: unknown, scope: TrainingScope, subject: string): WorkoutVersion | null {
  const row = rowObject(value)
  if (!row
    || !isUuid(row.id)
    || row.workspace_id !== scope.workspaceId
    || row.student_user_id !== subject
    || !isUuid(row.published_by_user_id)
    || (row.published_by_role !== 'owner' && row.published_by_role !== 'trainer')
    || !Number.isSafeInteger(row.version_number) || Number(row.version_number) < 1
    || !isIsoTimestamp(row.published_at)
    || !validateExercises(row.exercises)) return null
  const title = boundedString(row.title, 2, 120)
  if (!title) return null
  return {
    id: row.id,
    workspaceId: scope.workspaceId,
    studentUserId: subject,
    publishedByUserId: row.published_by_user_id,
    publishedByRole: row.published_by_role,
    versionNumber: Number(row.version_number),
    title,
    exercises: row.exercises,
    publishedAt: row.published_at,
  }
}

function parseCompletion(value: unknown, scope: TrainingScope, subject: string): WorkoutCompletion | null {
  const row = rowObject(value)
  if (!row
    || !isUuid(row.id)
    || !isUuid(row.workout_version_id)
    || row.workspace_id !== scope.workspaceId
    || row.student_user_id !== subject
    || !Number.isInteger(row.rpe) || Number(row.rpe) < 0 || Number(row.rpe) > 10
    || !validateExerciseIds(row.completed_exercise_ids)
    || !isIsoTimestamp(row.completed_at)) return null
  const mood = boundedString(row.mood, 2, 40)
  const comment = normalizeNullableText(row.comment, 1000)
  if (!mood || (row.comment !== null && !comment)) return null
  return {
    id: row.id,
    workoutVersionId: row.workout_version_id,
    workspaceId: scope.workspaceId,
    studentUserId: subject,
    rpe: Number(row.rpe),
    mood,
    comment,
    completedExerciseIds: row.completed_exercise_ids,
    completedAt: row.completed_at,
  }
}

function parseAssignment(value: unknown, scope: TrainingScope, subject: string): AnamnesisAssignment | null {
  const row = rowObject(value)
  if (!row
    || !isUuid(row.id)
    || row.workspace_id !== scope.workspaceId
    || row.student_user_id !== subject
    || !isUuid(row.assigned_by_user_id)
    || (row.assigned_by_role !== 'owner' && row.assigned_by_role !== 'trainer')
    || !validateQuestions(row.questions)
    || !isIsoTimestamp(row.assigned_at)) return null
  const title = boundedString(row.title, 2, 120)
  if (!title) return null
  return {
    id: row.id,
    workspaceId: scope.workspaceId,
    studentUserId: subject,
    assignedByUserId: row.assigned_by_user_id,
    assignedByRole: row.assigned_by_role,
    title,
    questions: row.questions,
    assignedAt: row.assigned_at,
  }
}

function parseSubmission(value: unknown, scope: TrainingScope, subject: string): AnamnesisSubmission | null {
  const row = rowObject(value)
  if (!row
    || !isUuid(row.id)
    || !isUuid(row.assignment_id)
    || row.workspace_id !== scope.workspaceId
    || row.student_user_id !== subject
    || !validateAnswerEnvelope(row.answers)
    || !isIsoTimestamp(row.submitted_at)) return null
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    workspaceId: scope.workspaceId,
    studentUserId: subject,
    answers: row.answers,
    submittedAt: row.submitted_at,
  }
}

function parseNote(value: unknown, scope: TrainingScope, subject: string): TrainerStudentNote | null {
  const row = rowObject(value)
  if (!row
    || !isUuid(row.id)
    || row.workspace_id !== scope.workspaceId
    || row.student_user_id !== subject
    || !isUuid(row.author_user_id)
    || (row.author_role !== 'owner' && row.author_role !== 'trainer')
    || !isIsoTimestamp(row.created_at)) return null
  const note = boundedString(row.note, 1, 2000)
  if (!note) return null
  return {
    id: row.id,
    workspaceId: scope.workspaceId,
    studentUserId: subject,
    authorUserId: row.author_user_id,
    authorRole: row.author_role,
    note,
    createdAt: row.created_at,
  }
}

async function callMutation(functionName: string, arguments_: Record<string, unknown>, message: string, boundary: TrainingDataBoundary) {
  try {
    return mutationId(await boundary.rpc(functionName, arguments_), message)
  } catch {
    throw new Error(message)
  }
}

export async function publishWorkoutVersion(scope: TrainingScope, input: PublishWorkoutInput, boundary: TrainingDataBoundary = supabaseBoundary) {
  requireRole(scope, 'trainer', trainingMutationError)
  const title = boundedString(input.title, 2, 120)
  if (!isUuid(input.studentUserId) || !title || !validateExercises(input.exercises) || !isIdempotencyKey(input.idempotencyKey)) throw new Error(trainingMutationError)
  return callMutation('publish_workout_version', {
    p_student_user_id: input.studentUserId,
    p_title: title,
    p_exercises: input.exercises,
    p_idempotency_key: input.idempotencyKey,
  }, trainingMutationError, boundary)
}

export async function completeWorkoutVersion(scope: TrainingScope, input: CompleteWorkoutInput, boundary: TrainingDataBoundary = supabaseBoundary) {
  requireRole(scope, 'student', trainingMutationError)
  const mood = boundedString(input.mood, 2, 40)
  const comment = input.comment?.trim() || null
  if (!isUuid(input.workoutVersionId)
    || !Number.isInteger(input.rpe) || input.rpe < 0 || input.rpe > 10
    || !mood || (comment !== null && !boundedString(comment, 1, 1000))
    || !validateExerciseIds(input.completedExerciseIds)
    || !isIdempotencyKey(input.idempotencyKey)) throw new Error(trainingMutationError)
  return callMutation('complete_workout_version', {
    p_workout_version_id: input.workoutVersionId,
    p_rpe: input.rpe,
    p_mood: mood,
    p_comment: comment,
    p_completed_exercise_ids: input.completedExerciseIds,
    p_idempotency_key: input.idempotencyKey,
  }, trainingMutationError, boundary)
}

export async function assignAnamnesis(scope: TrainingScope, input: AssignAnamnesisInput, boundary: TrainingDataBoundary = supabaseBoundary) {
  requireRole(scope, 'trainer', anamnesisMutationError)
  const title = boundedString(input.title, 2, 120)
  if (!isUuid(input.studentUserId) || !title || !validateQuestions(input.questions) || !isIdempotencyKey(input.idempotencyKey)) throw new Error(anamnesisMutationError)
  return callMutation('assign_anamnesis', {
    p_student_user_id: input.studentUserId,
    p_title: title,
    p_questions: input.questions,
    p_idempotency_key: input.idempotencyKey,
  }, anamnesisMutationError, boundary)
}

export async function submitAnamnesis(scope: TrainingScope, input: SubmitAnamnesisInput, boundary: TrainingDataBoundary = supabaseBoundary) {
  requireRole(scope, 'student', anamnesisMutationError)
  if (!isUuid(input.assignmentId) || !validateAnswers(input.answers, input.questions) || !isIdempotencyKey(input.idempotencyKey)) throw new Error(anamnesisMutationError)
  return callMutation('submit_anamnesis', {
    p_assignment_id: input.assignmentId,
    p_answers: input.answers,
    p_idempotency_key: input.idempotencyKey,
  }, anamnesisMutationError, boundary)
}

export async function createTrainerStudentNote(scope: TrainingScope, input: CreateTrainerNoteInput, boundary: TrainingDataBoundary = supabaseBoundary) {
  requireRole(scope, 'trainer', trainerNoteError)
  const note = boundedString(input.note, 1, 2000)
  if (!isUuid(input.studentUserId) || !note || !isIdempotencyKey(input.idempotencyKey)) throw new Error(trainerNoteError)
  return callMutation('create_trainer_student_note', {
    p_student_user_id: input.studentUserId,
    p_note: note,
    p_idempotency_key: input.idempotencyKey,
  }, trainerNoteError, boundary)
}

async function selectPage<T extends { id: string }>(
  spec: SelectSpec,
  parse: (value: unknown) => T | null,
  timestamp: (item: T) => string,
  message: string,
  boundary: TrainingDataBoundary,
) {
  try {
    const result = await boundary.select(spec)
    if (result.error || !Array.isArray(result.data)) throw new Error(message)
    const items = result.data.map(parse)
    if (items.some((item) => item === null)) throw new Error(message)
    const parsed = items as T[]
    if (parsed.length > spec.limit + 1) throw new Error(message)
    for (let index = 0; index < parsed.length; index += 1) {
      const current = parsed[index]
      const currentTime = Date.parse(timestamp(current))
      if (spec.before) {
        const beforeTime = Date.parse(spec.before.at)
        if (currentTime > beforeTime || (currentTime === beforeTime && current.id.toLowerCase() >= spec.before.id.toLowerCase())) throw new Error(message)
      }
      const previous = parsed[index - 1]
      if (previous) {
        const previousTime = Date.parse(timestamp(previous))
        if (currentTime > previousTime || (currentTime === previousTime && current.id.toLowerCase() >= previous.id.toLowerCase())) throw new Error(message)
      }
    }
    const hasMore = parsed.length > spec.limit
    return pageFrom(parsed.slice(0, spec.limit), hasMore, timestamp)
  } catch {
    throw new Error(message)
  }
}

export async function listWorkoutVersions(scope: TrainingScope, studentUserId?: string, options?: PageOptions, boundary: TrainingDataBoundary = supabaseBoundary) {
  const subject = subjectFor(scope, studentUserId, trainingReadError)
  const page = pageConfiguration(options, trainingReadError)
  return selectPage({
    table: 'workout_versions',
    columns: 'id, workspace_id, student_user_id, published_by_user_id, published_by_role, version_number, title, exercises, published_at',
    equals: { workspace_id: scope.workspaceId, student_user_id: subject },
    orderAt: 'published_at', limit: page.limit, before: page.before,
  }, (row) => parseWorkout(row, scope, subject), (item) => item.publishedAt, trainingReadError, boundary)
}

export async function getLatestWorkoutVersion(scope: TrainingScope, studentUserId?: string, boundary: TrainingDataBoundary = supabaseBoundary) {
  const result = await listWorkoutVersions(scope, studentUserId, { limit: 1 }, boundary)
  return result.items[0] ?? null
}

export async function listWorkoutCompletions(scope: TrainingScope, studentUserId?: string, options?: PageOptions, boundary: TrainingDataBoundary = supabaseBoundary) {
  const subject = subjectFor(scope, studentUserId, trainingReadError)
  const page = pageConfiguration(options, trainingReadError)
  return selectPage({
    table: 'workout_completion_events',
    columns: 'id, workout_version_id, workspace_id, student_user_id, rpe, mood, comment, completed_exercise_ids, completed_at',
    equals: { workspace_id: scope.workspaceId, student_user_id: subject },
    orderAt: 'completed_at', limit: page.limit, before: page.before,
  }, (row) => parseCompletion(row, scope, subject), (item) => item.completedAt, trainingReadError, boundary)
}

export async function listAnamnesisAssignments(scope: TrainingScope, studentUserId?: string, options?: PageOptions, boundary: TrainingDataBoundary = supabaseBoundary) {
  const subject = subjectFor(scope, studentUserId, anamnesisReadError)
  const page = pageConfiguration(options, anamnesisReadError)
  return selectPage({
    table: 'anamnesis_assignments',
    columns: 'id, workspace_id, student_user_id, assigned_by_user_id, assigned_by_role, title, questions, assigned_at',
    equals: { workspace_id: scope.workspaceId, student_user_id: subject },
    orderAt: 'assigned_at', limit: page.limit, before: page.before,
  }, (row) => parseAssignment(row, scope, subject), (item) => item.assignedAt, anamnesisReadError, boundary)
}

export async function getLatestAnamnesisAssignment(scope: TrainingScope, studentUserId?: string, boundary: TrainingDataBoundary = supabaseBoundary) {
  const result = await listAnamnesisAssignments(scope, studentUserId, { limit: 1 }, boundary)
  return result.items[0] ?? null
}

export async function listAnamnesisSubmissions(scope: TrainingScope, studentUserId?: string, options?: PageOptions, boundary: TrainingDataBoundary = supabaseBoundary) {
  const subject = subjectFor(scope, studentUserId, anamnesisReadError)
  const page = pageConfiguration(options, anamnesisReadError)
  return selectPage({
    table: 'anamnesis_submissions',
    columns: 'id, assignment_id, workspace_id, student_user_id, answers, submitted_at',
    equals: { workspace_id: scope.workspaceId, student_user_id: subject },
    orderAt: 'submitted_at', limit: page.limit, before: page.before,
  }, (row) => parseSubmission(row, scope, subject), (item) => item.submittedAt, anamnesisReadError, boundary)
}

export async function listTrainerStudentNotes(scope: TrainingScope, studentUserId: string, options?: PageOptions, boundary: TrainingDataBoundary = supabaseBoundary) {
  requireRole(scope, 'trainer', trainerNoteError)
  if (!isUuid(studentUserId)) throw new Error(trainerNoteError)
  const page = pageConfiguration(options, trainerNoteError)
  return selectPage({
    table: 'trainer_student_notes',
    columns: 'id, workspace_id, student_user_id, author_user_id, author_role, note, created_at',
    equals: { workspace_id: scope.workspaceId, student_user_id: studentUserId },
    orderAt: 'created_at', limit: page.limit, before: page.before,
  }, (row) => parseNote(row, scope, studentUserId), (item) => item.createdAt, trainerNoteError, boundary)
}
