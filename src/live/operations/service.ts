import type { SupabaseClient } from '@supabase/supabase-js'
import { parseIsoTimestamp } from '../../lib/iso-timestamp'
import { hasUnsafeDisplayCharacters } from '../../lib/safe-text'
import { requireSupabase } from '../../lib/supabase'
import { OperationsDomainError, toOperationsDomainError } from './errors'
import type {
  ActiveOperationsMembership,
  CancelScheduleSessionCommand,
  CancelScheduleSlotCommand,
  CreateScheduleSlotCommand,
  OperationsPage,
  OperationsRole,
  RequestScheduleSlotCommand,
  RespondScheduleSessionCommand,
  ScheduleSession,
  ScheduleSessionListOptions,
  ScheduleSlot,
  ScheduleSlotListOptions,
  SendStudentMessageCommand,
  SendTrainerMessageCommand,
  ThreadMessage,
  ThreadMessageListOptions,
} from './types'
import {
  assertIdempotencyKey,
  assertUuid,
  isRecord,
  isScheduleMode,
  isScheduleSessionState,
  isScheduleSlotState,
  normalizeCreateSlotCommand,
  normalizeSafeText,
  parsePageOptions,
  uuidPattern,
} from './validation'

export type OperationsSupabaseClient = Pick<SupabaseClient, 'auth' | 'from' | 'rpc'>
export type OperationsService = ReturnType<typeof createOperationsService>

const membershipColumns = 'workspace_id, user_id, role, status'
const slotColumns = [
  'id',
  'workspace_id',
  'created_by_user_id',
  'created_by_role',
  'start_at',
  'duration_minutes',
  'mode',
  'place',
  'capacity',
  'state',
  'created_at',
  'updated_at',
].join(', ')
const sessionColumns = [
  'id',
  'session_sequence',
  'slot_id',
  'workspace_id',
  'student_user_id',
  'state',
  'requested_at',
  'updated_at',
].join(', ')
const messageColumns = [
  'id',
  'message_sequence',
  'workspace_id',
  'student_user_id',
  'sender_user_id',
  'sender_role',
  'body',
  'created_at',
].join(', ')

const roleSet = new Set<OperationsRole>(['owner', 'trainer', 'student'])

function unavailable(): never {
  throw new OperationsDomainError('service_unavailable')
}

function requiredString(row: Record<string, unknown>, key: string) {
  const value = row[key]
  if (typeof value !== 'string' || value.length === 0) return unavailable()
  return value
}

function requiredUuid(row: Record<string, unknown>, key: string) {
  const value = requiredString(row, key)
  if (!uuidPattern.test(value)) return unavailable()
  return value
}

function timestamp(row: Record<string, unknown>, key: string) {
  const value = requiredString(row, key)
  if (parseIsoTimestamp(value) === null) return unavailable()
  return value
}

function safeInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (
    typeof parsed !== 'number'
    || !Number.isSafeInteger(parsed)
    || parsed < minimum
    || parsed > maximum
  ) return unavailable()
  return parsed
}

function storedText(row: Record<string, unknown>, key: string, maximum: number) {
  const value = requiredString(row, key)
  if (value.length > maximum || value !== value.trim() || hasUnsafeDisplayCharacters(value)) return unavailable()
  return value
}

function rowsFrom(data: unknown) {
  if (!Array.isArray(data)) return unavailable()
  return data.map((row) => isRecord(row) ? row : unavailable())
}

function rpcRow(data: unknown) {
  if (!Array.isArray(data)) return data
  if (data.length !== 1) return unavailable()
  return data[0]
}

function parseMembership(value: unknown): ActiveOperationsMembership {
  if (!isRecord(value) || value.status !== 'active' || typeof value.role !== 'string' || !roleSet.has(value.role as OperationsRole)) {
    return unavailable()
  }
  return {
    workspaceId: requiredUuid(value, 'workspace_id'),
    userId: requiredUuid(value, 'user_id'),
    role: value.role as OperationsRole,
    status: 'active',
  }
}

