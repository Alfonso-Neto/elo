import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EloAppProvider } from '../app-state'
import type { PainReportLifecycleSummary } from '../signals'
import { LiveTrainerCopilot } from './LiveTrainerCopilot'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  listEnrolledStudents: vi.fn(),
  getLatestWorkoutVersion: vi.fn(),
  listTrainerPainReports: vi.fn(),
  listWorkspaceReports: vi.fn(),
}))

vi.mock('../auth/auth-context', () => ({ useAuth: mocks.useAuth }))
vi.mock('../onboarding/enrollment-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../onboarding/enrollment-service')>(),
  listEnrolledStudents: mocks.listEnrolledStudents,
}))
vi.mock('../signals', async (importOriginal) => ({
  ...await importOriginal<typeof import('../signals')>(),
  createSignalService: () => ({
    listTrainerPainReports: mocks.listTrainerPainReports,
    listWorkspaceReports: mocks.listWorkspaceReports,
  }),
}))
vi.mock('./training', async (importOriginal) => ({
  ...await importOriginal<typeof import('./training')>(),
  getLatestWorkoutVersion: mocks.getLatestWorkoutVersion,
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const trainerId = '22222222-2222-4222-8222-222222222222'
const marinaId = '33333333-3333-4333-8333-333333333333'
const biancaId = '44444444-4444-4444-8444-444444444444'
const timestamp = '2026-08-08T12:00:00.000Z'

function report(studentUserId: string, id: string, region: string): PainReportLifecycleSummary {
  return {
    id,
    sequence: 1,
    workspaceId,
    studentUserId,
    region,
    side: 'right',
    movement: 'Agachamento',
    timing: 'during_activity',
    intensity: 6,
    onset: timestamp,
    redFlags: [],
    createdAt: timestamp,
    status: 'open',
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionNote: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/#/copilot')
  mocks.useAuth.mockReturnValue({
    profile: { id: trainerId, accountRole: 'trainer', displayName: 'André Lima' },
    membership: { workspaceId, workspaceName: 'Studio Elo', membershipRole: 'trainer', trainerName: 'André Lima' },
  })
  mocks.listEnrolledStudents.mockResolvedValue([
    { userId: marinaId, displayName: 'Marina Costa', joinedAt: timestamp },
    { userId: biancaId, displayName: 'Bianca Rocha', joinedAt: timestamp },
  ])
  mocks.listTrainerPainReports.mockResolvedValue({
    items: [
      report(marinaId, '55555555-5555-4555-8555-555555555555', 'Joelho da Marina'),
      report(biancaId, '66666666-6666-4666-8666-666666666666', 'Ombro da Bianca'),
    ],
    nextOffset: null,
  })
  mocks.getLatestWorkoutVersion.mockResolvedValue(null)
})

describe('live trainer Copilot signal boundary', () => {
  it('uses the unresolved lifecycle queue once and switches students without reloading the roster', async () => {
    render(<EloAppProvider lockedRole="trainer"><LiveTrainerCopilot /></EloAppProvider>)

    expect(await screen.findByText(/Joelho da Marina · Agachamento/i)).toBeInTheDocument()
    expect(mocks.listTrainerPainReports).toHaveBeenCalledWith(workspaceId, {
      unresolvedOnly: true,
      limit: 50,
    })
    expect(mocks.listWorkspaceReports).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: biancaId } })
    expect(await screen.findByText(/Ombro da Bianca · Agachamento/i)).toBeInTheDocument()
    expect(mocks.listEnrolledStudents).toHaveBeenCalledTimes(1)
    expect(mocks.listTrainerPainReports).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(mocks.getLatestWorkoutVersion).toHaveBeenCalledWith(expect.anything(), biancaId))
  })

  it('hides an already loaded health signal immediately after professional scope loss', async () => {
    const view = render(<EloAppProvider lockedRole="trainer"><LiveTrainerCopilot /></EloAppProvider>)
    expect(await screen.findByText(/Joelho da Marina · Agachamento/i)).toBeInTheDocument()

    mocks.useAuth.mockReturnValue({ profile: null, membership: null })
    view.rerender(<EloAppProvider lockedRole="trainer"><LiveTrainerCopilot /></EloAppProvider>)

    expect(screen.getByRole('heading', { name: 'Copiloto profissional indisponível.' })).toBeInTheDocument()
    expect(screen.queryByText(/Joelho da Marina/i)).not.toBeInTheDocument()
  })
})
