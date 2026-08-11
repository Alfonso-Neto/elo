import { act, render, screen } from '@testing-library/react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfessionalAccess } from '../onboarding/trainer-verification-service'
import { AuthProvider, useAuth } from './auth-context'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getProfessionalAccess: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  publicSupabaseConfig: {
    configured: true,
    issue: null,
    publishableKey: 'test-publishable-key',
    url: 'https://elo.test',
  },
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}))

vi.mock('../onboarding/trainer-verification-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../onboarding/trainer-verification-service')>(),
  getProfessionalAccess: mocks.getProfessionalAccess,
}))

const firstTrainerId = '11111111-1111-4111-8111-111111111111'
const secondTrainerId = '22222222-2222-4222-8222-222222222222'
const workspaceId = '33333333-3333-4333-8333-333333333333'
const secondWorkspaceId = '44444444-4444-4444-8444-444444444444'

const firstSession = { user: { id: firstTrainerId } } as Session
const secondSession = { user: { id: secondTrainerId } } as Session

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, reject, resolve }
}

function verifiedAccess(userId: string): ProfessionalAccess {
  return {
    userId,
    workspaceId,
    status: 'verified',
    crefNumber: '123456-G/SP',
    crefState: 'SP',
    studioName: 'Studio Horizonte',
    submittedAt: '2026-08-01T12:00:00.000Z',
    decidedAt: '2026-08-02T12:00:00.000Z',
    rejectionReason: null,
    mode: 'verified',
    temporaryAccessExpiresAt: null,
  }
}

function temporaryAccess(userId: string, expiresAt: string): ProfessionalAccess {
  return {
    userId,
    workspaceId,
    status: 'pending',
    crefNumber: '123456-G/SP',
    crefState: 'SP',
    studioName: 'Studio Horizonte',
    submittedAt: '2026-08-08T10:00:00.000Z',
    decidedAt: null,
    rejectionReason: null,
    mode: 'temporary_homologation',
    temporaryAccessExpiresAt: expiresAt,
  }
}

let authListener: ((event: AuthChangeEvent, session: Session | null) => void) | null = null
let observedAuth: ReturnType<typeof useAuth> | null = null

function AuthSnapshot() {
  const auth = useAuth()
  observedAuth = auth

  return (
    <>
      <output data-testid="loading">{String(auth.loading)}</output>
      <output data-testid="session-user">{auth.session?.user.id ?? 'none'}</output>
      <output data-testid="access-user">{auth.professionalAccess?.userId ?? 'none'}</output>
      <output data-testid="access-mode">{auth.professionalAccess?.mode ?? 'none'}</output>
      <output data-testid="access-error">{auth.accessError ?? 'none'}</output>
      <output data-testid="membership-workspace">{auth.membership?.workspaceId ?? 'none'}</output>
    </>
  )
}

async function flushMicrotasks(rounds = 12) {
  await act(async () => {
    for (let index = 0; index < rounds; index += 1) await Promise.resolve()
  })
}

