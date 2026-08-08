import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfessionalAccess } from './trainer-verification-service'
import { TrainerVerificationScreen } from './TrainerVerificationScreen'

const mocks = vi.hoisted(() => ({
  createIdempotencyKey: vi.fn(),
  submitTrainerVerification: vi.fn(),
  useAuth: vi.fn(),
}))

vi.mock('../auth/auth-context', () => ({ useAuth: mocks.useAuth }))
vi.mock('../signals', () => ({ createIdempotencyKey: mocks.createIdempotencyKey }))
vi.mock('./trainer-verification-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('./trainer-verification-service')>(),
  submitTrainerVerification: mocks.submitTrainerVerification,
}))

const trainerId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const requestId = '33333333-3333-4333-8333-333333333333'
const firstKey = 'trainer-verification:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const secondKey = 'trainer-verification:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'

const unverifiedAccess: ProfessionalAccess = {
  userId: trainerId,
  workspaceId,
  status: 'unverified',
  crefNumber: '123456-G/SP',
  crefState: 'SP',
  studioName: 'Studio Horizonte',
  submittedAt: null,
  decidedAt: null,
  rejectionReason: null,
  mode: 'blocked',
  temporaryAccessExpiresAt: null,
}

const pendingAccess: ProfessionalAccess = {
  ...unverifiedAccess,
  status: 'pending',
  submittedAt: '2026-08-08T12:00:00.000Z',
}

const rejectedAccess: ProfessionalAccess = {
  ...pendingAccess,
  status: 'rejected',
  decidedAt: '2026-08-08T15:00:00.000Z',
  rejectionReason: 'O número informado não corresponde ao registro público.',
}

