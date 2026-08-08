import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { AssistantProposal } from '../assistant/assistant-service'
import { PrototypeProvider, usePrototype } from '../prototype-context'
import type { AnamnesisAssignment, AnamnesisSubmission } from './training'
import { LiveFormBuilderScreen, LiveTrainerFormsScreen, LiveWorkoutBuilderScreen } from './LiveTrainerTraining'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  listEnrolledStudents: vi.fn(),
  getLatestWorkoutVersion: vi.fn(),
  listWorkoutCompletions: vi.fn(),
  publishWorkoutVersion: vi.fn(),
  assignAnamnesis: vi.fn(),
  listAnamnesisAssignments: vi.fn(),
  listAnamnesisSubmissions: vi.fn(),
  listStudentReports: vi.fn(),
  requestTrainerCopilot: vi.fn(),
  requestFormQuestionSuggestions: vi.fn(),
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
  assignAnamnesis: mocks.assignAnamnesis,
  listAnamnesisAssignments: mocks.listAnamnesisAssignments,
  listAnamnesisSubmissions: mocks.listAnamnesisSubmissions,
}))
vi.mock('../assistant/assistant-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../assistant/assistant-service')>(),
  createAssistantService: () => ({
    requestTrainerCopilot: mocks.requestTrainerCopilot,
    requestFormQuestionSuggestions: mocks.requestFormQuestionSuggestions,
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

function formSuggestionResult(summary: string, question: string, questionId = 'sleep') {
  return {
    state: 'complete' as const,
    runId: '88888888-8888-4888-8888-888888888888',
    proposalId,
    completionMode: 'model' as const,
    reused: false,
    proposal: {
      summary,
      urgency: 'routine' as const,
      red_flags: [],
      questions: [{ id: questionId, question, reason: 'Completa uma lacuna do rascunho.', answer_type: 'text' as const }],
      rationale: ['O rascunho ainda não cobre este contexto.'],
      workout_changes: [],
      sources: [{ kind: 'trainer_context' as const, label: 'Título e perguntas do rascunho' }],
      uncertainties: ['A sugestão depende da revisão do professor.'],
      disclaimer: 'Sugestão para revisão humana; nada é enviado automaticamente.',
    },
  }
}

function historyAssignment(id: string, activeStudentId: string, title: string): AnamnesisAssignment {
  return {
    id,
    workspaceId,
    studentUserId: activeStudentId,
    assignedByUserId: trainerId,
    assignedByRole: 'trainer',
    title,
    questions: [{ id: 'context', label: 'Como está sua recuperação?', type: 'text', required: true }],
    assignedAt: '2026-08-08T09:00:00.000Z',
  }
}

function historySubmission(id: string, assignmentId: string, activeStudentId: string): AnamnesisSubmission {
  return {
    id,
    assignmentId,
    workspaceId,
    studentUserId: activeStudentId,
    answers: { context: 'Resposta protegida' },
    submittedAt: '2026-08-08T10:00:00.000Z',
  }
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
  mocks.assignAnamnesis.mockResolvedValue('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  mocks.listAnamnesisAssignments.mockResolvedValue({ items: [], nextCursor: null })
  mocks.listAnamnesisSubmissions.mockResolvedValue({ items: [], nextCursor: null })
  mocks.requestFormQuestionSuggestions.mockResolvedValue(formSuggestionResult('Uma lacuna útil foi encontrada.', 'Como está a qualidade do seu sono?'))
}

async function openReview() {
  render(<PrototypeProvider lockedRole="trainer"><LiveWorkoutBuilderScreen /></PrototypeProvider>)
  expect(await screen.findByRole('heading', { name: /Treino em suas mãos/i })).toBeInTheDocument()
  expect(mocks.listEnrolledStudents).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: /Abrir 1 ponto para revisar com o Copiloto/i }))
  const dialog = screen.getByRole('dialog', { name: /Segundo olhar no rascunho/i })
  fireEvent.click(within(dialog).getByRole('button', { name: /Revisar este rascunho/i }))
  expect(await within(dialog).findByText(proposal.summary)).toBeInTheDocument()
  return dialog
}

