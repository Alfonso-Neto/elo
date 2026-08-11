import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EloAppProvider, useEloApp } from '../app-state'
import { LiveStudentWorkoutScreen } from './LiveStudentTraining'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getLatestWorkoutVersion: vi.fn(),
  completeWorkoutVersion: vi.fn(),
}))

vi.mock('../auth/auth-context', () => ({ useAuth: mocks.useAuth }))
vi.mock('./training', async (importOriginal) => ({
  ...await importOriginal<typeof import('./training')>(),
  getLatestWorkoutVersion: mocks.getLatestWorkoutVersion,
  completeWorkoutVersion: mocks.completeWorkoutVersion,
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const studentId = '33333333-3333-4333-8333-333333333333'
const workoutVersion = {
  id: '55555555-5555-4555-8555-555555555555', workspaceId, studentUserId: studentId,
  publishedByUserId: '22222222-2222-4222-8222-222222222222', publishedByRole: 'trainer' as const, versionNumber: 2,
  title: 'Inferiores', publishedAt: '2026-08-07T12:00:00.000Z',
  exercises: [{
    id: 'bulgarian', name: 'Agachamento búlgaro', muscle: 'Quadríceps', sets: '3', reps: '10', load: '16 kg',
    rest: '75s', tempo: '3-1-1', rir: '2', note: 'Mantenha o movimento confortável.',
  }],
}
const secondWorkoutVersion = {
  ...workoutVersion,
  id: '66666666-6666-4666-8666-666666666666',
  versionNumber: 3,
  title: 'Superiores',
  publishedAt: '2026-08-08T12:00:00.000Z',
  exercises: [{
    id: 'row', name: 'Remada sentada', muscle: 'Costas', sets: '3', reps: '12', load: '24 kg',
    rest: '60s', tempo: '2-0-2', rir: '2', note: '',
  }],
}

function EntryProbe() {
  const { assistantEntry, page } = useEloApp()
  return <output>{`${page}:${assistantEntry?.movement ?? 'sem-contexto'}`}</output>
}

function SessionProbe() {
  const { studentWorkoutPinnedVersions, studentWorkoutSessionDrafts } = useEloApp()
  const sessions = Object.values(studentWorkoutSessionDrafts)
  return <>
    <output>{`student-sessions:${sessions.length}:${sessions[0]?.completion.state ?? 'none'}`}</output>
    <output>{`workout-pins:${Object.keys(studentWorkoutPinnedVersions).length}`}</output>
  </>
}

function WorkoutRouteHarness() {
  const { assistantEntry, navigate, page, studentWorkoutPinnedVersions, studentWorkoutSessionDrafts } = useEloApp()
  const sessions = Object.values(studentWorkoutSessionDrafts)
  return <>
    <output>{`student-sessions:${sessions.length}:${sessions[0]?.completion.state ?? 'none'}`}</output>
    <output>{`workout-pins:${Object.keys(studentWorkoutPinnedVersions).length}`}</output>
    {page === 'workout'
      ? <><button onClick={() => navigate('assistant')}>Sair do treino</button><LiveStudentWorkoutScreen /></>
      : <><output>{`${page}:${assistantEntry?.movement ?? 'sem-contexto'}`}</output><button onClick={() => navigate('workout')}>Voltar ao treino</button></>}
  </>
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/#/workout')
  mocks.useAuth.mockReturnValue({
    membership: { workspaceId, workspaceName: 'Studio Elo', membershipRole: 'student', trainerName: 'André Lima' },
    profile: { id: studentId, accountRole: 'student', displayName: 'Marina Costa' },
  })
  mocks.getLatestWorkoutVersion.mockResolvedValue(workoutVersion)
  mocks.completeWorkoutVersion.mockResolvedValue('77777777-7777-4777-8777-777777777777')
})

afterEach(() => vi.restoreAllMocks())

describe('authenticated student workout', () => {
  it('opens a transient exercise-scoped pain report without browser persistence', async () => {
    render(<EloAppProvider lockedRole="student"><LiveStudentWorkoutScreen /><EntryProbe /></EloAppProvider>)

    const exerciseTitle = await screen.findByText('Agachamento búlgaro')
    fireEvent.click(exerciseTitle.closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: /Senti dor neste exercício/i }))

    expect(screen.getByText('assistant:Agachamento búlgaro')).toBeInTheDocument()
    expect(window.location.hash).toBe('#/assistant')
    expect(JSON.stringify({ ...localStorage })).not.toContain('Agachamento búlgaro')
  })

  it('restores exercise progress, a running timer, and feedback after the pain assistant', async () => {
    const startedAt = 1_722_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(startedAt)
    render(<EloAppProvider lockedRole="student"><WorkoutRouteHarness /></EloAppProvider>)

    const exerciseTitle = await screen.findByText('Agachamento búlgaro')
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Concluir Agachamento búlgaro' }))
    fireEvent.click(screen.getByRole('button', { name: /Finalizar e enviar feedback/i }))

    let dialog = screen.getByRole('dialog', { name: 'Como foi para você?' })
    fireEvent.change(within(dialog).getByLabelText(/Esforço percebido/i), { target: { value: '9' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pesado' }))
    fireEvent.change(within(dialog).getByLabelText(/Quer acrescentar algo/i), { target: { value: 'Retomei com amplitude menor.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))

    fireEvent.click(exerciseTitle.closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: /Senti dor neste exercício/i }))
    expect(screen.getByText('assistant:Agachamento búlgaro')).toBeInTheDocument()
    expect(screen.getByText('student-sessions:1:idle')).toBeInTheDocument()
    expect(screen.getByText('workout-pins:1')).toBeInTheDocument()

    vi.mocked(Date.now).mockReturnValue(startedAt + 12_000)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao treino' }))

    expect(await screen.findByRole('button', { name: 'Desmarcar Agachamento búlgaro' })).toBeInTheDocument()
    expect(screen.getByText('00:12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Finalizar e enviar feedback/i }))
    dialog = screen.getByRole('dialog', { name: 'Como foi para você?' })
    expect(within(dialog).getByLabelText(/Esforço percebido/i)).toHaveValue('9')
    expect(within(dialog).getByRole('button', { name: 'Pesado' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByLabelText(/Quer acrescentar algo/i)).toHaveValue('Retomei com amplitude menor.')
    expect(JSON.stringify({ ...localStorage })).not.toContain('Retomei com amplitude menor.')
  })

  it('pins an active workout version until its exact completion succeeds', async () => {
    mocks.getLatestWorkoutVersion.mockReset()
      .mockResolvedValueOnce(workoutVersion)
      .mockResolvedValueOnce(secondWorkoutVersion)
    render(<EloAppProvider lockedRole="student"><WorkoutRouteHarness /></EloAppProvider>)

    expect(await screen.findByText('Agachamento búlgaro')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Concluir Agachamento búlgaro' }))
    fireEvent.click(screen.getByRole('button', { name: /Finalizar e enviar feedback/i }))
    let dialog = screen.getByRole('dialog', { name: 'Como foi para você?' })
    fireEvent.change(within(dialog).getByLabelText(/Quer acrescentar algo/i), { target: { value: 'Rascunho exclusivo da V2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))

    fireEvent.click(screen.getByRole('button', { name: 'Sair do treino' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao treino' }))
    expect(await screen.findByRole('button', { name: 'Desmarcar Agachamento búlgaro' })).toBeInTheDocument()
    expect(mocks.getLatestWorkoutVersion).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Finalizar e enviar feedback/i }))
    dialog = screen.getByRole('dialog', { name: 'Como foi para você?' })
    expect(within(dialog).getByLabelText(/Quer acrescentar algo/i)).toHaveValue('Rascunho exclusivo da V2')
    fireEvent.click(within(dialog).getByRole('button', { name: /Registrar conclusão/i }))

    expect(await screen.findByRole('heading', { name: 'Feedback entregue.' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('workout-pins:0')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para hoje' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao treino' }))
    expect(await screen.findByRole('button', { name: 'Concluir Remada sentada' })).toBeInTheDocument()
    expect(mocks.getLatestWorkoutVersion).toHaveBeenCalledTimes(2)
    expect(screen.getByText('0 de 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Finalizar e enviar feedback/i }))
    dialog = screen.getByRole('dialog', { name: 'Como foi para você?' })
    expect(within(dialog).getByLabelText(/Quer acrescentar algo/i)).toHaveValue('')
  })

  it('reuses the completion key after failure and clears only the successful snapshot', async () => {
    mocks.completeWorkoutVersion
      .mockRejectedValueOnce(new Error('Falha temporária na conclusão.'))
      .mockResolvedValueOnce('77777777-7777-4777-8777-777777777777')
    render(<EloAppProvider lockedRole="student"><LiveStudentWorkoutScreen /><SessionProbe /></EloAppProvider>)

    expect(await screen.findByText('Agachamento búlgaro')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Finalizar e enviar feedback/i }))
    const dialog = screen.getByRole('dialog', { name: 'Como foi para você?' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Registrar conclusão/i }))
    await waitFor(() => expect(mocks.completeWorkoutVersion).toHaveBeenCalledTimes(1))
    expect(await within(dialog).findByText('Falha temporária na conclusão.')).toBeInTheDocument()
    expect(screen.getByText('student-sessions:1:idle')).toBeInTheDocument()
    expect(screen.getByText('workout-pins:1')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: /Registrar conclusão/i }))
    await waitFor(() => expect(mocks.completeWorkoutVersion).toHaveBeenCalledTimes(2))
    expect(mocks.completeWorkoutVersion.mock.calls[0][1].idempotencyKey)
      .toBe(mocks.completeWorkoutVersion.mock.calls[1][1].idempotencyKey)
    expect(await screen.findByRole('heading', { name: 'Feedback entregue.' })).toBeInTheDocument()
    expect(screen.getByText('student-sessions:1:succeeded')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('workout-pins:0')).toBeInTheDocument())
    expect(screen.getByText(/esforço 7\/10 · 0 exercícios marcados/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rever treino/i })).not.toBeInTheDocument()
  })

  it('keeps completion locked across a remount and surfaces the old request success', async () => {
    let resolveCompletion!: (value: string) => void
    mocks.completeWorkoutVersion.mockReturnValueOnce(new Promise<string>((resolve) => { resolveCompletion = resolve }))
    render(<EloAppProvider lockedRole="student"><WorkoutRouteHarness /></EloAppProvider>)

    expect(await screen.findByText('Agachamento búlgaro')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Finalizar e enviar feedback/i }))
    let dialog = screen.getByRole('dialog', { name: 'Como foi para você?' })
    fireEvent.change(within(dialog).getByLabelText(/Quer acrescentar algo/i), { target: { value: 'Rascunho enviado' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Registrar conclusão/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Registrar conclusão/i }))
    await waitFor(() => expect(mocks.completeWorkoutVersion).toHaveBeenCalledTimes(1))
    expect(screen.getByText('student-sessions:1:pending')).toBeInTheDocument()
    expect(screen.getByText('workout-pins:1')).toBeInTheDocument()

    expect(within(dialog).getByLabelText(/Esforço percebido/i)).toBeDisabled()
    expect(within(dialog).getByLabelText(/Quer acrescentar algo/i)).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Pesado' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: /Registrar conclusão/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Começar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Concluir Agachamento búlgaro' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Sair do treino' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao treino' }))
    expect(await screen.findByText('Agachamento búlgaro')).toBeInTheDocument()
    dialog = screen.getByRole('dialog', { name: 'Como foi para você?' })
    expect(within(dialog).getByLabelText(/Quer acrescentar algo/i)).toHaveValue('Rascunho enviado')
    expect(within(dialog).getByLabelText(/Quer acrescentar algo/i)).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: /Registrar conclusão/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Começar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Concluir Agachamento búlgaro' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Finalizar e enviar feedback/i })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: /Registrar conclusão/i }))
    expect(mocks.completeWorkoutVersion).toHaveBeenCalledTimes(1)

    await act(async () => { resolveCompletion('77777777-7777-4777-8777-777777777777'); await Promise.resolve() })
    expect(await screen.findByRole('heading', { name: 'Feedback entregue.' })).toBeInTheDocument()
    expect(screen.getByText('student-sessions:1:succeeded')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('workout-pins:0')).toBeInTheDocument())
    expect(screen.getByText(/esforço 7\/10 · 0 exercícios marcados/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rever treino/i })).not.toBeInTheDocument()
  })

  it('hides the loaded workout immediately when student access is lost', async () => {
    const view = render(<EloAppProvider lockedRole="student"><LiveStudentWorkoutScreen /></EloAppProvider>)

    expect(await screen.findByText('Agachamento búlgaro')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Finalizar e enviar feedback/i }))
    fireEvent.change(screen.getByLabelText(/Quer acrescentar algo/i), { target: { value: 'Contexto privado do treino' } })

    mocks.useAuth.mockReturnValue({
      membership: { workspaceId, workspaceName: 'Studio Elo', membershipRole: 'trainer', trainerName: 'André Lima' },
      profile: { id: studentId, accountRole: 'student', displayName: 'Marina Costa' },
    })
    view.rerender(<EloAppProvider lockedRole="student"><LiveStudentWorkoutScreen /></EloAppProvider>)

    expect(screen.getByRole('heading', { name: 'Treino indisponível.' })).toBeInTheDocument()
    expect(screen.queryByText('Agachamento búlgaro')).not.toBeInTheDocument()
    expect(screen.queryByText('Contexto privado do treino')).not.toBeInTheDocument()
  })

  it('never restores a stale workout after authentication disappears', async () => {
    let resolveWorkout!: (value: typeof workoutVersion) => void
    mocks.getLatestWorkoutVersion.mockReturnValueOnce(new Promise((resolve) => { resolveWorkout = resolve }))
    const view = render(<EloAppProvider lockedRole="student"><LiveStudentWorkoutScreen /></EloAppProvider>)

    expect(screen.getByText('Carregando seu treino publicado...')).toBeInTheDocument()
    mocks.useAuth.mockReturnValue({ membership: null, profile: null })
    view.rerender(<EloAppProvider lockedRole="student"><LiveStudentWorkoutScreen /></EloAppProvider>)
    expect(screen.getByRole('heading', { name: 'Treino indisponível.' })).toBeInTheDocument()

    await act(async () => { resolveWorkout(workoutVersion); await Promise.resolve() })
    expect(screen.getByRole('heading', { name: 'Treino indisponível.' })).toBeInTheDocument()
    expect(screen.queryByText('Agachamento búlgaro')).not.toBeInTheDocument()
  })
})