const temporaryAccess: ProfessionalAccess = {
  ...unverifiedAccess,
  mode: 'temporary_homologation',
  temporaryAccessExpiresAt: '2026-08-09T12:00:00.000Z',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

function authValue(professionalAccess: ProfessionalAccess | null = unverifiedAccess) {
  return {
    accessError: null,
    membership: {
      workspaceId,
      workspaceName: 'Studio Horizonte',
      membershipRole: 'owner',
      trainerName: 'André Lima',
    },
    professionalAccess,
    profile: { id: trainerId, accountRole: 'trainer', displayName: 'André Lima' },
    refreshProfessionalAccess: vi.fn().mockResolvedValue(professionalAccess),
    session: { user: { id: trainerId } },
    signOut: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/#/verificacao')
  mocks.createIdempotencyKey
    .mockReturnValueOnce(firstKey)
    .mockReturnValueOnce(secondKey)
  mocks.submitTrainerVerification.mockResolvedValue(requestId)
  mocks.useAuth.mockReturnValue(authValue())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('trainer professional verification interface', () => {
  it('prefills an unverified request and submits the exact normalized intent without browser persistence', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    const auth = authValue()
    mocks.useAuth.mockReturnValue(auth)
    render(<TrainerVerificationScreen />)

    expect(screen.getByLabelText('Número do CREF')).toHaveValue('123456-G/SP')
    expect(screen.getByLabelText('UF')).toHaveValue('SP')
    expect(screen.getByLabelText(/Estúdio ou marca/i)).toHaveValue('Studio Horizonte')

    fireEvent.change(screen.getByLabelText('Número do CREF'), { target: { value: '  abc-123/rj  ' } })
    fireEvent.change(screen.getByLabelText('UF'), { target: { value: ' rj ' } })
    fireEvent.change(screen.getByLabelText(/Estúdio ou marca/i), { target: { value: '  Clínica Aurora  ' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar para revisão/i }))

    await waitFor(() => expect(mocks.submitTrainerVerification).toHaveBeenCalledWith({
      crefNumber: 'ABC-123/RJ',
      crefState: 'RJ',
      studioName: 'Clínica Aurora',
      idempotencyKey: firstKey,
    }))
    await waitFor(() => expect(auth.refreshProfessionalAccess).toHaveBeenCalledTimes(1))
    expect(mocks.createIdempotencyKey).toHaveBeenCalledWith('trainer-verification')
    expect(storageWrite).not.toHaveBeenCalled()
  })

  it('locks a pending request into a read-only summary and refreshes its authoritative status', async () => {
    const auth = authValue(pendingAccess)
    mocks.useAuth.mockReturnValue(auth)
    render(<TrainerVerificationScreen />)

    expect(screen.getByRole('heading', { name: 'Seu CREF está com a equipe.' })).toBeInTheDocument()
    expect(screen.getByText(/123456-G\/SP/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Número do CREF')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Enviar para revisão/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Atualizar situação/i }))
    await waitFor(() => expect(auth.refreshProfessionalAccess).toHaveBeenCalledTimes(1))
    expect(mocks.submitTrainerVerification).not.toHaveBeenCalled()
  })

  it('shows the rejection reason and submits corrected professional data', async () => {
    const auth = authValue(rejectedAccess)
    mocks.useAuth.mockReturnValue(auth)
    render(<TrainerVerificationScreen />)

    expect(screen.getByText('O número informado não corresponde ao registro público.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Número do CREF'), { target: { value: '654321-G/SP' } })
    fireEvent.click(screen.getByRole('button', { name: /Reenviar para revisão/i }))

    await waitFor(() => expect(mocks.submitTrainerVerification).toHaveBeenCalledWith({
      crefNumber: '654321-G/SP',
      crefState: 'SP',
      studioName: 'Studio Horizonte',
      idempotencyKey: firstKey,
    }))
    await waitFor(() => expect(auth.refreshProfessionalAccess).toHaveBeenCalledTimes(1))
  })

  it('reuses the same key for an unchanged failed retry and renews it only after an edit', async () => {
    mocks.submitTrainerVerification
      .mockRejectedValueOnce(new Error('Falha temporária um.'))
      .mockRejectedValueOnce(new Error('Falha temporária dois.'))
      .mockResolvedValueOnce(requestId)
    render(<TrainerVerificationScreen />)

    fireEvent.click(screen.getByRole('button', { name: /Enviar para revisão/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha temporária um.')

    fireEvent.click(screen.getByRole('button', { name: /Enviar para revisão/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Falha temporária dois.'))

    fireEvent.change(screen.getByLabelText(/Estúdio ou marca/i), { target: { value: 'Studio Horizonte Sul' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Enviar para revisão/i }))

    await waitFor(() => expect(mocks.submitTrainerVerification).toHaveBeenCalledTimes(3))
    expect(mocks.submitTrainerVerification.mock.calls.map(([command]) => command.idempotencyKey)).toEqual([
      firstKey,
      firstKey,
      secondKey,
    ])
    expect(mocks.createIdempotencyKey).toHaveBeenCalledTimes(2)
    expect(mocks.submitTrainerVerification).toHaveBeenLastCalledWith(expect.objectContaining({
      studioName: 'Studio Horizonte Sul',
      idempotencyKey: secondKey,
    }))
  })

  it('allows only one RPC while a verification submission is in flight', async () => {
    const submission = deferred<string>()
    const auth = authValue()
    mocks.useAuth.mockReturnValue(auth)
    mocks.submitTrainerVerification.mockReturnValue(submission.promise)
    render(<TrainerVerificationScreen />)

    const submitButton = screen.getByRole('button', { name: /Enviar para revisão/i })
    const form = submitButton.closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)
    fireEvent.submit(form!)

    expect(mocks.submitTrainerVerification).toHaveBeenCalledTimes(1)
    expect(mocks.createIdempotencyKey).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Enviando com segurança/i })).toBeDisabled()
    expect(screen.getByLabelText('Número do CREF')).toBeDisabled()

    await act(async () => {
      submission.resolve(requestId)
      await submission.promise
    })
    await waitFor(() => expect(auth.refreshProfessionalAccess).toHaveBeenCalledTimes(1))
  })

  it('fails closed when verification is unavailable and never exposes a previous CREF or rejection', () => {
    const initial = authValue(rejectedAccess)
    mocks.useAuth.mockReturnValue(initial)
    const view = render(<TrainerVerificationScreen />)

    expect(screen.getByDisplayValue('123456-G/SP')).toBeInTheDocument()
    expect(screen.getByText(rejectedAccess.rejectionReason!)).toBeInTheDocument()

    mocks.useAuth.mockReturnValue({
      ...initial,
      accessError: 'Não foi possível validar seu acesso profissional agora.',
      professionalAccess: null,
    })
    view.rerender(<TrainerVerificationScreen />)

    expect(screen.getByRole('heading', { name: 'Seu acesso continua protegido.' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('123456-G/SP')).not.toBeInTheDocument()
    expect(screen.queryByText(rejectedAccess.rejectionReason!)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Número do CREF')).not.toBeInTheDocument()
  })

  it.each([
    ['authentication', { session: null, profile: null, membership: null }],
    ['workspace scope', {
      membership: {
        workspaceId: '44444444-4444-4444-8444-444444444444',
        workspaceName: 'Outro workspace',
        membershipRole: 'owner',
        trainerName: 'André Lima',
      },
    }],
  ])('removes stale private verification data immediately after %s is lost', (_label, loss) => {
    const initial = authValue(rejectedAccess)
    mocks.useAuth.mockReturnValue(initial)
    const view = render(<TrainerVerificationScreen />)

    expect(screen.getByDisplayValue('123456-G/SP')).toBeInTheDocument()
    expect(screen.getByText(rejectedAccess.rejectionReason!)).toBeInTheDocument()

    mocks.useAuth.mockReturnValue({ ...initial, ...loss })
    view.rerender(<TrainerVerificationScreen />)

    expect(screen.getByRole('heading', { name: 'Seu acesso continua protegido.' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('123456-G/SP')).not.toBeInTheDocument()
    expect(screen.queryByText(rejectedAccess.rejectionReason!)).not.toBeInTheDocument()
  })

  it('labels temporary homologation as non-verified and can return to the app', () => {
    mocks.useAuth.mockReturnValue(authValue(temporaryAccess))
    render(<TrainerVerificationScreen />)

    expect(screen.getByRole('status')).toHaveTextContent(/acesso temporário.*não equivale a um CREF verificado/i)
    expect(screen.queryByText(/^CREF VERIFICADO$/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao ambiente temporário' }))

    expect(window.location.hash).toBe('#/dashboard')
    expect(mocks.submitTrainerVerification).not.toHaveBeenCalled()
  })
})