function parseSlot(value: unknown): ScheduleSlot {
  if (
    !isRecord(value)
    || (value.created_by_role !== 'owner' && value.created_by_role !== 'trainer')
    || !isScheduleMode(value.mode)
    || !isScheduleSlotState(value.state)
  ) return unavailable()

  return {
    id: requiredUuid(value, 'id'),
    workspaceId: requiredUuid(value, 'workspace_id'),
    createdByUserId: requiredUuid(value, 'created_by_user_id'),
    createdByRole: value.created_by_role,
    startAt: timestamp(value, 'start_at'),
    durationMinutes: safeInteger(value.duration_minutes, 15, 240),
    mode: value.mode,
    place: storedText(value, 'place', 160),
    capacity: safeInteger(value.capacity, 1, 50),
    state: value.state,
    createdAt: timestamp(value, 'created_at'),
    updatedAt: timestamp(value, 'updated_at'),
  }
}

function parseSession(value: unknown): ScheduleSession {
  if (!isRecord(value) || !isScheduleSessionState(value.state)) return unavailable()
  return {
    id: requiredUuid(value, 'id'),
    sequence: safeInteger(value.session_sequence, 1),
    slotId: requiredUuid(value, 'slot_id'),
    workspaceId: requiredUuid(value, 'workspace_id'),
    studentUserId: requiredUuid(value, 'student_user_id'),
    state: value.state,
    requestedAt: timestamp(value, 'requested_at'),
    updatedAt: timestamp(value, 'updated_at'),
  }
}

function parseMessage(value: unknown): ThreadMessage {
  if (!isRecord(value) || typeof value.sender_role !== 'string' || !roleSet.has(value.sender_role as OperationsRole)) {
    return unavailable()
  }
  const message: ThreadMessage = {
    id: requiredUuid(value, 'id'),
    sequence: safeInteger(value.message_sequence, 1),
    workspaceId: requiredUuid(value, 'workspace_id'),
    studentUserId: requiredUuid(value, 'student_user_id'),
    senderUserId: requiredUuid(value, 'sender_user_id'),
    senderRole: value.sender_role as OperationsRole,
    body: storedText(value, 'body', 1000),
    createdAt: timestamp(value, 'created_at'),
  }
  if (message.senderRole === 'student' && message.senderUserId !== message.studentUserId) return unavailable()
  return message
}

function pageFrom<T>(items: T[], limit: number, offset: number): OperationsPage<T> {
  return {
    items: items.slice(0, limit),
    nextOffset: items.length > limit ? offset + limit : null,
  }
}

function requireTrainer(membership: ActiveOperationsMembership) {
  if (membership.role !== 'owner' && membership.role !== 'trainer') {
    throw new OperationsDomainError('record_unavailable')
  }
}

function requireStudent(membership: ActiveOperationsMembership) {
  if (membership.role !== 'student') throw new OperationsDomainError('record_unavailable')
}

async function runSafely<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toOperationsDomainError(error)
  }
}

