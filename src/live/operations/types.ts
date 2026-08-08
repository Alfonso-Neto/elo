export const scheduleModes = ['in_person', 'online', 'group'] as const
export type ScheduleMode = (typeof scheduleModes)[number]

export const scheduleSlotStates = ['open', 'full', 'cancelled'] as const
export type ScheduleSlotState = (typeof scheduleSlotStates)[number]

export const scheduleSessionStates = ['requested', 'confirmed', 'declined', 'cancelled'] as const
export type ScheduleSessionState = (typeof scheduleSessionStates)[number]

export type OperationsRole = 'owner' | 'trainer' | 'student'

export type ActiveOperationsMembership = {
  workspaceId: string
  userId: string
  role: OperationsRole
  status: 'active'
}

export type ScheduleSlot = {
  id: string
  workspaceId: string
  createdByUserId: string
  createdByRole: 'owner' | 'trainer'
  startAt: string
  durationMinutes: number
  mode: ScheduleMode
  place: string
  capacity: number
  state: ScheduleSlotState
  createdAt: string
  updatedAt: string
}

export type ScheduleSession = {
  id: string
  sequence: number
  slotId: string
  workspaceId: string
  studentUserId: string
  state: ScheduleSessionState
  requestedAt: string
  updatedAt: string
}

export type ThreadMessage = {
  id: string
  sequence: number
  workspaceId: string
  studentUserId: string
  senderUserId: string
  senderRole: OperationsRole
  body: string
  createdAt: string
}

export type OperationsPageOptions = {
  limit?: number
  offset?: number
}

export type OperationsPage<T> = {
  items: T[]
  nextOffset: number | null
}

export type ScheduleSlotListOptions = OperationsPageOptions & {
  state?: ScheduleSlotState
}

export type ScheduleSessionListOptions = OperationsPageOptions & {
  state?: ScheduleSessionState
  studentUserId?: string
}

export type ThreadMessageListOptions = OperationsPageOptions & {
  studentUserId?: string
}

export type CreateScheduleSlotCommand = {
  idempotencyKey: string
  startAt: string
  durationMinutes: number
  mode: ScheduleMode
  place: string
  capacity: number
}

export type RequestScheduleSlotCommand = {
  idempotencyKey: string
  slotId: string
}

export type RespondScheduleSessionCommand = {
  idempotencyKey: string
  sessionId: string
  decision: 'confirmed' | 'declined'
}

export type CancelScheduleSessionCommand = {
  idempotencyKey: string
  sessionId: string
}

export type CancelScheduleSlotCommand = {
  idempotencyKey: string
  slotId: string
}

export type SendStudentMessageCommand = {
  idempotencyKey: string
  body: string
}

export type SendTrainerMessageCommand = SendStudentMessageCommand & {
  studentUserId: string
}
