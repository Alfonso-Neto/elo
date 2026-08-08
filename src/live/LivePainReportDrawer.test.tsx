import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PainReport, PainReportEvent, PainReportLifecycleSummary } from '../signals'
import { LivePainReportDrawer } from './LivePainReportDrawer'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  keyIndex: 0,
  service: {
    getPainReport: vi.fn(),
    listPainReportTimeline: vi.fn(),
    acknowledgePainReport: vi.fn(),
    resolvePainReport: vi.fn(),
  },
}))

vi.mock('../auth/auth-context', () => ({ useAuth: mocks.useAuth }))
vi.mock('../signals', async (importOriginal) => ({
  ...await importOriginal<typeof import('../signals')>(),
  createIdempotencyKey: (prefix: string) => `${prefix}:00000000-0000-4000-8000-${String(++mocks.keyIndex).padStart(12, '0')}`,
  createSignalService: () => mocks.service,
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const trainerId = '22222222-2222-4222-8222-222222222222'
const marinaId = '33333333-3333-4333-8333-333333333333'
const biancaId = '44444444-4444-4444-8444-444444444444'
const marinaReportId = '55555555-5555-4555-8555-555555555555'
const biancaReportId = '66666666-6666-4666-8666-666666666666'
const timestamp = '2026-08-08T12:00:00.000Z'

function summary(overrides: Partial<PainReportLifecycleSummary> = {}): PainReportLifecycleSummary {
  return {
    id: marinaReportId,
    sequence: 1,
    workspaceId,
    studentUserId: marinaId,
    region: 'Joelho direito',
    side: 'right',
    movement: 'Agachamento búlgaro',
    timing: 'during_activity',
    intensity: 7,
    onset: timestamp,
    redFlags: [],
    createdAt: timestamp,
    status: 'open',
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionNote: null,
    ...overrides,
  }
}

function detail(report = summary(), detailText = 'A dor apareceu ao descer.'): PainReport {
  const { status: _status, acknowledgedAt: _acknowledgedAt, resolvedAt: _resolvedAt, resolutionNote: _resolutionNote, ...base } = report
  return { ...base, detail: detailText }
}

function event(overrides: Partial<PainReportEvent> = {}): PainReportEvent {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    sequence: 1,
    painReportId: marinaReportId,
    workspaceId,
    studentUserId: marinaId,
    actorUserId: trainerId,
    action: 'acknowledged',
    note: 'Vou acompanhar no próximo treino.',
    createdAt: timestamp,
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.keyIndex = 0
  mocks.useAuth.mockReturnValue({
    profile: { id: trainerId, accountRole: 'trainer', displayName: 'André Lima' },
    membership: { workspaceId, workspaceName: 'Studio Elo', membershipRole: 'trainer', trainerName: 'André Lima' },
  })
  mocks.service.getPainReport.mockResolvedValue(detail())
  mocks.service.listPainReportTimeline.mockResolvedValue({ items: [], nextOffset: null })
  mocks.service.acknowledgePainReport.mockResolvedValue('88888888-8888-4888-8888-888888888888')
  mocks.service.resolvePainReport.mockResolvedValue('99999999-9999-4999-8999-999999999999')
})

describe('live pain report review drawer', () => {
  it('loads the immutable source and labels professional timeline notes as student-visible', async () => {
    mocks.service.listPainReportTimeline.mockResolvedValue({ items: [event()], nextOffset: null })
    render(<LivePainReportDrawer report={summary()} studentName="Marina Costa" onClose={vi.fn()} onChanged={vi.fn()} />)

    expect(await screen.findByText('A dor apareceu ao descer.')).toBeInTheDocument()
    expect(screen.getByText('Vou acompanhar no próximo treino.')).toBeInTheDocument()
    expect(screen.getByText('Visível ao aluno')).toBeInTheDocument()
    expect(screen.getByText('Em acompanhamento')).toBeInTheDocument()
    expect(mocks.service.getPainReport).toHaveBeenCalledWith(marinaReportId)
    expect(mocks.service.listPainReportTimeline).toHaveBeenCalledWith(marinaReportId, { limit: 50 })
  })

  it('locks an acknowledgement, prevents a double action, and reuses its key after failure', async () => {
    const first = deferred<string>()
    mocks.service.acknowledgePainReport.mockReturnValueOnce(first.promise)
    render(<LivePainReportDrawer report={summary()} studentName="Marina Costa" onClose={vi.fn()} onChanged={vi.fn()} />)
    await screen.findByText('A dor apareceu ao descer.')

    const acknowledge = screen.getByRole('button', { name: /Marcar como revisado/i })
    fireEvent.click(acknowledge)
    fireEvent.click(acknowledge)
    expect(mocks.service.acknowledgePainReport).toHaveBeenCalledTimes(1)
    expect(acknowledge).toBeDisabled()
    expect(screen.getByRole('textbox', { name: /Retorno de resolução/i })).toBeDisabled()

    await act(async () => { first.reject(new Error('Falha temporária.')); await Promise.resolve() })
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha temporária.')
    const firstKey = mocks.service.acknowledgePainReport.mock.calls[0][0].idempotencyKey

    fireEvent.click(screen.getByRole('button', { name: /Marcar como revisado/i }))
    await waitFor(() => expect(mocks.service.acknowledgePainReport).toHaveBeenCalledTimes(2))
    expect(mocks.service.acknowledgePainReport.mock.calls[1][0].idempotencyKey).toBe(firstKey)
  })

  it('renews the resolution key after the student-visible message changes', async () => {
    mocks.service.resolvePainReport.mockRejectedValue(new Error('Não enviado.'))
    render(<LivePainReportDrawer report={summary()} studentName="Marina Costa" onClose={vi.fn()} onChanged={vi.fn()} />)
    await screen.findByText('A dor apareceu ao descer.')

    const note = screen.getByRole('textbox', { name: /Retorno de resolução/i })
    fireEvent.change(note, { target: { value: 'Vamos reduzir a amplitude.' } })
    fireEvent.click(screen.getByRole('button', { name: /Resolver e avisar/i }))
    await waitFor(() => expect(mocks.service.resolvePainReport).toHaveBeenCalledTimes(1))
    const firstKey = mocks.service.resolvePainReport.mock.calls[0][0].idempotencyKey

    fireEvent.change(note, { target: { value: 'Vamos reduzir a amplitude e reavaliar amanhã.' } })
    fireEvent.click(screen.getByRole('button', { name: /Resolver e avisar/i }))
    await waitFor(() => expect(mocks.service.resolvePainReport).toHaveBeenCalledTimes(2))
    expect(mocks.service.resolvePainReport.mock.calls[1][0].idempotencyKey).not.toBe(firstKey)
    expect(mocks.service.resolvePainReport.mock.calls[1][0].resolutionNote).toBe('Vamos reduzir a amplitude e reavaliar amanhã.')
  })

  it('never paints a late report response into a newly selected student', async () => {
    const oldDetail = deferred<PainReport | null>()
    const oldTimeline = deferred<{ items: PainReportEvent[]; nextOffset: null }>()
    const biancaSummary = summary({
      id: biancaReportId,
      studentUserId: biancaId,
      region: 'Ombro esquerdo',
      side: 'left',
      movement: 'Desenvolvimento',
    })
    mocks.service.getPainReport
      .mockReturnValueOnce(oldDetail.promise)
      .mockResolvedValueOnce(detail(biancaSummary, 'Contexto exclusivo de Bianca.'))
    mocks.service.listPainReportTimeline
      .mockReturnValueOnce(oldTimeline.promise)
      .mockResolvedValueOnce({ items: [], nextOffset: null })
    const view = render(<LivePainReportDrawer report={summary()} studentName="Marina Costa" onClose={vi.fn()} onChanged={vi.fn()} />)

    view.rerender(<LivePainReportDrawer report={biancaSummary} studentName="Bianca Rocha" onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByText('Contexto exclusivo de Bianca.')).toBeInTheDocument()
    await act(async () => {
      oldDetail.resolve(detail(summary(), 'Segredo tardio de Marina.'))
      oldTimeline.resolve({ items: [event()], nextOffset: null })
      await Promise.resolve()
    })

    expect(screen.getByText('Contexto exclusivo de Bianca.')).toBeInTheDocument()
    expect(screen.queryByText('Segredo tardio de Marina.')).not.toBeInTheDocument()
    expect(screen.queryByText('Vou acompanhar no próximo treino.')).not.toBeInTheDocument()
  })

  it('removes sensitive report content immediately when professional scope is lost', async () => {
    const view = render(<LivePainReportDrawer report={summary()} studentName="Marina Costa" onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByText('A dor apareceu ao descer.')).toBeInTheDocument()

    mocks.useAuth.mockReturnValue({ profile: null, membership: null })
    view.rerender(<LivePainReportDrawer report={summary()} studentName="Marina Costa" onClose={vi.fn()} onChanged={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Relato indisponível' })).toBeInTheDocument()
    expect(screen.queryByText('A dor apareceu ao descer.')).not.toBeInTheDocument()
    expect(screen.queryByText('Joelho direito')).not.toBeInTheDocument()
  })
})