function DraftRouteHarness() {
  const { navigate, page, workoutSessionDrafts } = usePrototype()
  return <>
    <output>{`rascunhos:${Object.keys(workoutSessionDrafts).length}`}</output>
    {page === 'builder'
      ? <><button onClick={() => navigate('dashboard')}>Sair do construtor</button><LiveWorkoutBuilderScreen /></>
      : <button onClick={() => navigate('builder')}>Voltar ao construtor</button>}
  </>
}

function FormDraftRouteHarness() {
  const { navigate, page, formSessionDrafts } = usePrototype()
  return <>
    <output>{`form-rascunhos:${Object.keys(formSessionDrafts).length}`}</output>
    {page === 'form-builder'
      ? <><button onClick={() => navigate('dashboard')}>Sair do formulário</button><LiveFormBuilderScreen /></>
      : <button onClick={() => navigate('form-builder')}>Voltar ao formulário</button>}
  </>
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

  it('restores a per-student session draft after navigation and clears it after publishing', async () => {
    render(<PrototypeProvider lockedRole="trainer"><DraftRouteHarness /></PrototypeProvider>)
    expect(await screen.findByDisplayValue('100 kg')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Carga'), { target: { value: '82 kg' } })
    expect(screen.getByText('rascunhos:1')).toBeInTheDocument()
    expect(screen.getByText('RASCUNHO PRESERVADO')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sair do construtor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao construtor' }))

    expect(await screen.findByDisplayValue('82 kg')).toBeInTheDocument()
    expect(mocks.getLatestWorkoutVersion).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /^Publicar treino$/i }))
    await waitFor(() => expect(mocks.publishWorkoutVersion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ exercises: [expect.objectContaining({ load: '82 kg' })] }),
    ))
    await waitFor(() => expect(screen.getByText('rascunhos:0')).toBeInTheDocument())
  })

  it('keeps independent drafts while the trainer switches between students', async () => {
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

    render(<PrototypeProvider lockedRole="trainer"><DraftRouteHarness /></PrototypeProvider>)
    expect(await screen.findByDisplayValue('100 kg')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Carga'), { target: { value: '82 kg' } })

    fireEvent.change(screen.getByRole('combobox'), { target: { value: secondStudentId } })
    expect(await screen.findByDisplayValue('30 kg')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Carga'), { target: { value: '24 kg' } })
    expect(screen.getByText('rascunhos:2')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: studentId } })
    expect(await screen.findByDisplayValue('82 kg')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: secondStudentId } })
    expect(await screen.findByDisplayValue('24 kg')).toBeInTheDocument()
    expect(mocks.getLatestWorkoutVersion).toHaveBeenCalledTimes(2)
  })

  it('freezes mutation controls and preserves edits newer than an in-flight publication', async () => {
    let resolvePublish!: (value: string) => void
    mocks.publishWorkoutVersion.mockReturnValueOnce(new Promise<string>((resolve) => { resolvePublish = resolve }))

    render(<PrototypeProvider lockedRole="trainer"><DraftRouteHarness /></PrototypeProvider>)
    expect(await screen.findByDisplayValue('100 kg')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Carga'), { target: { value: '82 kg' } })
    fireEvent.click(screen.getByRole('button', { name: /^Publicar treino$/i }))

    await waitFor(() => expect(mocks.publishWorkoutVersion).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Carga')).toBeDisabled()
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Adicionar exercício/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Copiloto indisponível durante a publicação/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Sair do construtor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao construtor' }))
    expect(await screen.findByDisplayValue('82 kg')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Carga'), { target: { value: '88 kg' } })

    await act(async () => { resolvePublish('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); await Promise.resolve() })

    expect(screen.getByDisplayValue('88 kg')).toBeInTheDocument()
    expect(screen.getByText('rascunhos:1')).toBeInTheDocument()
    expect(mocks.publishWorkoutVersion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ exercises: [expect.objectContaining({ load: '82 kg' })] }),
    )
  })

  it('reuses the same idempotency key when a failed publication is retried unchanged', async () => {
    mocks.publishWorkoutVersion
      .mockRejectedValueOnce(new Error('Falha temporária na publicação.'))
      .mockResolvedValueOnce('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    render(<PrototypeProvider lockedRole="trainer"><LiveWorkoutBuilderScreen /></PrototypeProvider>)
    expect(await screen.findByDisplayValue('100 kg')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Publicar treino$/i }))
    expect(await screen.findByText('Falha temporária na publicação.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Publicar treino$/i }))
    await waitFor(() => expect(mocks.publishWorkoutVersion).toHaveBeenCalledTimes(2))

    expect(mocks.publishWorkoutVersion.mock.calls[0][1].idempotencyKey).toBe(mocks.publishWorkoutVersion.mock.calls[1][1].idempotencyKey)
    expect(await screen.findByText(/Versão publicada com sucesso/i)).toBeInTheDocument()
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
    expect(mocks.listEnrolledStudents).toHaveBeenCalledTimes(1)
    resolveReview({
      state: 'complete', runId: '88888888-8888-4888-8888-888888888888', proposalId,
      completionMode: 'model', reused: false, proposal,
    })

    await waitFor(() => expect(screen.queryByText(proposal.summary)).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Abrir 1 ponto para revisar com o Copiloto/i }))
    expect(screen.getByRole('dialog', { name: /Segundo olhar no rascunho/i })).toHaveTextContent('Quer um segundo olhar sobre este rascunho?')
  })
})

describe('live anamnesis builder copilot', () => {
  it('discards a suggestion generated for an older form draft', async () => {
    let resolveFirst!: (value: ReturnType<typeof formSuggestionResult>) => void
    mocks.requestFormQuestionSuggestions
      .mockReturnValueOnce(new Promise<ReturnType<typeof formSuggestionResult>>((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce(formSuggestionResult('Sugestão do rascunho atual.', 'Como está sua recuperação hoje?', 'recovery'))

    render(<PrototypeProvider lockedRole="trainer"><LiveFormBuilderScreen /></PrototypeProvider>)
    expect(await screen.findByDisplayValue('Nova anamnese')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Revisar lacunas/i }))
    await waitFor(() => expect(mocks.requestFormQuestionSuggestions).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))

    fireEvent.change(screen.getByLabelText('TÍTULO DO FORMULÁRIO'), { target: { value: 'Check-in de recuperação' } })
    fireEvent.click(screen.getByRole('button', { name: /Revisar lacunas/i }))
    expect(await screen.findByText('Sugestão do rascunho atual.')).toBeInTheDocument()

    await act(async () => {
      resolveFirst(formSuggestionResult('Sugestão antiga que deve ser descartada.', 'Pergunta antiga', 'old'))
      await Promise.resolve()
    })

    expect(screen.queryByText('Sugestão antiga que deve ser descartada.')).not.toBeInTheDocument()
    expect(screen.getByText('Sugestão do rascunho atual.')).toBeInTheDocument()
    expect(mocks.requestFormQuestionSuggestions.mock.calls[0][0].idempotencyKey).not.toBe(mocks.requestFormQuestionSuggestions.mock.calls[1][0].idempotencyKey)
  })

  it('reuses one suggestion key while a processing review is checked again unchanged', async () => {
    mocks.requestFormQuestionSuggestions
      .mockResolvedValueOnce({ state: 'processing', runId: '88888888-8888-4888-8888-888888888888' })
      .mockResolvedValueOnce(formSuggestionResult('Revisão concluída sem mudar o rascunho.', 'Como está sua disposição?'))

    render(<PrototypeProvider lockedRole="trainer"><LiveFormBuilderScreen /></PrototypeProvider>)
    expect(await screen.findByDisplayValue('Nova anamnese')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Revisar lacunas/i }))
    expect(await screen.findByText(/revisão ainda está sendo preparada/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Verificar novamente/i }))
    expect(await screen.findByText('Revisão concluída sem mudar o rascunho.')).toBeInTheDocument()

    expect(mocks.requestFormQuestionSuggestions).toHaveBeenCalledTimes(2)
    expect(mocks.requestFormQuestionSuggestions.mock.calls[0][0].idempotencyKey).toBe(mocks.requestFormQuestionSuggestions.mock.calls[1][0].idempotencyKey)
  })

  it('renews a failed assignment key after accepted suggestions change the payload', async () => {
    mocks.assignAnamnesis.mockRejectedValueOnce(new Error('Falha temporária no envio.'))

    render(<PrototypeProvider lockedRole="trainer"><LiveFormBuilderScreen /></PrototypeProvider>)
    expect(await screen.findByDisplayValue('Nova anamnese')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/i }))
    expect(await screen.findByText('Falha temporária no envio.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Revisar lacunas/i }))
    expect(await screen.findByText('Uma lacuna útil foi encontrada.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Adicionar 1 ao rascunho/i }))
    expect(await screen.findByDisplayValue('Como está a qualidade do seu sono?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/i }))
    await waitFor(() => expect(mocks.assignAnamnesis).toHaveBeenCalledTimes(2))
    expect(mocks.assignAnamnesis.mock.calls[0][1].idempotencyKey).not.toBe(mocks.assignAnamnesis.mock.calls[1][1].idempotencyKey)
  })

  it('keeps independent session drafts while switching students and navigating away', async () => {
    window.history.replaceState(null, '', '/#/form-builder')
    mocks.listEnrolledStudents.mockResolvedValue([
      { userId: studentId, displayName: 'Marina Costa', joinedAt: '2026-08-01T12:00:00.000Z' },
      { userId: secondStudentId, displayName: 'Bianca Souza', joinedAt: '2026-08-02T12:00:00.000Z' },
    ])

    render(<PrototypeProvider lockedRole="trainer"><FormDraftRouteHarness /></PrototypeProvider>)
    const title = await screen.findByLabelText('TÍTULO DO FORMULÁRIO')
    fireEvent.change(title, { target: { value: 'Contexto da Marina' } })
    expect(screen.getByText('form-rascunhos:1')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: secondStudentId } })
    expect(await screen.findByDisplayValue('Nova anamnese')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('TÍTULO DO FORMULÁRIO'), { target: { value: 'Contexto da Bianca' } })
    expect(screen.getByText('form-rascunhos:2')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: studentId } })
    expect(await screen.findByDisplayValue('Contexto da Marina')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: secondStudentId } })
    expect(await screen.findByDisplayValue('Contexto da Bianca')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sair do formulário' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao formulário' }))
    expect(await screen.findByDisplayValue('Contexto da Bianca')).toBeInTheDocument()
  })

  it('normalizes ordinary edits into the exact server-valid question shape', async () => {
    render(<PrototypeProvider lockedRole="trainer"><LiveFormBuilderScreen /></PrototypeProvider>)
    expect(await screen.findByDisplayValue('Nova anamnese')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('TÍTULO DO FORMULÁRIO'), { target: { value: '  Formulário seguro  ' } })
    fireEvent.click(screen.getByRole('button', { name: /Adicionar pergunta/i }))

    const questionInput = screen.getAllByPlaceholderText('Escreva uma pergunta clara...').at(-1)!
    fireEvent.change(questionInput, { target: { value: '  Pergunta segura  ' } })
    const card = questionInput.closest('article')!
    fireEvent.click(within(card).getByRole('button', { name: 'Escolha única' }))
    const optionInputs = within(card).getAllByRole('textbox').slice(-2)
    fireEvent.change(optionInputs[1], { target: { value: optionInputs[0].getAttribute('value') ?? 'Opção 1' } })
    expect(screen.getByRole('button', { name: /^Enviar$/i })).toBeDisabled()

    fireEvent.click(within(card).getByRole('button', { name: 'Texto curto' }))
    expect(screen.getByRole('button', { name: /^Enviar$/i })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/i }))
    await waitFor(() => expect(mocks.assignAnamnesis).toHaveBeenCalledTimes(1))

    const payload = mocks.assignAnamnesis.mock.calls[0][1]
    expect(payload.title).toBe('Formulário seguro')
    expect(payload.questions.at(-1)).toEqual(expect.objectContaining({ label: 'Pergunta segura', type: 'text' }))
    expect(payload.questions.at(-1)).not.toHaveProperty('options')
  })

  it('locks mutations during assignment and prevents an unchanged duplicate send', async () => {
    window.history.replaceState(null, '', '/#/form-builder')
    let resolveAssignment!: (value: string) => void
    mocks.assignAnamnesis.mockReturnValueOnce(new Promise<string>((resolve) => { resolveAssignment = resolve }))

    render(<PrototypeProvider lockedRole="trainer"><FormDraftRouteHarness /></PrototypeProvider>)
    const title = await screen.findByLabelText('TÍTULO DO FORMULÁRIO')
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/i }))
    await waitFor(() => expect(mocks.assignAnamnesis).toHaveBeenCalledTimes(1))

    expect(title).toBeDisabled()
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Revisar lacunas/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Adicionar pergunta/i })).toBeDisabled()
    expect(screen.getAllByPlaceholderText('Escreva uma pergunta clara...')[0]).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/i }))
    expect(mocks.assignAnamnesis).toHaveBeenCalledTimes(1)

    await act(async () => { resolveAssignment('cccccccc-cccc-4ccc-8ccc-cccccccccccc'); await Promise.resolve() })
    expect(await screen.findByText('Anamnese atribuída.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Enviado$/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^Enviado$/i }))
    expect(mocks.assignAnamnesis).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Sair do formulário' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao formulário' }))
    expect(await screen.findByRole('button', { name: /^Enviado$/i })).toBeDisabled()
    expect(mocks.assignAnamnesis).toHaveBeenCalledTimes(1)
  })

  it('reuses the same assignment key when an unchanged failure is retried', async () => {
    mocks.assignAnamnesis
      .mockRejectedValueOnce(new Error('Falha temporária no envio.'))
      .mockResolvedValueOnce('cccccccc-cccc-4ccc-8ccc-cccccccccccc')

    render(<PrototypeProvider lockedRole="trainer"><LiveFormBuilderScreen /></PrototypeProvider>)
    expect(await screen.findByDisplayValue('Nova anamnese')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/i }))
    expect(await screen.findByText('Falha temporária no envio.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/i }))
    await waitFor(() => expect(mocks.assignAnamnesis).toHaveBeenCalledTimes(2))

    expect(mocks.assignAnamnesis.mock.calls[0][1].idempotencyKey).toBe(mocks.assignAnamnesis.mock.calls[1][1].idempotencyKey)
    expect(await screen.findByText('Anamnese atribuída.')).toBeInTheDocument()
  })

  it('preserves a newer route-restored draft after an older send finishes late', async () => {
    window.history.replaceState(null, '', '/#/form-builder')
    let resolveAssignment!: (value: string) => void
    mocks.assignAnamnesis.mockReturnValueOnce(new Promise<string>((resolve) => { resolveAssignment = resolve }))

    render(<PrototypeProvider lockedRole="trainer"><FormDraftRouteHarness /></PrototypeProvider>)
    const title = await screen.findByLabelText('TÍTULO DO FORMULÁRIO')
    fireEvent.change(title, { target: { value: 'Versão em envio' } })
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/i }))
    await waitFor(() => expect(mocks.assignAnamnesis).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Sair do formulário' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao formulário' }))
    expect(await screen.findByDisplayValue('Versão em envio')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('TÍTULO DO FORMULÁRIO'), { target: { value: 'Versão mais nova' } })

    await act(async () => { resolveAssignment('cccccccc-cccc-4ccc-8ccc-cccccccccccc'); await Promise.resolve() })
    expect(screen.getByDisplayValue('Versão mais nova')).toBeInTheDocument()
    expect(screen.getByText('form-rascunhos:1')).toBeInTheDocument()
    expect(screen.queryByText('Anamnese atribuída.')).not.toBeInTheDocument()
  })
})