export function createOperationsService(client: OperationsSupabaseClient = requireSupabase()) {
  async function currentUserId() {
    const { data, error } = await client.auth.getUser()
    if (error) throw error
    if (!data.user) throw new OperationsDomainError('authentication_required')
    if (!uuidPattern.test(data.user.id)) return unavailable()
    return data.user.id
  }

  async function fetchActiveMembership(): Promise<ActiveOperationsMembership> {
    return runSafely(async () => {
      const userId = await currentUserId()
      const { data, error } = await client
        .from('workspace_members')
        .select(membershipColumns)
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(2)

      if (error) throw error
      const memberships = rowsFrom(data).map(parseMembership)
      if (memberships.length === 0) throw new OperationsDomainError('membership_required')
      if (memberships.length > 1) throw new OperationsDomainError('ambiguous_workspace')
      if (memberships[0].userId !== userId) return unavailable()
      return memberships[0]
    })
  }

  async function requireLinkedStudent(workspaceId: string, studentUserId: string) {
    const { data, error } = await client
      .from('workspace_members')
      .select(membershipColumns)
      .eq('workspace_id', workspaceId)
      .eq('user_id', studentUserId)
      .eq('role', 'student')
      .eq('status', 'active')
      .limit(2)

    if (error) throw error
    const memberships = rowsFrom(data).map(parseMembership)
    if (
      memberships.length !== 1
      || memberships[0].workspaceId !== workspaceId
      || memberships[0].userId !== studentUserId
      || memberships[0].role !== 'student'
    ) throw new OperationsDomainError('record_unavailable')
  }

  async function createScheduleSlot(command: CreateScheduleSlotCommand): Promise<ScheduleSlot> {
    return runSafely(async () => {
      const payload = normalizeCreateSlotCommand(command)
      const membership = await fetchActiveMembership()
      requireTrainer(membership)
      const { data, error } = await client.rpc('create_schedule_slot', {
        p_start_at: payload.startAt,
        p_duration_minutes: payload.durationMinutes,
        p_mode: payload.mode,
        p_place: payload.place,
        p_capacity: payload.capacity,
        p_idempotency_key: payload.idempotencyKey,
      })

      if (error) throw error
      const slot = parseSlot(rpcRow(data))
      if (
        slot.workspaceId !== membership.workspaceId
        || slot.createdByUserId !== membership.userId
        || slot.createdByRole !== membership.role
        || Date.parse(slot.startAt) !== Date.parse(payload.startAt)
        || slot.durationMinutes !== payload.durationMinutes
        || slot.mode !== payload.mode
        || slot.place !== payload.place
        || slot.capacity !== payload.capacity
      ) return unavailable()
      return slot
    })
  }

  async function requestScheduleSlot(command: RequestScheduleSlotCommand): Promise<ScheduleSession> {
    return runSafely(async () => {
      if (!isRecord(command)) throw new OperationsDomainError('validation')
      const idempotencyKey = assertIdempotencyKey(command.idempotencyKey)
      assertUuid(command.slotId, 'slotId')
      const membership = await fetchActiveMembership()
      requireStudent(membership)
      const { data, error } = await client.rpc('request_schedule_slot', {
        p_slot_id: command.slotId,
        p_idempotency_key: idempotencyKey,
      })

      if (error) throw error
      const session = parseSession(rpcRow(data))
      if (
        session.workspaceId !== membership.workspaceId
        || session.studentUserId !== membership.userId
        || session.slotId !== command.slotId
      ) return unavailable()
      return session
    })
  }

  async function respondScheduleSession(command: RespondScheduleSessionCommand): Promise<ScheduleSession> {
    return runSafely(async () => {
      if (!isRecord(command)) throw new OperationsDomainError('validation')
      const idempotencyKey = assertIdempotencyKey(command.idempotencyKey)
      assertUuid(command.sessionId, 'sessionId')
      if (command.decision !== 'confirmed' && command.decision !== 'declined') {
        throw new OperationsDomainError('validation', { fieldErrors: { decision: 'Decisão inválida.' } })
      }
      const membership = await fetchActiveMembership()
      requireTrainer(membership)
      const { data, error } = await client.rpc('respond_schedule_session', {
        p_session_id: command.sessionId,
        p_decision: command.decision,
        p_idempotency_key: idempotencyKey,
      })

      if (error) throw error
      const session = parseSession(rpcRow(data))
      if (session.id !== command.sessionId || session.workspaceId !== membership.workspaceId) return unavailable()
      return session
    })
  }

  async function cancelOwnScheduleSession(command: CancelScheduleSessionCommand): Promise<ScheduleSession> {
    return runSafely(async () => {
      if (!isRecord(command)) throw new OperationsDomainError('validation')
      const idempotencyKey = assertIdempotencyKey(command.idempotencyKey)
      assertUuid(command.sessionId, 'sessionId')
      const membership = await fetchActiveMembership()
      requireStudent(membership)
      const { data, error } = await client.rpc('cancel_own_schedule_session', {
        p_session_id: command.sessionId,
        p_idempotency_key: idempotencyKey,
      })

      if (error) throw error
      const session = parseSession(rpcRow(data))
      if (
        session.id !== command.sessionId
        || session.workspaceId !== membership.workspaceId
        || session.studentUserId !== membership.userId
        || session.state !== 'cancelled'
      ) return unavailable()
      return session
    })
  }

  async function cancelScheduleSession(command: CancelScheduleSessionCommand): Promise<ScheduleSession> {
    return runSafely(async () => {
      if (!isRecord(command)) throw new OperationsDomainError('validation')
      const idempotencyKey = assertIdempotencyKey(command.idempotencyKey)
      assertUuid(command.sessionId, 'sessionId')
      const membership = await fetchActiveMembership()
      requireTrainer(membership)
      const { data, error } = await client.rpc('cancel_schedule_session', {
        p_session_id: command.sessionId,
        p_idempotency_key: idempotencyKey,
      })

      if (error) throw error
      const session = parseSession(rpcRow(data))
      if (
        session.id !== command.sessionId
        || session.workspaceId !== membership.workspaceId
        || session.state !== 'cancelled'
      ) return unavailable()
      return session
    })
  }

  async function cancelScheduleSlot(command: CancelScheduleSlotCommand): Promise<ScheduleSlot> {
    return runSafely(async () => {
      if (!isRecord(command)) throw new OperationsDomainError('validation')
      const idempotencyKey = assertIdempotencyKey(command.idempotencyKey)
      assertUuid(command.slotId, 'slotId')
      const membership = await fetchActiveMembership()
      requireTrainer(membership)
      const { data, error } = await client.rpc('cancel_schedule_slot', {
        p_slot_id: command.slotId,
        p_idempotency_key: idempotencyKey,
      })

      if (error) throw error
      const slot = parseSlot(rpcRow(data))
      if (
        slot.id !== command.slotId
        || slot.workspaceId !== membership.workspaceId
        || slot.state !== 'cancelled'
      ) return unavailable()
      return slot
    })
  }

  async function sendStudentThreadMessage(command: SendStudentMessageCommand): Promise<ThreadMessage> {
    return runSafely(async () => {
      if (!isRecord(command)) throw new OperationsDomainError('validation')
      const idempotencyKey = assertIdempotencyKey(command.idempotencyKey)
      const body = normalizeSafeText(command.body, 'body', 1000)
      const membership = await fetchActiveMembership()
      requireStudent(membership)
      const { data, error } = await client.rpc('send_student_thread_message', {
        p_body: body,
        p_idempotency_key: idempotencyKey,
      })

      if (error) throw error
      const message = parseMessage(rpcRow(data))
      if (
        message.workspaceId !== membership.workspaceId
        || message.studentUserId !== membership.userId
        || message.senderUserId !== membership.userId
        || message.senderRole !== 'student'
        || message.body !== body
      ) return unavailable()
      return message
    })
  }

  async function sendTrainerThreadMessage(command: SendTrainerMessageCommand): Promise<ThreadMessage> {
    return runSafely(async () => {
      if (!isRecord(command)) throw new OperationsDomainError('validation')
      const idempotencyKey = assertIdempotencyKey(command.idempotencyKey)
      assertUuid(command.studentUserId, 'studentUserId')
      const body = normalizeSafeText(command.body, 'body', 1000)
      const membership = await fetchActiveMembership()
      requireTrainer(membership)
      await requireLinkedStudent(membership.workspaceId, command.studentUserId)
      const { data, error } = await client.rpc('send_trainer_thread_message', {
        p_student_user_id: command.studentUserId,
        p_body: body,
        p_idempotency_key: idempotencyKey,
      })

      if (error) throw error
      const message = parseMessage(rpcRow(data))
      if (
        message.workspaceId !== membership.workspaceId
        || message.studentUserId !== command.studentUserId
        || message.senderUserId !== membership.userId
        || message.senderRole !== membership.role
        || message.body !== body
      ) return unavailable()
      return message
    })
  }

  async function listScheduleSlots(options: ScheduleSlotListOptions = {}): Promise<OperationsPage<ScheduleSlot>> {
    return runSafely(async () => {
      const page = parsePageOptions(options)
      if (options.state !== undefined && !isScheduleSlotState(options.state)) {
        throw new OperationsDomainError('validation', { fieldErrors: { state: 'Estado inválido.' } })
      }
      const membership = await fetchActiveMembership()
      let query = client
        .from('schedule_slots')
        .select(slotColumns)
        .eq('workspace_id', membership.workspaceId)
      if (options.state !== undefined) query = query.eq('state', options.state)
      const { data, error } = await query
        .order('start_at', { ascending: true })
        .order('id', { ascending: true })
        .range(page.offset, page.offset + page.limit)

      if (error) throw error
      const slots = rowsFrom(data).map(parseSlot)
      if (slots.some((slot) => slot.workspaceId !== membership.workspaceId)) return unavailable()
      return pageFrom(slots, page.limit, page.offset)
    })
  }

  async function listScheduleSessions(
    options: ScheduleSessionListOptions = {},
  ): Promise<OperationsPage<ScheduleSession>> {
    return runSafely(async () => {
      const page = parsePageOptions(options)
      if (options.state !== undefined && !isScheduleSessionState(options.state)) {
        throw new OperationsDomainError('validation', { fieldErrors: { state: 'Estado inválido.' } })
      }
      const membership = await fetchActiveMembership()
      let subject: string | undefined
      if (membership.role === 'student') {
        if (options.studentUserId !== undefined && options.studentUserId !== membership.userId) {
          throw new OperationsDomainError('record_unavailable')
        }
        subject = membership.userId
      } else if (options.studentUserId !== undefined) {
        assertUuid(options.studentUserId, 'studentUserId')
        await requireLinkedStudent(membership.workspaceId, options.studentUserId)
        subject = options.studentUserId
      }

      let query = client
        .from('schedule_sessions')
        .select(sessionColumns)
        .eq('workspace_id', membership.workspaceId)
      if (subject) query = query.eq('student_user_id', subject)
      if (options.state !== undefined) query = query.eq('state', options.state)
      const { data, error } = await query
        .order('requested_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page.offset, page.offset + page.limit)

      if (error) throw error
      const sessions = rowsFrom(data).map(parseSession)
      if (sessions.some((session) =>
        session.workspaceId !== membership.workspaceId
        || (subject !== undefined && session.studentUserId !== subject))) return unavailable()
      return pageFrom(sessions, page.limit, page.offset)
    })
  }

  async function listThreadMessages(
    options: ThreadMessageListOptions = {},
  ): Promise<OperationsPage<ThreadMessage>> {
    return runSafely(async () => {
      const page = parsePageOptions(options)
      const membership = await fetchActiveMembership()
      let subject: string
      if (membership.role === 'student') {
        if (options.studentUserId !== undefined && options.studentUserId !== membership.userId) {
          throw new OperationsDomainError('record_unavailable')
        }
        subject = membership.userId
      } else {
        assertUuid(options.studentUserId, 'studentUserId')
        subject = options.studentUserId
        await requireLinkedStudent(membership.workspaceId, subject)
      }

      const { data, error } = await client
        .from('thread_messages')
        .select(messageColumns)
        .eq('workspace_id', membership.workspaceId)
        .eq('student_user_id', subject)
        .order('message_sequence', { ascending: false })
        .order('id', { ascending: false })
        .range(page.offset, page.offset + page.limit)

      if (error) throw error
      const messages = rowsFrom(data).map(parseMessage)
      if (messages.some((message) =>
        message.workspaceId !== membership.workspaceId
        || message.studentUserId !== subject)) return unavailable()
      return pageFrom(messages, page.limit, page.offset)
    })
  }

  return {
    fetchActiveMembership,
    createScheduleSlot,
    requestScheduleSlot,
    respondScheduleSession,
    cancelOwnScheduleSession,
    cancelScheduleSession,
    cancelScheduleSlot,
    sendStudentThreadMessage,
    sendTrainerThreadMessage,
    listScheduleSlots,
    listScheduleSessions,
    listThreadMessages,
  }
}
