import { describe, expect, it, vi } from 'vitest'
import type { Exercise, FormQuestion } from '../../types'
import {
  anamnesisMutationError,
  assignAnamnesis,
  completeWorkoutVersion,
  createTrainerStudentNote,
  getLatestWorkoutVersion,
  listAnamnesisAssignments,
  listTrainerStudentNotes,
  listWorkoutVersions,
  publishWorkoutVersion,
  submitAnamnesis,
  trainerNoteError,
  trainingMutationError,
  trainingReadError,
  type TrainingDataBoundary,
} from './service'
import type { TrainingScope } from './types'

const workspaceId = '23ccf1ec-a377-4b45-a401-11d28a8a1503'
const trainerId = 'db2a5eb2-a843-4d9c-bfa3-df73b3e680de'
const studentId = '0a258739-7658-4012-b747-0f95dca6372c'
const otherWorkspaceId = '23c3d0bb-19e9-40f6-82b7-cc3080ae43f1'
const workoutId = '10402a32-7f09-4ef4-9a45-046f697bc87c'
const assignmentId = '3ec377de-3ac8-446c-a33b-d476abf43d30'
const resultId = 'c1673eb7-20d5-4312-9527-f74bd7469fc4'
const olderWorkoutId = '18c7f98c-c73f-448c-abdf-5de3dbf9d772'
const now = new Date().toISOString()
const earlier = new Date(Date.now() - 1000).toISOString()

const trainerScope: TrainingScope = { workspaceId, userId: trainerId, role: 'trainer' }
const studentScope: TrainingScope = { workspaceId, userId: studentId, role: 'student' }

const exercise: Exercise = {
  id: 'ex-1', name: 'Agachamento goblet', muscle: 'Quadríceps', sets: '4', reps: '10',
  load: '20 kg', rest: '90 s', tempo: '3-1-1', rir: '2', note: '',
}

const questions: FormQuestion[] = [
  { id: 'goal', label: 'Qual é o seu objetivo principal?', type: 'single', options: ['Ganhar massa', 'Condicionamento'], required: true },
  { id: 'history', label: 'Conte seu histórico de treino.', type: 'long' },
]

function boundary(input?: { rpcData?: unknown; rpcError?: unknown; selectData?: unknown; selectError?: unknown }) {
  const rpc = vi.fn(async (_name: string, _arguments: Record<string, unknown>) => ({ data: input?.rpcData ?? resultId, error: input?.rpcError ?? null }))
  const select = vi.fn(async (_spec: Parameters<TrainingDataBoundary['select']>[0]) => ({ data: input?.selectData ?? [], error: input?.selectError ?? null }))
  return { client: { rpc, select } satisfies TrainingDataBoundary, rpc, select }
}

function workoutRow(overrides: Record<string, unknown> = {}) {
  return {
    id: workoutId,
    workspace_id: workspaceId,
    student_user_id: studentId,
    published_by_user_id: trainerId,
    published_by_role: 'owner',
    version_number: 1,
    title: 'Treino A · Inferiores',
    exercises: [exercise],
    published_at: now,
    ...overrides,
  }
}