describe('live anamnesis history isolation', () => {
  it('discards a slower history response after the trainer changes students', async () => {
    const marinaAssignment = historyAssignment('11111111-aaaa-4111-8111-111111111111', studentId, 'Histórico antigo da Marina')
    const biancaAssignment = historyAssignment('22222222-aaaa-4222-8222-222222222222', secondStudentId, 'Histórico atual da Bianca')
    let resolveMarinaAssignments!: (value: { items: AnamnesisAssignment[]; nextCursor: null }) => void
    let resolveMarinaSubmissions!: (value: { items: AnamnesisSubmission[]; nextCursor: null }) => void

    mocks.listEnrolledStudents.mockResolvedValue([
      { userId: studentId, displayName: 'Marina Costa', joinedAt: '2026-08-01T12:00:00.000Z' },
      { userId: secondStudentId, displayName: 'Bianca Souza', joinedAt: '2026-08-02T12:00:00.000Z' },
    ])
    mocks.listAnamnesisAssignments.mockImplementation(async (_scope, activeStudentId) => {
      if (activeStudentId === studentId) return new Promise<{ items: AnamnesisAssignment[]; nextCursor: null }>((resolve) => { resolveMarinaAssignments = resolve })
      return { items: [biancaAssignment], nextCursor: null }
    })
    mocks.listAnamnesisSubmissions.mockImplementation(async (_scope, activeStudentId) => {
      if (activeStudentId === studentId) return new Promise<{ items: AnamnesisSubmission[]; nextCursor: null }>((resolve) => { resolveMarinaSubmissions = resolve })
      return { items: [], nextCursor: null }
    })

    render(<PrototypeProvider lockedRole="trainer"><LiveTrainerFormsScreen /></PrototypeProvider>)
    await waitFor(() => expect(mocks.listAnamnesisAssignments).toHaveBeenCalledWith(expect.anything(), studentId, { limit: 30 }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: secondStudentId } })
    expect(await screen.findByText('Histórico atual da Bianca')).toBeInTheDocument()

    await act(async () => {
      resolveMarinaAssignments({ items: [marinaAssignment], nextCursor: null })
      resolveMarinaSubmissions({ items: [], nextCursor: null })
      await Promise.resolve()
    })

    expect(screen.getByText('Histórico atual da Bianca')).toBeInTheDocument()
    expect(screen.queryByText('Histórico antigo da Marina')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue(secondStudentId)
  })

  it('closes an open response drawer when the active student changes', async () => {
    const marinaAssignment = historyAssignment('33333333-aaaa-4333-8333-333333333333', studentId, 'Resposta da Marina')
    const marinaSubmission = historySubmission('44444444-aaaa-4444-8444-444444444444', marinaAssignment.id, studentId)
    const biancaAssignment = historyAssignment('55555555-aaaa-4555-8555-555555555555', secondStudentId, 'Pendência da Bianca')

    mocks.listEnrolledStudents.mockResolvedValue([
      { userId: studentId, displayName: 'Marina Costa', joinedAt: '2026-08-01T12:00:00.000Z' },
      { userId: secondStudentId, displayName: 'Bianca Souza', joinedAt: '2026-08-02T12:00:00.000Z' },
    ])
    mocks.listAnamnesisAssignments.mockImplementation(async (_scope, activeStudentId) => ({
      items: [activeStudentId === studentId ? marinaAssignment : biancaAssignment],
      nextCursor: null,
    }))
    mocks.listAnamnesisSubmissions.mockImplementation(async (_scope, activeStudentId) => ({
      items: activeStudentId === studentId ? [marinaSubmission] : [],
      nextCursor: null,
    }))

    render(<PrototypeProvider lockedRole="trainer"><LiveTrainerFormsScreen /></PrototypeProvider>)
    fireEvent.click(await screen.findByRole('button', { name: /Resposta da Marina/i }))
    expect(screen.getByRole('dialog', { name: /Respostas de Marina Costa/i })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: secondStudentId } })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Respostas de Marina Costa/i })).not.toBeInTheDocument())
    expect(await screen.findByText('Pendência da Bianca')).toBeInTheDocument()
  })
})
