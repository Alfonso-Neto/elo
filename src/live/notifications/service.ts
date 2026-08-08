import { requireSupabase } from '../../lib/supabase'
import type { Page } from '../../types'
import { notificationKinds, type NotificationItem, type NotificationKind } from './types'

type BackendResult = { data: unknown; error: unknown }

export type NotificationBoundary = {
  rpc: (name: string, arguments_: Record<string, unknown>) => Promise<BackendResult>
}

const defaultBoundary: NotificationBoundary = {
  async rpc(name, arguments_) {
    const { data, error } = await requireSupabase().rpc(name, arguments_)
    return { data, error }
  },
}

const itemKeyPattern = /^[a-z][A-Za-z0-9:_-]{2,159}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const kindSet = new Set<string>(notificationKinds)
const targetPages = new Set<Page>([
  'copilot', 'schedule', 'forms', 'student-detail', 'messages',
  'workout', 'student-form', 'nutrition', 'assistant',
])

export class NotificationDomainError extends Error {
  constructor() {
    super('Não foi possível carregar ou atualizar as notificações agora.')
    this.name = 'NotificationDomainError'
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringField(row: Record<string, unknown>, key: string, maximum: number) {
  const value = row[key]
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(value)) throw new NotificationDomainError()
  return value
}

function parseItem(value: unknown): NotificationItem {
  if (!record(value)) throw new NotificationDomainError()
  const itemKey = stringField(value, 'item_key', 160)
  const kind = stringField(value, 'kind', 40)
  const occurredAt = stringField(value, 'occurred_at', 50)
  const targetPage = stringField(value, 'target_page', 40)
  const studentUserId = value.student_user_id
  if (
    !itemKeyPattern.test(itemKey)
    || !kindSet.has(kind)
    || !targetPages.has(targetPage as Page)
    || !Number.isFinite(Date.parse(occurredAt))
    || Date.parse(occurredAt) > Date.now() + (5 * 60 * 1000)
    || (studentUserId !== null && (typeof studentUserId !== 'string' || !uuidPattern.test(studentUserId)))
    || typeof value.is_read !== 'boolean'
    || !Number.isInteger(value.priority)
    || Number(value.priority) < 1
    || Number(value.priority) > 3
  ) throw new NotificationDomainError()
  return {
    itemKey,
    kind: kind as NotificationKind,
    title: stringField(value, 'title', 240),
    detail: stringField(value, 'detail', 320),
    occurredAt,
    targetPage: targetPage as Page,
    studentUserId: studentUserId as string | null,
    isRead: value.is_read,
    priority: Number(value.priority) as NotificationItem['priority'],
  }
}

function genericFailure(): never {
  throw new NotificationDomainError()
}

export function createNotificationService(boundary: NotificationBoundary = defaultBoundary) {
  async function listNotifications(limit = 20): Promise<NotificationItem[]> {
    try {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) return genericFailure()
      const result = await boundary.rpc('list_my_notifications', { p_limit: limit })
      if (result.error || !Array.isArray(result.data) || result.data.length > limit) return genericFailure()
      const items = result.data.map(parseItem)
      if (new Set(items.map((item) => item.itemKey)).size !== items.length) return genericFailure()
      for (let index = 1; index < items.length; index += 1) {
        const previous = items[index - 1]
        const current = items[index]
        if (current.priority > previous.priority) return genericFailure()
        if (current.priority === previous.priority && Date.parse(current.occurredAt) > Date.parse(previous.occurredAt)) return genericFailure()
      }
      return items
    } catch {
      return genericFailure()
    }
  }

  async function markRead(itemKeys: string[]) {
    try {
      if (
        !Array.isArray(itemKeys)
        || itemKeys.length < 1
        || itemKeys.length > 50
        || new Set(itemKeys).size !== itemKeys.length
        || itemKeys.some((key) => typeof key !== 'string' || !itemKeyPattern.test(key))
      ) return genericFailure()
      const result = await boundary.rpc('mark_my_notifications_read', { p_item_keys: [...itemKeys] })
      const count = typeof result.data === 'string' && /^\d+$/.test(result.data) ? Number(result.data) : result.data
      if (result.error || !Number.isSafeInteger(count) || count !== itemKeys.length) return genericFailure()
      return count as number
    } catch {
      return genericFailure()
    }
  }

  return { listNotifications, markRead }
}
