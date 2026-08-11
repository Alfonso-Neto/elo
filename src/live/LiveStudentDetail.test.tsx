import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EloAppProvider, useEloApp } from '../app-state'
import { MAX_SIGNAL_PAGE_SIZE, type PainReportLifecycleSummary } from '../signals'
import type { TrainerStudentNote, WorkoutVersion } from './training'
import { LiveStudentDetailScreen } from './LiveStudentDetail'

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }))
const enrollment = vi.hoisted(() => ({ listEnrolledStudents: vi.fn() }))
const signals = vi.hoisted(() => ({
  listTrainerPainReports: vi.fn(),
  listWorkspaceReports: vi.fn(),
}))
const training = vi.hoisted(() => ({
  createTrainerStudentNote: vi.fn(),
  getLatestWorkoutVersion: vi.fn(),
  listAnamnesisAssignments: vi.fn(),
  listAnamnesisSubmissions: vi.fn(),
  listTrainerStudentNotes: vi.fn(),
  listWorkoutCompletions: vi.fn(),
}))
const nutrition = vi.hoisted(() => ({ loadTrainerStudentDashboard: vi.fn() }))

const workspaceId = '23ccf1ec-a377-4b45-a401-11d28a8a1503'
const trainerId = 'a654f432-1a44-45ad-bf25-808674d483e6'
const marinaId = '0a258739-7658-4012-b747-0f95dca6372c'
const biancaId = '9a258739-7658-4012-b747-0f95dca6372d'
const roster = [
  { userId: marinaId, displayName: 'Marina Costa', joinedAt: null },
  { userId: biancaId, displayName: 'Bianca Rocha', joinedAt: null },
]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function workoutFor(studentUserId: string, title: string): WorkoutVersion {
  return {
    id: `${studentUserId}-workout`,
    workspaceId,
    studentUserId,
    publishedByUserId: trainerId,
    publishedByRole: 'trainer',
    versionNumber: 2,
    title,
    exercises: [],
    publishedAt: '2026-08-08T12:00:00.000Z',
  }
}

function reportFor(studentUserId: string, region: string): PainReportLifecycleSummary {
  return {
    id: `${studentUserId}-report`,
    sequence: 1,
    workspaceId,
    studentUserId,
    region,
    side: 'right',
    movement: 'Agachamento',
    timing: 'during_activity',
    intensity: 4,
    onset: '2026-08-08T11:00:00.000Z',
    redFlags: [],
    createdAt: '2026-08-08T12:00:00.000Z',
    status: 'open',
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionNote: null,
  }
}

function noteFor(studentUserId: string, note: string): TrainerStudentNote {
  return {
    id: `${studentUserId}-note`,
    workspaceId,
    studentUserId,
    authorUserId: trainerId,
    authorRole: 'trainer',
    note,
    createdAt: '2026-08-08T12:00:00.000Z',
  }
}

function DetailHarness() {
  const { selectedStudentId, setSelectedStudentId, toast } = useEloApp()
  return <>
    <output>{`selected:${selectedStudentId || 'none'}`}</output>
    <output>{toast ? `${toast.title}:${toast.message}` : 'no-toast'}</output>
    <button onClick={() => setSelectedStudentId(marinaId)}>Selecionar Marina</button>
    <button onClick={() => setSelectedStudentId(biancaId)}>Selecionar Bianca</button>
    <LiveStudentDetailScreen />
  </>
}

vi.mock('../auth/auth-context', () => ({ useAuth: auth.useAuth }))
vi.mock('../onboarding/enrollment-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../onboarding/enrollment-service')>()
  return { ...actual, listEnrolledStudents: enrollment.listEnrolledStudents }
})
vi.mock('../signals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../signals')>()
  return {
    ...actual,
    createSignalService: () => ({
      listTrainerPainReports: signals.listTrainerPainReports,
      listWorkspaceReports: signals.listWorkspaceReports,
    }),
  }
})
vi.mock('./training', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./training')>()
  return { ...actual, ...training }
})
vi.mock('./nutrition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./nutrition')>()
  return {
    ...actual,
    createNutritionService: () => ({ loadTrainerStudentDashboard: nutrition.loadTrainerStudentDashboard }),
  }
})

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, '', '#/student-detail')
  auth.useAuth.mockReturnValue({
    profile: { id: trainerId, displayName: 'André Lima', accountRole: 'trainer' },
    membership: { workspaceId, workspaceName: 'Studio Horizonte', membershipRole: 'owner', trainerName: 'André Lima' },
  })
  enrollment.listEnrolledStudents.mockResolvedValue(roster)
  signals.listTrainerPainReports.mockResolvedValue({ items: [], nextOffset: null })
  training.getLatestWorkoutVersion.mockResolvedValue(null)
  training.listWorkoutCompletions.mockResolvedValue({ items: [], nextCursor: null })
  training.listAnamnesisAssignments.mockResolvedValue({ items: [], nextCursor: null })
  training.listAnamnesisSubmissions.mockResolvedValue({ items: [], nextCursor: null })
  training.listTrainerStudentNotes.mockResolvedValue({ items: [], nextCursor: null })
  training.createTrainerStudentNote.mockResolvedValue(noteFor(marinaId, 'Observação registrada'))
  nutrition.loadTrainerStudentDashboard.mockResolvedValue({ plan: null, mealEvents: [], hydrationEvents: [] })
})