async function dispatchAuthChange(event: AuthChangeEvent, session: Session | null) {
  act(() => authListener?.(event, session))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  await flushMicrotasks()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-08T12:00:00.000Z'))
  vi.clearAllMocks()
  observedAuth = null
  authListener = null
  window.history.replaceState(null, '', '/#/dashboard')

  mocks.getSession.mockResolvedValue({ data: { session: firstSession }, error: null })
  mocks.onAuthStateChange.mockImplementation((listener: typeof authListener) => {
    authListener = listener
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
  })
  mocks.signOut.mockResolvedValue({ error: null })
  mocks.from.mockImplementation(() => ({
    select: () => ({
      eq: (_column: string, userId: string) => ({
        maybeSingle: async () => ({
          data: {
            id: userId,
            account_role: 'trainer',
            display_name: userId === firstTrainerId ? 'André Lima' : 'Bianca Souza',
          },
          error: null,
        }),
      }),
    }),
  }))
  mocks.rpc.mockResolvedValue({
    data: [{
      workspace_id: workspaceId,
      workspace_name: 'Studio Horizonte',
      membership_role: 'owner',
      trainer_name: 'André Lima',
    }],
    error: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('professional access request races', () => {
  it('discards a membership refresh that resolves after the authenticated identity changes', async () => {
    const staleRefresh = deferred<{ data: unknown; error: null }>()
    mocks.rpc
      .mockResolvedValueOnce({ data: [{
        workspace_id: workspaceId,
        workspace_name: 'Studio Horizonte',
        membership_role: 'owner',
        trainer_name: 'André Lima',
      }], error: null })
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce({ data: [{
        workspace_id: secondWorkspaceId,
        workspace_name: 'Studio Norte',
        membership_role: 'owner',
        trainer_name: 'Bianca Souza',
      }], error: null })
    mocks.getProfessionalAccess.mockImplementation(async (activeWorkspaceId: string, userId: string) => ({
      ...verifiedAccess(userId),
      workspaceId: activeWorkspaceId,
    }))

    render(<AuthProvider><AuthSnapshot /></AuthProvider>)
    await flushMicrotasks()

    let oldRefreshPromise!: Promise<ReturnType<typeof useAuth>['membership']>
    act(() => { oldRefreshPromise = observedAuth!.refreshMembership() })
    await flushMicrotasks()

    await dispatchAuthChange('SIGNED_IN', secondSession)
    expect(screen.getByTestId('session-user')).toHaveTextContent(secondTrainerId)
    expect(screen.getByTestId('membership-workspace')).toHaveTextContent(secondWorkspaceId)

    staleRefresh.resolve({ data: [{
      workspace_id: workspaceId,
      workspace_name: 'Studio Horizonte',
      membership_role: 'owner',
      trainer_name: 'André Lima',
    }], error: null })
    await act(async () => { await oldRefreshPromise })

    expect(screen.getByTestId('session-user')).toHaveTextContent(secondTrainerId)
    expect(screen.getByTestId('membership-workspace')).toHaveTextContent(secondWorkspaceId)
  })

  it('ignores a stale refresh failure after sign-out and lets the next identity finish loading', async () => {
    const staleRefresh = deferred<ProfessionalAccess>()
    const secondIdentityLoad = deferred<ProfessionalAccess>()
    mocks.getProfessionalAccess
      .mockResolvedValueOnce(verifiedAccess(firstTrainerId))
      .mockReturnValueOnce(staleRefresh.promise)
      .mockReturnValueOnce(secondIdentityLoad.promise)

    render(<AuthProvider><AuthSnapshot /></AuthProvider>)
    await flushMicrotasks()

    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('session-user')).toHaveTextContent(firstTrainerId)
    expect(screen.getByTestId('access-user')).toHaveTextContent(firstTrainerId)

    let oldRefreshPromise!: Promise<ProfessionalAccess | null>
    act(() => { oldRefreshPromise = observedAuth!.refreshProfessionalAccess() })
    await flushMicrotasks()
    expect(mocks.getProfessionalAccess).toHaveBeenCalledTimes(2)

    act(() => {
      authListener?.('SIGNED_OUT', null)
      authListener?.('SIGNED_IN', secondSession)
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await flushMicrotasks()

    expect(mocks.getProfessionalAccess).toHaveBeenCalledTimes(3)
    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByTestId('access-user')).toHaveTextContent('none')

    staleRefresh.reject(new Error('stale professional-access failure'))
    await act(async () => { await oldRefreshPromise })

    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByTestId('access-error')).toHaveTextContent('none')
    expect(screen.getByTestId('access-user')).toHaveTextContent('none')

    secondIdentityLoad.resolve(verifiedAccess(secondTrainerId))
    await flushMicrotasks()

    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('session-user')).toHaveTextContent(secondTrainerId)
    expect(screen.getByTestId('access-user')).toHaveTextContent(secondTrainerId)
    expect(screen.getByTestId('access-error')).toHaveTextContent('none')
  })

  it('does not strand loading when temporary access expires during TOKEN_REFRESHED', async () => {
    const expiryRefresh = deferred<ProfessionalAccess>()
    const tokenRefreshLoad = deferred<ProfessionalAccess>()
    const expiresAt = '2026-08-08T12:00:01.000Z'
    mocks.getProfessionalAccess
      .mockResolvedValueOnce(temporaryAccess(firstTrainerId, expiresAt))
      .mockReturnValueOnce(expiryRefresh.promise)
      .mockReturnValueOnce(tokenRefreshLoad.promise)

    render(<AuthProvider><AuthSnapshot /></AuthProvider>)
    await flushMicrotasks()

    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('access-mode')).toHaveTextContent('temporary_homologation')

    await act(async () => { await vi.advanceTimersByTimeAsync(1_250) })
    await flushMicrotasks()
    expect(mocks.getProfessionalAccess).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('access-mode')).toHaveTextContent('none')

    await dispatchAuthChange('TOKEN_REFRESHED', firstSession)
    expect(mocks.getProfessionalAccess).toHaveBeenCalledTimes(3)
    expect(screen.getByTestId('loading')).toHaveTextContent('true')

    expiryRefresh.resolve(verifiedAccess(firstTrainerId))
    await flushMicrotasks()

    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByTestId('access-mode')).toHaveTextContent('none')

    tokenRefreshLoad.resolve(verifiedAccess(firstTrainerId))
    await flushMicrotasks()

    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('session-user')).toHaveTextContent(firstTrainerId)
    expect(screen.getByTestId('access-user')).toHaveTextContent(firstTrainerId)
    expect(screen.getByTestId('access-mode')).toHaveTextContent('verified')
    expect(screen.getByTestId('access-error')).toHaveTextContent('none')
  })
})
