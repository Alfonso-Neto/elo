import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { AssistantProposal } from '../assistant/assistant-service'
import { PrototypeProvider } from '../prototype-context'
import { LiveWorkoutBuilderScreen } from './LiveTrainerTraining'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  listEnrolledStudents: vi.fn(),
  getLatestWorkoutVersion: vi.fn(),
  listWorkoutCompletions: vi.fn(),
  publishWorkoutVersion: vi.fn(),
  listStudentReports: vi.fn(),
  requestTrainerCopilot: vi.fn(),
  decideProposal: vi.fn(),
}))

vi.mock('../auth/auth-context', () => ({ useAuth: mocks.useAuth }))
vi.mock('../onboarding/enrollment-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../onboarding/enrollment-service')>(),
  listEnrolledStudents: mocks.listEnrolledStudents,
}))
vi.mock('../signals', async (importOriginal) => ({
  ...await importOriginal<typeof import('../signals')>(),
  createSignalService: () => ({ listStudentReports: mocks.listStudentReports }),
}))
vi.mock('./training', async (importOriginal) => ({
  ...await importOriginal<typeof import('./training')>(),
  getLatestWorkoutVersion: mocks.getLatestWorkoutVersion,
  listWorkoutCompletions: mocks.listWorkoutCompletions,
  publishWorkoutVersion: mocks.publishWorkoutVersion,
}))
vi.mock('../assistant/assistant-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../assistant/assistant-service')>(),
  createAssistantService: () => ({
    requestTrainerCopilot: mocks.requestTrainerCopilot,
    decideProposal: mocks.decideProposal,
  }),
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const trainerId = '22222222-2222-4222-8222-222222222222'
const studentId = '33333333-3333-4333-8333-333333333333'
const secondStudentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'
const proposalId = '44444444-4444-4444-8444-444444444444'

const proposal: AssistantProposal = {
  summary: 'Reduzir temporariamente a carga e confirmar a resposta do aluno.',
  urgency: 'soon',
  red_flags: [],
  questions: [{ id: 'comfort', question: 'A execução está confortável?', reason: 'Confirma tolerância antes de publicar.', answer_type: 'yes_no' }],
  rationale: ['O último sinal ocorreu no mesmo padrão de movimento.'],
  workout_changes: [{
    operation: 'reduce_load_percent', target: 'Leg press', value_number: 20, value_text: null,
    duration_sessions: 2, guardrail: 'Interromper se o desconforto reaparecer.',
  }],
  sources: [{ kind: 'user_report', label: 'Relato estruturado recente' }],
  uncertainties: ['Não há confirmação clínica sobre a origem do desconforto.'],
  disclaimer: 'Esta proposta apoia a revisão profissional e não substitui avaliação, diagnóstico ou decisão humana.',
}

function arrangeBuilder() {
  mocks.useAuth.mockReturnValue({
    membership: { workspaceId, workspaceName: 'Studio Elo', membershipRole: 'owner', trainerName: 'André Lima' },
    profile: { id: trainerId, accountRole: 'trainer', displayName: 'André Lima' },
  })
  mocks.listEnrolledStudents.mockResolvedValue([{ userId: studentId, displayName: 'Marina Costa', joinedAt: '2026-08-01T12:00:00.000Z' }])
  mocks.getLatestWorkoutVersion.mockResolvedValue({
    id: '55555555-5555-4555-8555-555555555555', workspaceId, studentUserId: studentId,
    publishedByUserId: trainerId, publishedByRole: 'trainer', versionNumber: 1,
    title: 'Inferiores', publishedAt: '2026-08-06T12:00:00.000Z',
    exercises: [{ id: 'leg', name: 'Leg press', muscle: 'Quadríceps', sets: '4', reps: '10', load: '100 kg', rest: '60s', tempo: '2-0-2', rir: '2', note: '' }],
  })
  mocks.listStudentReports.mockResolvedValue({ items: [{
    id: '66666666-6666-4666-8666-666666666666', sequence: 1, workspaceId, studentUserId: studentId,
    region: 'Joelho', side: 'right', movement: 'Leg press', timing: 'during_activity', intensity: 5,
    onset: '2026-08-07T10:00:00.000Z', redFlags: [], createdAt: '2026-08-07T10:01:00.000Z',
  }], nextOffset: null })
  mocks.listWorkoutCompletions.mockResolvedValue({ items: [{
    id: '77777777-7777-4777-8777-777777777777', workoutVersionId: '55555555-5555-4555-8555-555555555555',
    workspaceId, studentUserId: studentId, rpe: 8, mood: 'Pesado', comment: 'Comentário privado não enviado ao modelo.',
    completedExerciseIds: ['leg'], completedAt: '2026-08-07T09:00:00.000Z',
  }], nextCursor: null })
  mocks.requestTrainerCopilot.mockResolvedValue({
    state: 'complete', runId: '88888888-8888-4888-8888-888888888888', proposalId,
    completionMode: 'model', reused: false, proposal,
  })
  mocks.decideProposal.mockResolvedValue('99999999-9999-4999-8999-999999999999')
  mocks.publishWorkoutVersion.mockResolvedValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
}

