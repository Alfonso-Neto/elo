import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssistantProposal } from '../assistant/assistant-service'
import { EloAppProvider } from '../app-state'
import { StudentAssistantScreen } from '../student-assistant-screen'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  grantCurrentHealthConsent: vi.fn(),
  createPainReport: vi.fn(),
  getLatestWorkoutVersion: vi.fn(),
  requestPainTriage: vi.fn(),
}))

vi.mock('../auth/auth-context', () => ({ useAuth: mocks.useAuth }))
vi.mock('../signals', async (importOriginal) => ({
  ...await importOriginal<typeof import('../signals')>(),
  createSignalService: () => ({
    grantCurrentHealthConsent: mocks.grantCurrentHealthConsent,
    createPainReport: mocks.createPainReport,
  }),
}))
vi.mock('../live/training', async (importOriginal) => ({
  ...await importOriginal<typeof import('../live/training')>(),
  getLatestWorkoutVersion: mocks.getLatestWorkoutVersion,
}))
vi.mock('../assistant/assistant-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../assistant/assistant-service')>(),
  createAssistantService: () => ({ requestPainTriage: mocks.requestPainTriage }),
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const studentId = '33333333-3333-4333-8333-333333333333'
const firstReportId = '66666666-6666-4666-8666-666666666666'
const secondReportId = '77777777-7777-4777-8777-777777777777'

function proposal(summary: string): AssistantProposal {
  return {
    summary,
    urgency: 'routine',
    red_flags: [],
    questions: [],
    rationale: ['Manter o relato associado à revisão correta.'],
    workout_changes: [],
    sources: [{ kind: 'user_report', label: 'Relato estruturado atual' }],
    uncertainties: ['Sem avaliação clínica no aplicativo.'],
    disclaimer: 'Apoio informativo; não substitui avaliação ou decisão profissional.',
  }
}

function completeResult(summary: string, proposalId: string) {
  return {
    state: 'complete' as const,
    runId: '88888888-8888-4888-8888-888888888888',
    proposalId,
    completionMode: 'model' as const,
    reused: false,
    proposal: proposal(summary),
  }
}

async function submitPainReport() {
  fireEvent.click(screen.getByRole('button', { name: /Senti uma dor/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Joelho direito' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Leg press' }))
  fireEvent.click(screen.getByRole('button', { name: 'Durante a descida' }))
  fireEvent.click(screen.getByRole('button', { name: '4' }))
  fireEvent.click(screen.getByRole('button', { name: /Nenhum desses sinais/i }))
  fireEvent.click(screen.getByRole('button', { name: /Continuar/i }))
  fireEvent.click(screen.getByRole('button', { name: /Revisar relato/i }))
  fireEvent.click(screen.getByLabelText(/Autorizo salvar e compartilhar/i))
  fireEvent.click(screen.getByRole('button', { name: /Enviar para André/i }))
  expect(await screen.findByRole('heading', { name: /André já recebeu/i })).toBeInTheDocument()
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/#/assistant')
  mocks.useAuth.mockReturnValue({
    membership: { workspaceId, workspaceName: 'Studio Elo', membershipRole: 'student', trainerName: 'André Lima' },
    profile: { id: studentId, accountRole: 'student', displayName: 'Marina Costa' },
  })
  mocks.grantCurrentHealthConsent.mockResolvedValue('consent-event')
  mocks.getLatestWorkoutVersion.mockResolvedValue({
    id: '55555555-5555-4555-8555-555555555555', workspaceId, studentUserId: studentId,
    publishedByUserId: '22222222-2222-4222-8222-222222222222', publishedByRole: 'trainer', versionNumber: 1,
    title: 'Inferiores', publishedAt: '2026-08-07T12:00:00.000Z',
    exercises: [{ id: 'leg', name: 'Leg press', muscle: 'Quadríceps', sets: '3', reps: '10', load: '60 kg', rest: '60s', tempo: '2-0-2', rir: '2', note: '' }],
  })
})

describe('authenticated student assistant concurrency', () => {
  it('warns before leaving while a private pain report is incomplete', async () => {
    render(<EloAppProvider lockedRole="student"><StudentAssistantScreen /></EloAppProvider>)
    await waitFor(() => expect(mocks.getLatestWorkoutVersion).toHaveBeenCalledTimes(1))
    const cleanExit = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanExit)
    expect(cleanExit.defaultPrevented).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /Senti uma dor/i }))
    const dirtyExit = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyExit)
    expect(dirtyExit.defaultPrevented).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /Voltar uma etapa/i }))
    const resetExit = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(resetExit)
    expect(resetExit.defaultPrevented).toBe(false)
  })

  it('discards an older AI response after a new pain report is completed', async () => {
    let resolveFirst!: (value: ReturnType<typeof completeResult>) => void
    const firstResponse = new Promise<ReturnType<typeof completeResult>>((resolve) => { resolveFirst = resolve })
    mocks.createPainReport.mockResolvedValueOnce(firstReportId).mockResolvedValueOnce(secondReportId)
    mocks.requestPainTriage.mockImplementation(({ painReportId }: { painReportId: string }) => painReportId === firstReportId
      ? firstResponse
      : Promise.resolve(completeResult('Orientação vinculada ao relato atual.', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')))

    render(<EloAppProvider lockedRole="student"><StudentAssistantScreen /></EloAppProvider>)
    await submitPainReport()
    await waitFor(() => expect(mocks.requestPainTriage).toHaveBeenCalledWith(expect.objectContaining({ painReportId: firstReportId })))

    fireEvent.click(screen.getByRole('button', { name: /Novo relato/i }))
    await submitPainReport()
    expect(await screen.findByText('Orientação vinculada ao relato atual.')).toBeInTheDocument()

    await act(async () => {
      resolveFirst(completeResult('Orientação antiga que não pode reaparecer.', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
      await Promise.resolve()
    })

    expect(screen.queryByText('Orientação antiga que não pode reaparecer.')).not.toBeInTheDocument()
    expect(screen.getByText('Orientação vinculada ao relato atual.')).toBeInTheDocument()
  })

  it('reuses the report and idempotency key when a processing review is checked again', async () => {
    mocks.createPainReport.mockResolvedValue(firstReportId)
    mocks.requestPainTriage
      .mockResolvedValueOnce({ state: 'processing', runId: '88888888-8888-4888-8888-888888888888' })
      .mockResolvedValueOnce(completeResult('Revisão concluída para o mesmo relato.', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))

    render(<EloAppProvider lockedRole="student"><StudentAssistantScreen /></EloAppProvider>)
    await submitPainReport()
    expect(await screen.findByText(/análise em processamento/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Verificar novamente/i }))
    expect(await screen.findByText('Revisão concluída para o mesmo relato.')).toBeInTheDocument()

    expect(mocks.requestPainTriage).toHaveBeenCalledTimes(2)
    expect(mocks.requestPainTriage.mock.calls[0][0].painReportId).toBe(firstReportId)
    expect(mocks.requestPainTriage.mock.calls[1][0].painReportId).toBe(firstReportId)
    expect(mocks.requestPainTriage.mock.calls[0][0].idempotencyKey).toBe(mocks.requestPainTriage.mock.calls[1][0].idempotencyKey)
  })
})
