import { requireSupabase } from '../lib/supabase'
import { idempotencyKeyPattern } from '../signals/idempotency'
import { boundedText, isCanonicalUuid, parseIsoTimestamp } from './boundary-validation'

export const verificationAccessErrorMessage = 'Não foi possível validar seu acesso profissional agora.'
export const verificationSubmitErrorMessage = 'Não foi possível enviar sua verificação profissional agora. Revise os dados e tente novamente.'

export type ProfessionalVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected'
export type ProfessionalAccessMode = 'blocked' | 'verified' | 'temporary_homologation'

export type ProfessionalAccess = {
  userId: string
  workspaceId: string
  status: ProfessionalVerificationStatus
  crefNumber: string
  crefState: string
  studioName: string | null
  submittedAt: string | null
  decidedAt: string | null
  rejectionReason: string | null
  mode: ProfessionalAccessMode
  temporaryAccessExpiresAt: string | null
}

export type SubmitTrainerVerificationCommand = {
  crefNumber: string
  crefState: string
  studioName: string | null
  idempotencyKey: string
}

export type TrainerVerificationRpcResult = { data: unknown; error: unknown }

export type TrainerVerificationRpcBoundary = {
  call: (
    functionName: string,
    arguments_: Record<string, string | null>,
  ) => Promise<TrainerVerificationRpcResult>
}

const supabaseBoundary: TrainerVerificationRpcBoundary = {
  async call(functionName, arguments_) {
    const { data, error } = await requireSupabase().rpc(functionName, arguments_)
    return { data, error }
  },
}

const crefNumberPattern = /^[0-9A-Z/-]{4,24}$/
const crefStatePattern = /^[A-Z]{2}$/
const controlCharacterPattern = /[\u0000-\u001F\u007F-\u009F]/
const futureTimestampToleranceMs = 5 * 60 * 1000

export function normalizeCrefNumber(value: string) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

export function normalizeCrefState(value: string) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