describe('live training mutation contracts', () => {
  it('publishes with caller-stable idempotency and never sends workspace or caller IDs', async () => {
    const { client, rpc } = boundary()
    const input = { studentUserId: studentId, title: ' Treino A · Inferiores ', exercises: [exercise], idempotencyKey: 'publish-workout-0001' }
    await expect(publishWorkoutVersion(trainerScope, input, client)).resolves.toBe(resultId)
    await expect(publishWorkoutVersion(trainerScope, input, client)).resolves.toBe(resultId)

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
    expect(rpc.mock.calls[0][0]).toBe('publish_workout_version')
    expect(rpc.mock.calls[0][1]).toEqual({
      p_student_user_id: studentId,
      p_title: 'Treino A · Inferiores',
      p_exercises: [exercise],
      p_idempotency_key: 'publish-workout-0001',
    })
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('workspace_id')
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('caller_id')
  })

  it('rejects malformed exercise JSON before invoking the backend', async () => {
    const { client, rpc } = boundary()
    const malformed = { ...exercise, unexpected: 'field' } as Exercise
    await expect(publishWorkoutVersion(trainerScope, {
      studentUserId: studentId, title: 'Treino válido', exercises: [malformed], idempotencyKey: 'publish-workout-0002',
    }, client)).rejects.toThrow(trainingMutationError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('records student completion feedback without authority parameters', async () => {
    const { client, rpc } = boundary()
    await expect(completeWorkoutVersion(studentScope, {
      workoutVersionId: workoutId,
      rpe: 8,
      mood: 'Na medida',
      comment: ' Boa execução. ',
      completedExerciseIds: ['ex-1'],
      idempotencyKey: 'complete-workout-001',
    }, client)).resolves.toBe(resultId)
    expect(rpc).toHaveBeenCalledWith('complete_workout_version', {
      p_workout_version_id: workoutId,
      p_rpe: 8,
      p_mood: 'Na medida',
      p_comment: 'Boa execução.',
      p_completed_exercise_ids: ['ex-1'],
      p_idempotency_key: 'complete-workout-001',
    })
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('student_user_id')
  })

  it('assigns strict questions and submits bounded answers through role-specific RPCs', async () => {
    const { client, rpc } = boundary()
    await expect(assignAnamnesis(trainerScope, {
      studentUserId: studentId, title: 'Anamnese inicial', questions, idempotencyKey: 'assign-anamnesis-001',
    }, client)).resolves.toBe(resultId)
    await expect(submitAnamnesis(studentScope, {
      assignmentId,
      questions,
      answers: { goal: 'Ganhar massa', history: 'Treino há dois anos.' },
      idempotencyKey: 'submit-anamnesis-01',
    }, client)).resolves.toBe(resultId)
    expect(rpc.mock.calls[0][0]).toBe('assign_anamnesis')
    expect(rpc.mock.calls[1][0]).toBe('submit_anamnesis')
    expect(rpc.mock.calls[1][1]).toEqual({
      p_assignment_id: assignmentId,
      p_answers: { goal: 'Ganhar massa', history: 'Treino há dois anos.' },
      p_idempotency_key: 'submit-anamnesis-01',
    })
  })

  it('maps backend details and malformed UUID responses to generic errors', async () => {
    const failed = boundary({ rpcError: { message: 'cross tenant row existed' } }).client
    await expect(assignAnamnesis(trainerScope, {
      studentUserId: studentId, title: 'Anamnese inicial', questions, idempotencyKey: 'assign-anamnesis-002',
    }, failed)).rejects.toThrow(anamnesisMutationError)

    const malformed = boundary({ rpcData: 'not-a-uuid' }).client
    await expect(publishWorkoutVersion(trainerScope, {
      studentUserId: studentId, title: 'Treino válido', exercises: [exercise], idempotencyKey: 'publish-workout-0003',
    }, malformed)).rejects.toThrow(trainingMutationError)
  })
})

describe('live training read contracts', () => {
  it('scopes and paginates workout reads, then parses the latest version', async () => {
    const { client, select } = boundary({ selectData: [
      workoutRow(),
      workoutRow({ id: olderWorkoutId, version_number: 0 + 1, published_at: earlier }),
    ] })
    const page = await listWorkoutVersions(trainerScope, studentId, { limit: 1 }, client)
    expect(page.items[0]).toMatchObject({ id: workoutId, workspaceId, studentUserId: studentId, versionNumber: 1 })
    expect(page.nextCursor).toEqual({ at: now, id: workoutId })
    expect(select).toHaveBeenCalledWith(expect.objectContaining({
      table: 'workout_versions',
      equals: { workspace_id: workspaceId, student_user_id: studentId },
      orderAt: 'published_at',
      limit: 1,
    }))

    await expect(getLatestWorkoutVersion(trainerScope, studentId, client)).resolves.toMatchObject({ id: workoutId })

    const empty = boundary({ selectData: [] })
    await expect(listWorkoutVersions(trainerScope, studentId, { limit: 10, before: { at: now, id: workoutId } }, empty.client)).resolves.toEqual({ items: [], nextCursor: null })
    expect(empty.select).toHaveBeenCalledWith(expect.objectContaining({ before: { at: now, id: workoutId }, limit: 10 }))
  })

  it('does not emit a cursor when a full page has no look-ahead row', async () => {
    const { client } = boundary({ selectData: [workoutRow()] })
    await expect(listWorkoutVersions(trainerScope, studentId, { limit: 1 }, client)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: workoutId })],
      nextCursor: null,
    })
  })

  it('fails closed when a shaped response crosses the requested tenant', async () => {
    const { client } = boundary({ selectData: [workoutRow({ workspace_id: otherWorkspaceId })] })
    await expect(listWorkoutVersions(trainerScope, studentId, undefined, client)).rejects.toThrow(trainingReadError)
  })

  it('prevents a student from shaping a read for another user', async () => {
    const { client, select } = boundary()
    await expect(listAnamnesisAssignments(studentScope, trainerId, undefined, client)).rejects.toThrow('Não foi possível carregar as anamneses agora.')
    expect(select).not.toHaveBeenCalled()
  })

  it('keeps trainer notes out of student service paths', async () => {
    const { client, rpc, select } = boundary()
    await expect(createTrainerStudentNote(studentScope, {
      studentUserId: studentId, note: 'Nota privada', idempotencyKey: 'trainer-note-private-1',
    }, client)).rejects.toThrow(trainerNoteError)
    await expect(listTrainerStudentNotes(studentScope, studentId, undefined, client)).rejects.toThrow(trainerNoteError)
    expect(rpc).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })
})