async function openReview() {
  render(<PrototypeProvider lockedRole="trainer"><LiveWorkoutBuilderScreen /></PrototypeProvider>)
  expect(await screen.findByRole('heading', { name: /Treino em suas mãos/i })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Abrir 1 ponto para revisar com o Copiloto/i }))
  const dialog = screen.getByRole('dialog', { name: /Segundo olhar no rascunho/i })
  fireEvent.click(within(dialog).getByRole('button', { name: /Revisar este rascunho/i }))
  expect(await within(dialog).findByText(proposal.summary)).toBeInTheDocument()
  return dialog
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/#/builder')
  arrangeBuilder()
})

describe('live workout builder copilot', () => {
  it('uses a minimized student snapshot and applies an accepted proposal only to the draft', async () => {
    const dialog = await openReview()

    expect(mocks.listStudentReports).toHaveBeenCalledWith(workspaceId, studentId, { limit: 1 })
    const command = mocks.requestTrainerCopilot.mock.calls[0][0]
    expect(command.context.current_workout).toEqual([{ exercise: 'Leg press', sets: 4, reps: '10', load: '100 kg' }])
    expect(command.context.recent_feedback.join(' ')).toContain('RPE 8/10')
    expect(command.context.recent_feedback.join(' ')).not.toContain('Comentário privado')
    expect(command.report).not.toContain(studentId)
    expect(command.report).not.toContain(workspaceId)

    fireEvent.click(within(dialog).getByRole('button', { name: /Aceitar no rascunho/i }))

    await waitFor(() => expect(mocks.decideProposal).toHaveBeenCalledWith(expect.objectContaining({ proposalId, decision: 'accepted' })))
    expect(await screen.findByDisplayValue('80 kg')).toBeInTheDocument()
    expect(mocks.publishWorkoutVersion).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('heading', { name: /Revisão registrada no rascunho/i })).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    fireEvent.change(screen.getByLabelText('Repetições'), { target: { value: '8' } })
    expect(screen.getByRole('button', { name: /Abrir 1 ponto para revisar com o Copiloto/i })).toBeInTheDocument()
  })

  it('records rejection while preserving every workout parameter', async () => {
    const dialog = await openReview()
    fireEvent.click(within(dialog).getByRole('button', { name: /Manter meu rascunho/i }))

    await waitFor(() => expect(mocks.decideProposal).toHaveBeenCalledWith(expect.objectContaining({ proposalId, decision: 'rejected' })))
    expect(screen.getByDisplayValue('100 kg')).toBeInTheDocument()
    expect(mocks.publishWorkoutVersion).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('heading', { name: /Proposta rejeitada e registrada/i })).toBeInTheDocument()
  })

  it('discards a late proposal after the trainer changes the active student', async () => {
    let resolveReview!: (value: unknown) => void
    mocks.requestTrainerCopilot.mockReturnValueOnce(new Promise((resolve) => { resolveReview = resolve }))
    mocks.listEnrolledStudents.mockResolvedValue([
      { userId: studentId, displayName: 'Marina Costa', joinedAt: '2026-08-01T12:00:00.000Z' },
      { userId: secondStudentId, displayName: 'Bianca Souza', joinedAt: '2026-08-02T12:00:00.000Z' },
    ])
    mocks.getLatestWorkoutVersion.mockImplementation(async (_scope, activeStudentId) => activeStudentId === secondStudentId ? {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', workspaceId, studentUserId: secondStudentId,
      publishedByUserId: trainerId, publishedByRole: 'trainer', versionNumber: 1,
      title: 'Superiores', publishedAt: '2026-08-06T12:00:00.000Z',
      exercises: [{ id: 'row', name: 'Remada', muscle: 'Costas', sets: '3', reps: '12', load: '30 kg', rest: '60s', tempo: '2-0-2', rir: '2', note: '' }],
    } : {
      id: '55555555-5555-4555-8555-555555555555', workspaceId, studentUserId: studentId,
      publishedByUserId: trainerId, publishedByRole: 'trainer', versionNumber: 1,
      title: 'Inferiores', publishedAt: '2026-08-06T12:00:00.000Z',
      exercises: [{ id: 'leg', name: 'Leg press', muscle: 'Quadríceps', sets: '4', reps: '10', load: '100 kg', rest: '60s', tempo: '2-0-2', rir: '2', note: '' }],
    })

    render(<PrototypeProvider lockedRole="trainer"><LiveWorkoutBuilderScreen /></PrototypeProvider>)
    expect(await screen.findByDisplayValue('Inferiores')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Abrir 1 ponto para revisar com o Copiloto/i }))
    const dialog = screen.getByRole('dialog', { name: /Segundo olhar no rascunho/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /Revisar este rascunho/i }))
    await waitFor(() => expect(mocks.requestTrainerCopilot).toHaveBeenCalledTimes(1))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))

    fireEvent.change(screen.getByRole('combobox'), { target: { value: secondStudentId } })
    expect(await screen.findByDisplayValue('Superiores')).toBeInTheDocument()
    resolveReview({
      state: 'complete', runId: '88888888-8888-4888-8888-888888888888', proposalId,
      completionMode: 'model', reused: false, proposal,
    })

    await waitFor(() => expect(screen.queryByText(proposal.summary)).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Abrir 1 ponto para revisar com o Copiloto/i }))
    expect(screen.getByRole('dialog', { name: /Segundo olhar no rascunho/i })).toHaveTextContent('Quer um segundo olhar sobre este rascunho?')
  })
})
