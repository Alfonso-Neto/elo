import { describe, expect, it, vi } from 'vitest'
import {
  acceptWorkspaceInvitation,
  createWorkspaceInvitation,
  invitationCreationErrorMessage,
  invitationErrorMessage,
  listEnrolledStudents,
  type EnrollmentRpcBoundary,
} from './enrollment-service'

const validCode = 'ELO-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-1111-2222'
const validWorkspaceId = '23ccf1ec-a377-4b45-a401-11d28a8a1503'
const validStudentId = '0a258739-7658-4012-b747-0f95dca6372c'

function boundaryWith(data: unknown, error: unknown = null) {
  const call = vi.fn(async (_functionName: string, _arguments_: Record<string, string>) => ({ data, error }))
  return { boundary: { call } satisfies EnrollmentRpcBoundary, call }
}

describe('workspace enrollment service', () => {
  it('rejects an invalid email before any remote call', async () => {
    const { boundary, call } = boundaryWith(null)
    await expect(createWorkspaceInvitation('not-an-email', boundary)).rejects.toThrow(invitationCreationErrorMessage)
    expect(call).not.toHaveBeenCalled()
  })

  it('creates a code using only the normalized invited email parameter', async () => {
    const expiration = new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString()
    const { boundary, call } = boundaryWith([{
      invitation_code: validCode,
      expires_at: expiration,
      invited_email_normalized: 'aluna@example.com',
    }])
    await expect(createWorkspaceInvitation('  ALUNA@example.com ', boundary)).resolves.toEqual({
      code: validCode,
      email: 'aluna@example.com',
      expiresAt: expiration,
    })
    expect(call).toHaveBeenCalledWith('create_workspace_invitation', { invited_email: 'aluna@example.com' })
    expect(Object.keys(call.mock.calls[0][1])).toEqual(['invited_email'])
  })

  it('accepts through a body argument without workspace or user identifiers', async () => {
    const { boundary, call } = boundaryWith([{
      workspace_id: validWorkspaceId,
      workspace_name: 'Studio Horizonte',
      trainer_name: 'André Lima',
    }])
    await expect(acceptWorkspaceInvitation(`  ${validCode.toLowerCase()}  `, boundary)).resolves.toMatchObject({
      workspaceName: 'Studio Horizonte',
      trainerName: 'André Lima',
    })
    expect(call).toHaveBeenCalledWith('accept_workspace_invitation', { invitation_code: validCode })
    expect(Object.keys(call.mock.calls[0][1])).toEqual(['invitation_code'])
  })

  it('maps replay, expiry, email mismatch, and transport failures to one generic response', async () => {
    const privateDetail = 'duplicate key token_hash=secret-value'
    const { boundary } = boundaryWith(null, { message: privateDetail })
    const result = acceptWorkspaceInvitation(validCode, boundary)
    await expect(result).rejects.toThrow(invitationErrorMessage)
    await expect(result).rejects.not.toThrow(privateDetail)
  })

  it('validates student list rows at the service boundary', async () => {
    const { boundary } = boundaryWith([{ user_id: validStudentId, display_name: 'Marina Costa', joined_at: null }])
    await expect(listEnrolledStudents(boundary)).resolves.toEqual([{ userId: validStudentId, displayName: 'Marina Costa', joinedAt: null }])

    const malformed = boundaryWith([{ user_id: '', display_name: 'Marina Costa' }]).boundary
    await expect(listEnrolledStudents(malformed)).rejects.toThrow('Não foi possível carregar seus alunos agora.')
  })

  it('fails closed on malformed UUIDs, timestamps, and bounded names', async () => {
    const invalidAcceptedId = boundaryWith([{
      workspace_id: 'workspace-1',
      workspace_name: 'Studio Horizonte',
      trainer_name: 'André Lima',
    }]).boundary
    await expect(acceptWorkspaceInvitation(validCode, invalidAcceptedId)).rejects.toThrow(invitationErrorMessage)

    const invalidAcceptedName = boundaryWith([{
      workspace_id: validWorkspaceId,
      workspace_name: 'x'.repeat(81),
      trainer_name: 'André Lima',
    }]).boundary
    await expect(acceptWorkspaceInvitation(validCode, invalidAcceptedName)).rejects.toThrow(invitationErrorMessage)

    const distantExpiration = boundaryWith([{
      invitation_code: validCode,
      expires_at: new Date(Date.now() + (90 * 60 * 60 * 1000)).toISOString(),
      invited_email_normalized: 'aluna@example.com',
    }]).boundary
    await expect(createWorkspaceInvitation('aluna@example.com', distantExpiration)).rejects.toThrow(invitationCreationErrorMessage)

    const malformedStudent = boundaryWith([{
      user_id: 'student-1',
      display_name: 'Marina Costa',
      joined_at: 'not-a-timestamp',
    }]).boundary
    await expect(listEnrolledStudents(malformedStudent)).rejects.toThrow('Não foi possível carregar seus alunos agora.')
  })
})
