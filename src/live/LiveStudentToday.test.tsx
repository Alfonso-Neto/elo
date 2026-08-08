import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrototypeProvider } from '../prototype-context'
import type { PainReportEvent, PainReportSummary } from '../signals'
import { LiveStudentTodayScreen } from './LiveStudentTraining'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getLatestWorkoutVersion: vi.fn(),
  getLatestAnamnesisAssignment: vi.fn(),
  listAnamnesisSubmissions: vi.fn(),
  signals: {
    listOwnReports: vi.fn(),
    listPainReportTimeline: vi.fn(),
  },
  nutrition: {
    loadDashboard: vi.fn(),
  },
  operations: {
    listScheduleSessions: vi.fn(),
    listScheduleSlots: vi.fn(),
  },
}))

vi.mock('../auth/auth-context', () => ({ useAuth: mocks.useAuth }))
vi.mock('./training', async (importOriginal) => ({
  ...await importOriginal<typeof import('./training')>(),
  getLatestWorkoutVersion: mocks.getLatestWorkoutVersion,
  getLatestAnamnesisAssignment: mocks.getLatestAnamnesisAssignment,
  listAnamnesisSubmissions: mocks.listAnamnesisSubmissions,
}))
vi.mock('../signals', async (importOriginal) => ({
  ...await importOriginal<typeof import('../signals')>(),
  createSignalService: () => mocks.signals,
}))
vi.mock('./nutrition', async (importOriginal) => ({
  ...await importOriginal<typeof import('./nutrition')>(),
  createNutritionService: () => mocks.nutrition,
}))
vi.mock('./operations', async (importOriginal) => ({
  ...await importOriginal<typeof import('./operations')>(),
  createOperationsService: () => mocks.operations,
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const trainerId = '22222222-2222-4222-8222-222222222222'
const studentId = '33333333-3333-4333-8333-333333333333'
const reportId = '44444444-4444-4444-8444-444444444444'
const timestamp = '2026-08-08T12:00:00.000Z'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

const report: PainReportSummary = {
  id: reportId,
  sequence: 1,
  workspaceId,
  studentUserId: studentId,
  region: 'Joelho direito',
  side: 'right',
  movement: 'Agachamento',
  timing: 'during_activity',
  intensity: 7,
  onset: timestamp,
  redFlags: [],
  createdAt: timestamp,
}

const resolvedEvent: PainReportEvent = {
  id: '55555555-5555-4555-8555-555555555555',
  sequence: 2,
  painReportId: reportId,
  workspaceId,
  studentUserId: studentId,
  actorUserId: trainerId,
  action: 'resolved',
  note: 'Vamos adaptar a amplitude e acompanhar amanhã.',
  createdAt: timestamp,
}

const acknowledgedEvent: PainReportEvent = {
  ...resolvedEvent,
  id: '66666666-6666-4666-8666-666666666666',
  sequence: 1,
  action: 'acknowledged',
  note: 'Vi seu relato e vou avaliar o movimento.',
}

function renderToday() {
  return render(<PrototypeProvider lockedRole="student"><LiveStudentTodayScreen /></PrototypeProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/#/student')
  mocks.useAuth.mockReturnValue({
    membership: { workspaceId, workspaceName: 'Studio Elo', membershipRole: 'student', trainerName: 'André Lima' },
    profile: { id: studentId, accountRole: 'student', displayName: 'Marina Costa' },
  })
  mocks.getLatestWorkoutVersion.mockResolvedValue(null)
  mocks.getLatestAnamnesisAssignment.mockResolvedValue(null)
  mocks.listAnamnesisSubmissions.mockResolvedValue({ items: [], nextOffset: null })
  mocks.signals.listOwnReports.mockResolvedValue({ items: [report], nextOffset: null })
  mocks.signals.listPainReportTimeline.mockResolvedValue({ items: [resolvedEvent], nextOffset: null })
  mocks.nutrition.loadDashboard.mockResolvedValue({
    consent: 'not_recorded',
    plan: null,
    mealEvents: [],
    hydrationEvents: [],
  })
  mocks.operations.listScheduleSessions.mockResolvedValue({ items: [], nextOffset: null })
  mocks.operations.listScheduleSlots.mockResolvedValue({ items: [], nextOffset: null })
})

describe('student-visible pain resolution feedback', () => {
  it('shows the professor resolution with an explicit protected-history disclosure', async () => {
    renderToday()

    expect(await screen.findByRole('heading', { name: 'Retorno do seu professor' })).toBeInTheDocument()
    expect(screen.getByText('Joelho direito')).toBeInTheDocument()
    expect(screen.getByText('Vamos adaptar a amplitude e acompanhar amanhã.')).toBeInTheDocument()
    expect(screen.getByText('Esta atualização fica visível no seu histórico protegido.')).toBeInTheDocument()
    expect(mocks.signals.listPainReportTimeline).toHaveBeenCalledWith(reportId, { limit: 50 })
  })

  it('does not present an acknowledgement note as a resolution', async () => {
    mocks.signals.listPainReportTimeline.mockResolvedValue({ items: [acknowledgedEvent], nextOffset: null })

    renderToday()

    expect(await screen.findByRole('heading', { name: 'Oi, Marina.' })).toBeInTheDocument()
    await waitFor(() => expect(mocks.signals.listPainReportTimeline).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('heading', { name: 'Retorno do seu professor' })).not.toBeInTheDocument()
    expect(screen.queryByText('Vi seu relato e vou avaliar o movimento.')).not.toBeInTheDocument()
  })

  it('removes private resolution content immediately when student access is lost', async () => {
    const view = renderToday()

    expect(await screen.findByText('Vamos adaptar a amplitude e acompanhar amanhã.')).toBeInTheDocument()
    mocks.useAuth.mockReturnValue({ membership: null, profile: null })
    view.rerender(<PrototypeProvider lockedRole="student"><LiveStudentTodayScreen /></PrototypeProvider>)

    expect(screen.getByRole('heading', { name: 'Resumo indisponível.' })).toBeInTheDocument()
    expect(screen.queryByText('Vamos adaptar a amplitude e acompanhar amanhã.')).not.toBeInTheDocument()
    expect(screen.queryByText('Joelho direito')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Oi, Marina.' })).not.toBeInTheDocument()
  })

  it('never restores a late resolution after authentication disappears', async () => {
    const timeline = deferred<{ items: PainReportEvent[]; nextOffset: null }>()
    mocks.signals.listPainReportTimeline.mockReturnValueOnce(timeline.promise)
    const view = renderToday()

    await waitFor(() => expect(mocks.signals.listPainReportTimeline).toHaveBeenCalledTimes(1))
    mocks.useAuth.mockReturnValue({ membership: null, profile: null })
    view.rerender(<PrototypeProvider lockedRole="student"><LiveStudentTodayScreen /></PrototypeProvider>)
    expect(screen.getByRole('heading', { name: 'Resumo indisponível.' })).toBeInTheDocument()

    await act(async () => {
      timeline.resolve({ items: [resolvedEvent], nextOffset: null })
      await timeline.promise
    })
    expect(screen.getByRole('heading', { name: 'Resumo indisponível.' })).toBeInTheDocument()
    expect(screen.queryByText('Vamos adaptar a amplitude e acompanhar amanhã.')).not.toBeInTheDocument()
    expect(screen.queryByText('Joelho direito')).not.toBeInTheDocument()
  })

  it.each([
    ['report workspace', { report: { ...report, workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, event: resolvedEvent }],
    ['report student', { report: { ...report, studentUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, event: resolvedEvent }],
    ['event workspace', { report, event: { ...resolvedEvent, workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }],
    ['event student', { report, event: { ...resolvedEvent, studentUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } }],
  ])('fails closed for a mismatched %s', async (_case, values) => {
    mocks.signals.listOwnReports.mockResolvedValue({ items: [values.report], nextOffset: null })
    mocks.signals.listPainReportTimeline.mockResolvedValue({ items: [values.event], nextOffset: null })

    renderToday()

    expect(await screen.findByRole('heading', { name: 'Não foi possível abrir este conteúdo.' })).toBeInTheDocument()
    expect(screen.queryByText('Vamos adaptar a amplitude e acompanhar amanhã.')).not.toBeInTheDocument()
    expect(screen.queryByText('Joelho direito')).not.toBeInTheDocument()
  })
})
