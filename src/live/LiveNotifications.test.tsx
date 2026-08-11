import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EloAppProvider, useEloApp } from '../app-state'
import type { NotificationItem } from './notifications'
import { LiveNotificationsButton } from './LiveNotifications'

const service = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markRead: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

vi.mock('./notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./notifications')>()
  return { ...actual, createNotificationService: () => service }
})

const workoutItem: NotificationItem = {
  itemKey: 'workout:11111111-1111-4111-8111-111111111111',
  kind: 'workout',
  title: 'Novo treino publicado',
  detail: 'Treino A · Inferiores',
  occurredAt: new Date(Date.now() - 60_000).toISOString(),
  targetPage: 'workout',
  studentUserId: null,
  isRead: false,
  priority: 2,
}

function ToastProbe() {
  const { toast } = useEloApp()
  return <output>{toast ? `${toast.title}: ${toast.message}` : 'no-toast'}</output>
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '#/today')
  service.listNotifications.mockResolvedValue([workoutItem])
  service.markRead.mockResolvedValue(1)
})

describe('live notification drawer', () => {
  it('keeps the newest feed when an older request resolves last', async () => {
    const oldRequest = deferred<NotificationItem[]>()
    const freshItem = { ...workoutItem, title: 'Treino mais recente' }
    service.listNotifications
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce([freshItem])

    render(<EloAppProvider lockedRole="student"><LiveNotificationsButton /></EloAppProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir atualizações' }))
    expect(await screen.findByRole('button', { name: /Treino mais recente/ })).toBeInTheDocument()

    oldRequest.resolve([])
    await waitFor(() => expect(service.listNotifications).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: /Treino mais recente/ })).toBeInTheDocument()
  })

  it('shows a real unread badge, records the receipt, and opens the target feature', async () => {
    render(<EloAppProvider lockedRole="student"><LiveNotificationsButton /></EloAppProvider>)
    const trigger = await screen.findByRole('button', { name: 'Abrir atualizações, 1 novas' })
    fireEvent.click(trigger)
    const update = await screen.findByRole('button', { name: /Novo treino publicado/ })
    expect(update).toHaveTextContent('NOVA')
    fireEvent.click(update)

    await waitFor(() => expect(service.markRead).toHaveBeenCalledWith([workoutItem.itemKey]))
    expect(window.location.hash).toBe('#/workout')
  })

  it('marks every visible unread item in one bounded request', async () => {
    const message: NotificationItem = {
      ...workoutItem,
      itemKey: 'message:22222222-2222-4222-8222-222222222222',
      kind: 'message',
      title: 'Nova mensagem do seu professor',
      detail: 'Conversa privada atualizada',
      targetPage: 'messages',
      priority: 1,
    }
    service.listNotifications.mockResolvedValue([workoutItem, message])
    service.markRead.mockResolvedValue(2)
    render(<EloAppProvider lockedRole="student"><LiveNotificationsButton /></EloAppProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir atualizações, 2 novas' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar todas como lidas' }))

    await waitFor(() => expect(service.markRead).toHaveBeenCalledWith([workoutItem.itemKey, message.itemKey]))
    expect(await screen.findByText('Nenhuma atualização nova')).toBeInTheDocument()
  })

  it('restores the unread state when the individual receipt is not saved', async () => {
    service.markRead.mockRejectedValue(new Error('network unavailable'))
    render(<EloAppProvider lockedRole="student"><LiveNotificationsButton /><ToastProbe /></EloAppProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir atualizações, 1 novas' }))
    fireEvent.click(await screen.findByRole('button', { name: /Novo treino publicado/ }))

    expect(await screen.findByText(/Leitura não confirmada: A atualização continuará marcada como nova/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Abrir atualizações, 1 novas' })).toBeInTheDocument()
  })
})
