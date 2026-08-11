import { parseIsoTimestamp } from '../../lib/iso-timestamp'
import { hasUnsafeDisplayCharacters } from '../../lib/safe-text'
import { OperationsDomainError } from './errors'
import {
  scheduleModes,
  scheduleSessionStates,
  scheduleSlotStates,
  type CreateScheduleSlotCommand,
  type OperationsPageOptions,
  type ScheduleMode,
  type ScheduleSessionState,
  type ScheduleSlotState,
} from './types'

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/

const scheduleModeSet = new Set<string>(scheduleModes)
const scheduleSlotStateSet = new Set<string>(scheduleSlotStates)
const scheduleSessionStateSet = new Set<string>(scheduleSessionStates)
const maximumPageOffset = 100_000

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function assertUuid(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new OperationsDomainError('validation', { fieldErrors: { [field]: 'Identificador inválido.' } })
  }
}

export function assertIdempotencyKey(value: unknown) {
  if (typeof value !== 'string' || !idempotencyKeyPattern.test(value)) {
    throw new OperationsDomainError('validation', {
      fieldErrors: { idempotencyKey: 'A identificação desta solicitação é inválida.' },
    })
  }
  return value
}

export function normalizeSafeText(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > maximum
    || hasUnsafeDisplayCharacters(value)
  ) {
    throw new OperationsDomainError('validation', {
      fieldErrors: { [field]: `Use um texto de 1 a ${maximum} caracteres.` },
    })
  }

  const normalized = value.trim().replace(/ {2,}/g, ' ')
  if (normalized.length < 1 || normalized.length > maximum) {
    throw new OperationsDomainError('validation', {
      fieldErrors: { [field]: `Use um texto de 1 a ${maximum} caracteres.` },
    })
  }
  return normalized
}

export function parsePageOptions(options: OperationsPageOptions = {}) {
  if (!isRecord(options)) throw new OperationsDomainError('validation')
  const limit = options.limit ?? 25
  const offset = options.offset ?? 0
  if (
    !Number.isSafeInteger(limit)
    || limit < 1
    || limit > 50
    || !Number.isSafeInteger(offset)
    || offset < 0
    || offset > maximumPageOffset
  ) {
    throw new OperationsDomainError('validation', {
      fieldErrors: { pagination: 'Use limite de 1 a 50 e deslocamento válido.' },
    })
  }
  return { limit, offset }
}

export function isScheduleMode(value: unknown): value is ScheduleMode {
  return typeof value === 'string' && scheduleModeSet.has(value)
}

export function isScheduleSlotState(value: unknown): value is ScheduleSlotState {
  return typeof value === 'string' && scheduleSlotStateSet.has(value)
}

export function isScheduleSessionState(value: unknown): value is ScheduleSessionState {
  return typeof value === 'string' && scheduleSessionStateSet.has(value)
}

export function normalizeCreateSlotCommand(
  command: CreateScheduleSlotCommand,
  nowMilliseconds = Date.now(),
) {
  if (!isRecord(command)) throw new OperationsDomainError('validation')
  const idempotencyKey = assertIdempotencyKey(command.idempotencyKey)
  if (typeof command.startAt !== 'string') {
    throw new OperationsDomainError('validation', { fieldErrors: { startAt: 'Informe uma data válida.' } })
  }
  const startMilliseconds = parseIsoTimestamp(command.startAt)
  if (
    startMilliseconds === null
    || startMilliseconds < nowMilliseconds + (5 * 60 * 1000)
    || startMilliseconds > nowMilliseconds + (365 * 24 * 60 * 60 * 1000)
  ) {
    throw new OperationsDomainError('validation', {
      fieldErrors: { startAt: 'Escolha um horário entre 5 minutos e 365 dias.' },
    })
  }
  if (!Number.isInteger(command.durationMinutes) || command.durationMinutes < 15 || command.durationMinutes > 240) {
    throw new OperationsDomainError('validation', {
      fieldErrors: { durationMinutes: 'Use uma duração entre 15 e 240 minutos.' },
    })
  }
  if (!isScheduleMode(command.mode)) {
    throw new OperationsDomainError('validation', { fieldErrors: { mode: 'Modalidade inválida.' } })
  }
  if (!Number.isInteger(command.capacity) || command.capacity < 1 || command.capacity > 50) {
    throw new OperationsDomainError('validation', { fieldErrors: { capacity: 'Use uma capacidade entre 1 e 50.' } })
  }
  return {
    idempotencyKey,
    startAt: new Date(startMilliseconds).toISOString(),
    durationMinutes: command.durationMinutes,
    mode: command.mode,
    place: normalizeSafeText(command.place, 'place', 160),
    capacity: command.capacity,
  }
}
