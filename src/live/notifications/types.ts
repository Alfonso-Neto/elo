import type { Page } from '../../types'

export const notificationKinds = [
  'pain_report', 'schedule_request', 'anamnesis_submission', 'workout_completion',
  'message', 'workout', 'anamnesis', 'schedule', 'nutrition', 'pain_update',
] as const

export type NotificationKind = (typeof notificationKinds)[number]

export type NotificationItem = {
  itemKey: string
  kind: NotificationKind
  title: string
  detail: string
  occurredAt: string
  targetPage: Page
  studentUserId: string | null
  isRead: boolean
  priority: 1 | 2 | 3
}
