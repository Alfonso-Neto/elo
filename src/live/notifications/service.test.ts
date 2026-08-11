import { describe, expect, it, vi } from 'vitest'
import { createNotificationService, NotificationDomainError, type NotificationBoundary } from './service'

const studentId = '11111111-1111-4111-8111-111111111111'
const now = new Date(Date.now() - 60_000).toISOString()
const earlier = new Date(Date.now() - 120_000).toISOString()

function item(overrides: Record<string, unknown> = {}) {
  return {
    item_key: 'pain:22222222-2222-4222-8222-222222222222',
    kind: 'pain_report',
    title: 'Marina compartilhou um sinal',
    detail: 'Joelho · intensidade 8/10',
    occurred_at: now,
    target_page: 'copilot',
    student_user_id: studentId,
    is_read: false,
    priority: 3,
    ...overrides,
  }
}

function boundary(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result)
  return { value: { rpc } satisfies NotificationBoundary, rpc }
}

describe('notification feed service', () => {
  it('parses a bounded ordered feed through an auth-derived RPC', async () => {
    const { value, rpc } = boundary({ data: [
      item(),
      item({
        item_key: 'message:33333333-3333-4333-8333-333333333333',
        kind: 'message', title: 'Marina enviou uma mensagem', detail: 'Conversa privada atualizada',
        occurred_at: earlier, target_page: 'messages', priority: 1,
      }),
    ], error: null })

    await expect(createNotificationService(value).listNotifications(12)).resolves.toMatchObject([
      { kind: 'pain_report', priority: 3, studentUserId: studentId, isRead: false },
      { kind: 'message', priority: 1, targetPage: 'messages' },
    ])
    expect(rpc).toHaveBeenCalledWith('list_my_notifications', { p_limit: 12 })
  })

  it('marks exact stable item keys without sending workspace or user identity', async () => {
    const keys = [
      'workout:44444444-4444-4444-8444-444444444444',
      'message:55555555-5555-4555-8555-555555555555',
    ]
    const { value, rpc } = boundary({ data: '2', error: null })
    await expect(createNotificationService(value).markRead(keys)).resolves.toBe(2)
    expect(rpc).toHaveBeenCalledWith('mark_my_notifications_read', { p_item_keys: keys })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('workspace')
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('user_id')
  })

  it('fails closed on duplicate, malformed, future, or out-of-order rows', async () => {
    const duplicate = boundary({ data: [item(), item()], error: null })
    await expect(createNotificationService(duplicate.value).listNotifications()).rejects.toBeInstanceOf(NotificationDomainError)

    const future = boundary({ data: [item({ occurred_at: new Date(Date.now() + 3600_000).toISOString() })], error: null })
    await expect(createNotificationService(future.value).listNotifications()).rejects.toBeInstanceOf(NotificationDomainError)

    const crossed = boundary({ data: [item({ student_user_id: 'another-student' })], error: null })
    await expect(createNotificationService(crossed.value).listNotifications()).rejects.toBeInstanceOf(NotificationDomainError)

    const deceptive = boundary({ data: [item({ title: 'Atualização\u202Einvertida' })], error: null })
    await expect(createNotificationService(deceptive.value).listNotifications()).rejects.toBeInstanceOf(NotificationDomainError)

    const outOfOrder = boundary({ data: [item({ priority: 1 }), item({
      item_key: 'schedule:66666666-6666-4666-8666-666666666666:confirmed',
      kind: 'schedule', title: 'Sessão confirmada', detail: 'Studio', target_page: 'schedule', priority: 2,
    })], error: null })
    await expect(createNotificationService(outOfOrder.value).listNotifications()).rejects.toBeInstanceOf(NotificationDomainError)
  })

  it('rejects invalid reads before an RPC and hides backend details', async () => {
    const invalid = boundary({ data: 1, error: null })
    await expect(createNotificationService(invalid.value).markRead(['bad key'])).rejects.toBeInstanceOf(NotificationDomainError)
    expect(invalid.rpc).not.toHaveBeenCalled()

    const failed = boundary({ data: null, error: { message: 'private.notification_read_receipts leaked' } })
    const caught = await createNotificationService(failed.value).listNotifications().catch((error: unknown) => error)
    expect(caught).toBeInstanceOf(NotificationDomainError)
    if (!(caught instanceof NotificationDomainError)) throw new Error('Expected notification domain error')
    expect(caught.message).not.toContain('private.notification')
    expect(caught).not.toHaveProperty('cause')
  })
})
