import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { App } from '../App'

const authHarness = vi.hoisted(() => ({
  state: {
    loading: false,
    session: { user: { id: '0a258739-7658-4012-b747-0f95dca6372c' } },
    profile: {
      id: '0a258739-7658-4012-b747-0f95dca6372c',
      accountRole: 'trainer',
      displayName: 'André Lima',
    },
    membership: {
      workspaceId: '23ccf1ec-a377-4b45-a401-11d28a8a1503',
      workspaceName: 'Studio Horizonte',
      membershipRole: 'owner',
      trainerName: 'André Lima',
    },
    professionalAccess: {
      userId: '0a258739-7658-4012-b747-0f95dca6372c',
      workspaceId: '23ccf1ec-a377-4b45-a401-11d28a8a1503',
      status: 'pending',
      crefNumber: '123456-G',
      crefState: 'SP',
      studioName: 'Studio Horizonte',
      submittedAt: '2026-08-08T10:00:00.000Z',
      decidedAt: null,
      rejectionReason: null,
      mode: 'temporary_homologation',
      temporaryAccessExpiresAt: '2026-08-09T10:00:00.000Z',
    },
    recoveryMode: false,
    accessError: null,
    signOut: vi.fn(),
  },
}))

vi.mock('../auth/auth-context', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => authHarness.state,
}))

vi.mock('../onboarding/TrainerVerificationScreen', () => ({
  TrainerVerificationScreen: () => <div data-testid="verification-screen">Verificação</div>,
}))

vi.mock('../live/LiveTrainerDashboard', () => {
  return { LiveTrainerDashboard: () => <div data-testid="trainer-dashboard">Dashboard</div> }
})

vi.mock('../live/LiveNotifications', () => ({
  LiveNotificationsButton: () => <button type="button">Notificações</button>,
}))

describe('professional verification route boundary', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/#/verificacao')
  })

  it('derives replaceState redirects from the current hash and still follows hashchange', async () => {
    const { rerender } = render(<App />)
    expect(screen.getByTestId('verification-screen')).toBeInTheDocument()

    act(() => {
      window.history.replaceState(null, '', '/#/dashboard')
      rerender(<App />)
    })
    expect(await screen.findByTestId('trainer-dashboard')).toBeInTheDocument()
    expect(screen.queryByTestId('verification-screen')).not.toBeInTheDocument()

    act(() => {
      window.history.replaceState(null, '', '/#/verificacao')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByTestId('verification-screen')).toBeInTheDocument()
  })
})