export function normalizeStudioName(value: string | null) {
  if (value === null) return null
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function isVerificationStatus(value: unknown): value is ProfessionalVerificationStatus {
  return value === 'unverified' || value === 'pending' || value === 'verified' || value === 'rejected'
}

function isAccessMode(value: unknown): value is ProfessionalAccessMode {
  return value === 'blocked' || value === 'verified' || value === 'temporary_homologation'
}

function nullableIsoTimestamp(value: unknown) {
  if (value === null) return { value: null, timestamp: null, valid: true } as const
  const timestamp = parseIsoTimestamp(value)
  return typeof value === 'string' && timestamp !== null
    ? { value, timestamp, valid: true } as const
    : { value: null, timestamp: null, valid: false } as const
}

function nullableBoundedText(value: unknown, minimum: number, maximum: number) {
  if (value === null) return { value: null, valid: true } as const
  const parsed = boundedText(value, minimum, maximum)
  return parsed && parsed === value
    ? { value: parsed, valid: true } as const
    : { value: null, valid: false } as const
}

/**
 * Parses one access row while binding it to the authenticated identity and
 * workspace expected by the caller. Invalid or internally inconsistent rows
 * are rejected instead of being partially trusted.
 */
export function parseProfessionalAccess(
  value: unknown,
  expectedWorkspaceId: string,
  expectedUserId: string,
  now = Date.now(),
): ProfessionalAccess | null {
  if (!Number.isFinite(now) || !value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>

  if (
    !isCanonicalUuid(expectedWorkspaceId)
    || !isCanonicalUuid(expectedUserId)
    || row.workspace_id !== expectedWorkspaceId
    || row.user_id !== expectedUserId
    || !isVerificationStatus(row.verification_status)
    || !isAccessMode(row.access_mode)
  ) return null

  const crefNumber = typeof row.cref_number === 'string' ? row.cref_number : ''
  const crefState = typeof row.cref_state === 'string' ? row.cref_state : ''
  const studioName = nullableBoundedText(row.studio_name, 2, 80)
  const rejectionReason = nullableBoundedText(row.verification_rejection_reason, 2, 500)
  const submittedAt = nullableIsoTimestamp(row.verification_submitted_at)
  const decidedAt = nullableIsoTimestamp(row.verification_decided_at)
  const temporaryExpiresAt = nullableIsoTimestamp(row.temporary_access_expires_at)

  if (
    !crefNumberPattern.test(crefNumber)
    || crefNumber !== normalizeCrefNumber(crefNumber)
    || !crefStatePattern.test(crefState)
    || !studioName.valid
    || (studioName.value !== null && controlCharacterPattern.test(studioName.value))
    || !rejectionReason.valid
    || (rejectionReason.value !== null && controlCharacterPattern.test(rejectionReason.value))
    || !submittedAt.valid
    || !decidedAt.valid
    || !temporaryExpiresAt.valid
  ) return null

  const status = row.verification_status
  const mode = row.access_mode
  const submittedTime = submittedAt.timestamp
  const decidedTime = decidedAt.timestamp
  const temporaryExpirationTime = temporaryExpiresAt.timestamp

  if (
    (submittedTime !== null && submittedTime > now + futureTimestampToleranceMs)
    || (decidedTime !== null && decidedTime > now + futureTimestampToleranceMs)
    || (submittedTime !== null && decidedTime !== null && decidedTime < submittedTime)
  ) return null

  const stateIsConsistent =
    (status === 'unverified'
      && submittedTime === null
      && decidedTime === null
      && rejectionReason.value === null)
    || (status === 'pending'
      && submittedTime !== null
      && decidedTime === null
      && rejectionReason.value === null)
    || (status === 'verified'
      && submittedTime !== null
      && decidedTime !== null
      && rejectionReason.value === null)
    || (status === 'rejected'
      && submittedTime !== null
      && decidedTime !== null
      && rejectionReason.value !== null)
  if (!stateIsConsistent) return null

  const accessIsConsistent =
    (mode === 'verified' && status === 'verified' && temporaryExpirationTime === null)
    || (mode === 'temporary_homologation' && status !== 'verified' && temporaryExpirationTime !== null && temporaryExpirationTime > now)
    || (mode === 'blocked' && status !== 'verified' && temporaryExpirationTime === null)
  if (!accessIsConsistent) return null

  return {
    userId: expectedUserId,
    workspaceId: expectedWorkspaceId,
    status,
    crefNumber,
    crefState,
    studioName: studioName.value,
    submittedAt: submittedAt.value,
    decidedAt: decidedAt.value,
    rejectionReason: rejectionReason.value,
    mode,
    temporaryAccessExpiresAt: temporaryExpiresAt.value,
  }
}

export async function getProfessionalAccess(
  workspaceId: string,
  expectedUserId: string,
  boundary: TrainerVerificationRpcBoundary = supabaseBoundary,
): Promise<ProfessionalAccess> {
  if (!isCanonicalUuid(workspaceId) || !isCanonicalUuid(expectedUserId)) {
    throw new Error(verificationAccessErrorMessage)
  }

  try {
    const result = await boundary.call('get_my_professional_access', { p_workspace_id: workspaceId })
    if (result.error || !Array.isArray(result.data) || result.data.length !== 1) {
      throw new Error(verificationAccessErrorMessage)
    }
    const access = parseProfessionalAccess(result.data[0], workspaceId, expectedUserId)
    if (!access) throw new Error(verificationAccessErrorMessage)
    return access
  } catch {
    throw new Error(verificationAccessErrorMessage)
  }
}

export async function submitTrainerVerification(
  command: SubmitTrainerVerificationCommand,
  boundary: TrainerVerificationRpcBoundary = supabaseBoundary,
): Promise<string> {
  if (!command || typeof command !== 'object') throw new Error(verificationSubmitErrorMessage)
  const crefNumber = normalizeCrefNumber(command.crefNumber)
  const crefState = normalizeCrefState(command.crefState)
  const studioName = normalizeStudioName(command.studioName)

  if (
    !crefNumberPattern.test(crefNumber)
    || !crefStatePattern.test(crefState)
    || (command.studioName !== null && typeof command.studioName !== 'string')
    || (studioName !== null && (!boundedText(studioName, 2, 80) || controlCharacterPattern.test(studioName)))
    || !idempotencyKeyPattern.test(command.idempotencyKey)
  ) throw new Error(verificationSubmitErrorMessage)

  try {
    const result = await boundary.call('submit_trainer_verification', {
      p_cref_number: crefNumber,
      p_cref_state: crefState,
      p_studio_name: studioName,
      p_idempotency_key: command.idempotencyKey,
    })
    if (result.error || !isCanonicalUuid(result.data)) throw new Error(verificationSubmitErrorMessage)
    return result.data
  } catch {
    throw new Error(verificationSubmitErrorMessage)
  }
}
