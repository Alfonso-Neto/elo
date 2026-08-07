import { requireSupabase } from '../lib/supabase'
import { boundedText, isCanonicalUuid, parseIsoTimestamp } from './boundary-validation'

export const invitationErrorMessage = 'Não foi possível validar este convite. Confira o código ou solicite um novo ao seu professor.'
export const invitationCreationErrorMessage = 'Não foi possível gerar o convite agora. Tente novamente em alguns instantes.'
export const studentListErrorMessage = 'Não foi possível carregar seus alunos agora.'

export type CreatedInvitation = {
  code: string
  email: string
  expiresAt: string
}

export type AcceptedInvitation = {
  workspaceId: string
  workspaceName: string
  trainerName: string
}

export type EnrolledStudent = {
  userId: string
  displayName: string
  joinedAt: string | null
}

export type RpcResult = { data: unknown; error: unknown }

export type EnrollmentRpcBoundary = {
  call: (functionName: string, arguments_: Record<string, string>) => Promise<RpcResult>
}

const supabaseBoundary: EnrollmentRpcBoundary = {
  async call(functionName, arguments_) {
    const { data, error } = await requireSupabase().rpc(functionName, arguments_)
    return { data, error }
  },
}

const codePattern = /^ELO-([A-F0-9]{4}-){7}[A-F0-9]{4}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeInvitationEmail(value: string) {
  return value.trim().toLowerCase()
}

export function normalizeInvitationCode(value: string) {
  return value.trim().toUpperCase()
}

function firstRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value
  return row && typeof row === 'object' ? row as Record<string, unknown> : null
}

export async function createWorkspaceInvitation(email: string, boundary: EnrollmentRpcBoundary = supabaseBoundary): Promise<CreatedInvitation> {
  const normalizedEmail = normalizeInvitationEmail(email)
  if (!emailPattern.test(normalizedEmail) || normalizedEmail.length > 320) {
    throw new Error(invitationCreationErrorMessage)
  }

  let result: RpcResult
  try {
    result = await boundary.call('create_workspace_invitation', { invited_email: normalizedEmail })
  } catch {
    throw new Error(invitationCreationErrorMessage)
  }
  if (result.error) throw new Error(invitationCreationErrorMessage)

  const row = firstRow(result.data)
  const code = typeof row?.invitation_code === 'string' ? row.invitation_code : ''
  const expiresAt = typeof row?.expires_at === 'string' ? row.expires_at : ''
  const invitedEmail = typeof row?.invited_email_normalized === 'string' ? row.invited_email_normalized : ''
  const expirationTime = parseIsoTimestamp(expiresAt)
  const now = Date.now()
  if (
    !codePattern.test(code)
    || expirationTime === null
    || expirationTime <= now
    || expirationTime > now + (73 * 60 * 60 * 1000)
    || invitedEmail.length > 320
    || invitedEmail !== normalizedEmail
  ) {
    throw new Error(invitationCreationErrorMessage)
  }
  return { code, email: invitedEmail, expiresAt }
}

export async function acceptWorkspaceInvitation(code: string, boundary: EnrollmentRpcBoundary = supabaseBoundary): Promise<AcceptedInvitation> {
  const normalizedCode = normalizeInvitationCode(code)
  if (!codePattern.test(normalizedCode)) throw new Error(invitationErrorMessage)

  let result: RpcResult
  try {
    result = await boundary.call('accept_workspace_invitation', { invitation_code: normalizedCode })
  } catch {
    throw new Error(invitationErrorMessage)
  }
  if (result.error) throw new Error(invitationErrorMessage)

  const row = firstRow(result.data)
  const workspaceId = typeof row?.workspace_id === 'string' ? row.workspace_id : ''
  const workspaceName = boundedText(row?.workspace_name)
  const trainerName = boundedText(row?.trainer_name)
  if (!isCanonicalUuid(workspaceId) || !workspaceName || !trainerName) throw new Error(invitationErrorMessage)
  return { workspaceId, workspaceName, trainerName }
}

export async function listEnrolledStudents(boundary: EnrollmentRpcBoundary = supabaseBoundary): Promise<EnrolledStudent[]> {
  let result: RpcResult
  try {
    result = await boundary.call('list_my_students', {})
  } catch {
    throw new Error(studentListErrorMessage)
  }
  if (result.error || !Array.isArray(result.data)) throw new Error(studentListErrorMessage)

  return result.data.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') throw new Error(studentListErrorMessage)
    const row = candidate as Record<string, unknown>
    const userId = typeof row.user_id === 'string' ? row.user_id : ''
    const displayName = boundedText(row.display_name)
    const joinedAt = row.joined_at === null || typeof row.joined_at === 'string' ? row.joined_at : null
    const joinedTime = joinedAt === null ? null : parseIsoTimestamp(joinedAt)
    if (
      !isCanonicalUuid(userId)
      || !displayName
      || (joinedAt !== null && joinedTime === null)
      || (joinedTime !== null && joinedTime > Date.now() + (5 * 60 * 1000))
    ) throw new Error(studentListErrorMessage)
    return { userId, displayName, joinedAt }
  })
}
