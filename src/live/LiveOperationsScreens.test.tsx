import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrototypeProvider } from '../prototype-context'
import { LiveMessagesScreen } from './LiveOperationsScreens'

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }))
const enrollment = vi.hoisted(() => ({ listEnrolledStudents: vi.fn() }))
const operations = vi.hoisted(() => ({
  listThreadMessages: vi.fn(),
}))

vi.mock('../auth/auth-context', () => ({ useAuth: auth.useAuth }))
vi.mock('../onboarding/enrollment-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../onboarding/enrollment-service')>()
  return { ...actual, listEnrolledStudents: enrollment.listEnrolledStudents }
})
vi.mock('./operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./operations')>()
  return { ...actual, createOperationsService: () => operations }
})

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '#/messages')
  auth.useAuth.mockReturnValue({
    profile: { id: 'a654f432-1a44-45ad-bf25-808674d483e6', displayName: 'André Lima', accountRole: 'trainer' },
    membership: { workspaceId: '23ccf1ec-a377-4b45-a401-11d28a8a1503', workspaceName: 'Studio Horizonte', membershipRole: 'owner', trainerName: 'André Lima' },
  })
  operations.listThreadMessages.mockResolvedValue({ items: [], nextOffset: null })
})

describe('live conversation recovery', () => {
  it('retries the failed trainer roster before loading the thread', async () => {
    enrollment.listEnrolledStudents
      .mockRejectedValueOnce(new Error('Falha temporária'))
      .mockResolvedValueOnce([{
        userId: '0a258739-7658-4012-b747-0f95dca6372c',
        displayName: 'Marina Costa',
        joinedAt: null,
      }])

    render(<PrototypeProvider lockedRole="trainer"><LiveMessagesScreen /></PrototypeProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }))

    await waitFor(() => expect(enrollment.listEnrolledStudents).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'O contexto fica junto.' })).toBeInTheDocument()
    expect(operations.listThreadMessages).toHaveBeenCalledWith({ studentUserId: '0a258739-7658-4012-b747-0f95dca6372c', limit: 50 })
  })
})