describe('live student detail privacy boundary', () => {
  it('uses the student-scoped health endpoint and does not reload the roster on target changes', async () => {
    signals.listTrainerPainReports.mockImplementation((_workspace: string, options: { studentUserId: string }) => Promise.resolve({
      items: [reportFor(options.studentUserId, options.studentUserId === marinaId ? 'Joelho da Marina' : 'Ombro da Bianca')],
      nextOffset: null,
    }))
    render(<EloAppProvider lockedRole="trainer"><DetailHarness /></EloAppProvider>)

    expect(await screen.findByRole('heading', { name: 'Marina Costa' })).toBeInTheDocument()
    expect(signals.listTrainerPainReports).toHaveBeenCalledWith(workspaceId, { studentUserId: marinaId, unresolvedOnly: false, limit: MAX_SIGNAL_PAGE_SIZE })
    expect(signals.listWorkspaceReports).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Bianca' }))
    expect(await screen.findByRole('heading', { name: 'Bianca Rocha' })).toBeInTheDocument()
    expect(signals.listTrainerPainReports).toHaveBeenCalledWith(workspaceId, { studentUserId: biancaId, unresolvedOnly: false, limit: MAX_SIGNAL_PAGE_SIZE })
    expect(enrollment.listEnrolledStudents).toHaveBeenCalledTimes(1)
  })

  it('cannot let a late Marina success overwrite Bianca’s detail page', async () => {
    const slowMarina = deferred<WorkoutVersion | null>()
    training.getLatestWorkoutVersion.mockImplementation((_scope: unknown, studentUserId: string) => (
      studentUserId === marinaId ? slowMarina.promise : Promise.resolve(workoutFor(biancaId, 'Plano seguro da Bianca'))
    ))
    render(<EloAppProvider lockedRole="trainer"><DetailHarness /></EloAppProvider>)

    await waitFor(() => expect(training.getLatestWorkoutVersion).toHaveBeenCalledWith(expect.anything(), marinaId))
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Bianca' }))
    expect(await screen.findByRole('heading', { name: 'Bianca Rocha' })).toBeInTheDocument()
    expect(screen.getAllByText('Plano seguro da Bianca').length).toBeGreaterThan(0)

    await act(async () => {
      slowMarina.resolve(workoutFor(marinaId, 'Plano privado da Marina'))
      await slowMarina.promise
    })
    expect(screen.getByRole('heading', { name: 'Bianca Rocha' })).toBeInTheDocument()
    expect(screen.queryByText('Plano privado da Marina')).not.toBeInTheDocument()
  })

  it('ignores a late Marina failure after Bianca is ready', async () => {
    const slowMarina = deferred<WorkoutVersion | null>()
    training.getLatestWorkoutVersion.mockImplementation((_scope: unknown, studentUserId: string) => (
      studentUserId === marinaId ? slowMarina.promise : Promise.resolve(workoutFor(biancaId, 'Plano da Bianca'))
    ))
    render(<EloAppProvider lockedRole="trainer"><DetailHarness /></EloAppProvider>)

    await waitFor(() => expect(training.getLatestWorkoutVersion).toHaveBeenCalledWith(expect.anything(), marinaId))
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Bianca' }))
    expect(await screen.findByRole('heading', { name: 'Bianca Rocha' })).toBeInTheDocument()
    await act(async () => {
      slowMarina.reject(new Error('Falha privada da Marina'))
      await slowMarina.promise.catch(() => undefined)
    })

    expect(screen.getByRole('heading', { name: 'Bianca Rocha' })).toBeInTheDocument()
    expect(screen.queryByText('O acompanhamento não abriu.')).not.toBeInTheDocument()
    expect(screen.queryByText('Falha privada da Marina')).not.toBeInTheDocument()
  })

  it('removes already-rendered private data immediately when trainer scope disappears', async () => {
    signals.listTrainerPainReports.mockResolvedValue({ items: [reportFor(marinaId, 'Segredo clínico da Marina')], nextOffset: null })
    training.listTrainerStudentNotes.mockResolvedValue({ items: [noteFor(marinaId, 'Observação privada da Marina')], nextCursor: null })
    const view = render(<EloAppProvider lockedRole="trainer"><DetailHarness /></EloAppProvider>)

    expect(await screen.findByText('Segredo clínico da Marina · intensidade 4/10')).toBeInTheDocument()
    expect(screen.getByText('Observação privada da Marina')).toBeInTheDocument()
    auth.useAuth.mockReturnValue({ profile: null, membership: null })
    view.rerender(<EloAppProvider lockedRole="trainer"><DetailHarness /></EloAppProvider>)

    expect(screen.getByRole('heading', { name: 'Acesso profissional indisponível.' })).toBeInTheDocument()
    expect(screen.queryByText('Segredo clínico da Marina · intensidade 4/10')).not.toBeInTheDocument()
    expect(screen.queryByText('Observação privada da Marina')).not.toBeInTheDocument()
  })

  it('keeps a late Marina note save from changing Bianca’s modal or reloading Marina', async () => {
    const slowSave = deferred<TrainerStudentNote>()
    training.createTrainerStudentNote.mockReturnValue(slowSave.promise)
    render(<EloAppProvider lockedRole="trainer"><DetailHarness /></EloAppProvider>)
    expect(await screen.findByRole('heading', { name: 'Marina Costa' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Adicionar observação/ }))
    const marinaNote = screen.getByRole('textbox', { name: 'Observação' })
    fireEvent.change(marinaNote, { target: { value: 'Nota somente da Marina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar no histórico' }))
    await waitFor(() => expect(training.createTrainerStudentNote).toHaveBeenCalledTimes(1))
    expect(marinaNote).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Bianca' }))
    expect(await screen.findByRole('heading', { name: 'Bianca Rocha' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Adicionar observação/ }))
    const biancaNote = screen.getByRole('textbox', { name: 'Observação' })
    expect(biancaNote).toHaveValue('')
    fireEvent.change(biancaNote, { target: { value: 'Rascunho novo da Bianca' } })
    await act(async () => {
      slowSave.resolve(noteFor(marinaId, 'Nota somente da Marina'))
      await slowSave.promise
    })

    expect(biancaNote).toHaveValue('Rascunho novo da Bianca')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('no-toast')).toBeInTheDocument()
    expect(training.getLatestWorkoutVersion.mock.calls.filter((call) => call[1] === marinaId)).toHaveLength(1)
    expect(training.createTrainerStudentNote).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      studentUserId: marinaId,
      note: 'Nota somente da Marina',
    }))
  })

  it('reuses one note idempotency key for an unchanged retry', async () => {
    enrollment.listEnrolledStudents.mockResolvedValue([roster[0]])
    training.createTrainerStudentNote
      .mockRejectedValueOnce(new Error('Falha temporária'))
      .mockResolvedValueOnce(noteFor(marinaId, 'Nota confirmada'))
    render(<EloAppProvider lockedRole="trainer"><DetailHarness /></EloAppProvider>)
    expect(await screen.findByRole('heading', { name: 'Marina Costa' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Adicionar observação/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Observação' }), { target: { value: 'Retomar progressão com cautela' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar no histórico' }))
    await screen.findByRole('alert')
    const retryButton = screen.getByRole('button', { name: 'Registrar no histórico' })
    await waitFor(() => expect(retryButton).not.toBeDisabled())
    fireEvent.click(retryButton)
    await waitFor(() => expect(training.createTrainerStudentNote).toHaveBeenCalledTimes(2))

    const first = training.createTrainerStudentNote.mock.calls[0][1]
    const second = training.createTrainerStudentNote.mock.calls[1][1]
    expect(second.idempotencyKey).toBe(first.idempotencyKey)
    expect(first.idempotencyKey).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
