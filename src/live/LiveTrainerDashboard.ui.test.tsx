import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EloAppProvider } from '../app-state'
import type { PainReport, PainReportEvent, PainReportLifecycleSummary } from '../signals'
import { LiveTrainerDashboard } from './LiveTrainerDashboard'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  listEnrolledStudents: vi.fn(),
  service: {
    listTrainerPainReports: vi.fn(),
    listWorkspaceReports: vi.fn(),
    getPainReport: vi.fn(),
    listPainReportTimeline: vi.fn(),
    acknowledgePainReport: vi.fn(),
    resolvePainReport: vi.fn(),
  },
}))

vi.mock('../auth/auth-context', () => ({ useAuth: mocks.useAuth }))
vi.mock('../onboarding/enrollment-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../onboarding/enrollment-service')>(),
  listEnrolledStudents: mocks.listEnrolledStudents,
}))
vi.mock('../signals', async (importOriginal) => ({
  ...await importOriginal<typeof import('../signals')>(),
  createSignalService: () => mocks.service,
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

const report: PainReportLifecycleSummary = {
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
  status: 'open',
  acknowledgedAt: null,
  resolvedAt: null,
  resolutionNote: null,
}

const detail: PainReport = {
  id: report.id,
  sequence: report.sequence,
  workspaceId,
  studentUserId: studentId,
  region: report.region,
  side: report.side,
  movement: report.movement,
  timing: report.timing,
  intensity: report.intensity,
  onset: report.onset,
  redFlags: report.redFlags,
  createdAt: report.createdAt,
  detail: 'Dor ao chegar no fundo do movimento.',
}

const resolvedEvent: PainReportEvent = {
  id: '55555555-5555-4555-8555-555555555555',
  sequence: 1,
  painReportId: reportId,
  workspaceId,
  studentUserId: studentId,
  actorUserId: trainerId,
  action: 'resolved',
  note: 'Vamos adaptar a amplitude e acompanhar amanhã.',
  createdAt: timestamp,
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/#/dashboard')
  mocks.useAuth.mockReturnValue({
    profile: { id: trainerId, accountRole: 'trainer', displayName: 'André Lima' },
    membership: { workspaceId, workspaceName: 'Studio Elo', membershipRole: 'trainer', trainerName: 'André Lima' },
  })
  mocks.listEnrolledStudents.mockResolvedValue([{ userId: studentId, displayName: 'Marina Costa', joinedAt: timestamp }])
  mocks.service.listTrainerPainReports
    .mockResolvedValueOnce({ items: [report], nextOffset: null })
    .mockResolvedValueOnce({ items: [], nextOffset: null })
  mocks.service.getPainReport.mockResolvedValue(detail)
  mocks.service.listPainReportTimeline
    .mockResolvedValueOnce({ items: [], nextOffset: null })
    .mockResolvedValueOnce({ items: [resolvedEvent], nextOffset: null })
  mocks.service.resolvePainReport.mockResolvedValue(resolvedEvent.id)
})

describe('live trainer dashboard pain lifecycle', () => {
  it('loads only unresolved lifecycle summaries and removes a resolved report after review', async () => {
    render(<EloAppProvider lockedRole="trainer"><LiveTrainerDashboard /></EloAppProvider>)

    expect(await screen.findByText('Marina Costa')).toBeInTheDocument()
    expect(mocks.service.listTrainerPainReports).toHaveBeenCalledWith(workspaceId, {
      unresolvedOnly: true,
      limit: 40,
    })
    expect(mocks.service.listWorkspaceReports).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Marina Costa').closest('button')!)
    expect(await screen.findByRole('heading', { name: 'Relato de Marina Costa' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: /Retorno de resolução/i }), {
      target: { value: 'Vamos adaptar a amplitude e acompanhar amanhã.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Resolver e avisar o aluno/i }))

    await waitFor(() => expect(mocks.service.resolvePainReport).toHaveBeenCalledTimes(1))
    expect(mocks.service.resolvePainReport).toHaveBeenCalledWith(expect.objectContaining({
      painReportId: reportId,
      resolutionNote: 'Vamos adaptar a amplitude e acompanhar amanhã.',
    }))
    await waitFor(() => expect(mocks.service.listTrainerPainReports).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'Nenhum relato de dor recebido.' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Relato de Marina Costa' })).not.toBeInTheDocument()
  })

  it('does not render a late workspace response after the professional scope changes', async () => {
    const oldRoster = deferred<Array<{ userId: string; displayName: string; joinedAt: string }>>()
    const oldReports = deferred<{ items: PainReportLifecycleSummary[]; nextOffset: null }>()
    const otherWorkspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const otherStudentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const otherReport = {
      ...report,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      workspaceId: otherWorkspaceId,
      studentUserId: otherStudentId,
      region: 'Ombro de Bianca',
    }
    mocks.listEnrolledStudents.mockReset()
      .mockReturnValueOnce(oldRoster.promise)
      .mockResolvedValueOnce([{ userId: otherStudentId, displayName: 'Bianca Rocha', joinedAt: timestamp }])
    mocks.service.listTrainerPainReports.mockReset()
      .mockReturnValueOnce(oldReports.promise)
      .mockResolvedValueOnce({ items: [otherReport], nextOffset: null })
    const view = render(<EloAppProvider lockedRole="trainer"><LiveTrainerDashboard /></EloAppProvider>)

    mocks.useAuth.mockReturnValue({
      profile: { id: trainerId, accountRole: 'trainer', displayName: 'André Lima' },
      membership: { workspaceId: otherWorkspaceId, workspaceName: 'Outro Studio', membershipRole: 'trainer', trainerName: 'André Lima' },
    })
    view.rerender(<EloAppProvider lockedRole="trainer"><LiveTrainerDashboard /></EloAppProvider>)
    expect(await screen.findByText('Bianca Rocha')).toBeInTheDocument()

    await act(async () => {
      oldRoster.resolve([{ userId: studentId, displayName: 'Marina Privada', joinedAt: timestamp }])
      oldReports.resolve({ items: [report], nextOffset: null })
      await Promise.resolve()
    })
    expect(screen.getByText('Bianca Rocha')).toBeInTheDocument()
    expect(screen.queryByText('Marina Privada')).not.toBeInTheDocument()
    expect(screen.queryByText('Joelho direito')).not.toBeInTheDocument()
  })
})
