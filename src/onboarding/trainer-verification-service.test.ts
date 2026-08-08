import { describe, expect, it, vi } from 'vitest'
import {
  getProfessionalAccess,
  normalizeCrefNumber,
  normalizeCrefState,
  normalizeStudioName,
  parseProfessionalAccess,
  submitTrainerVerification,
  verificationAccessErrorMessage,
  verificationSubmitErrorMessage,
  type TrainerVerificationRpcBoundary,
} from './trainer-verification-service'

const workspaceId = '23ccf1ec-a377-4b45-a401-11d28a8a1503'
const userId = '0a258739-7658-4012-b747-0f95dca6372c'
const otherWorkspaceId = '81912079-6e62-48c7-b2f6-82b89d09990e'
const otherUserId = '47bef91d-257e-4e3b-aef4-d051c676c0cc'
const eventId = '3a806139-cdd5-45e6-8c50-a11b630f1717'
const submittedAt = '2025-07-01T10:00:00.000Z'
const decidedAt = '2025-07-02T10:00:00.000Z'
const idempotencyKey = 'trainer-verification-0001'

function boundaryWith(data: unknown, error: unknown = null) {
  const call = vi.fn(async (
    _functionName: string,
    _arguments_: Record<string, string | null>,
  ) => ({ data, error }))
  return { boundary: { call } satisfies TrainerVerificationRpcBoundary, call }
}

function accessRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    workspace_id: workspaceId,
    verification_status: 'verified',
    cref_number: '123456-G',
    cref_state: 'SP',
    studio_name: 'Studio Horizonte',
    verification_submitted_at: submittedAt,
    verification_decided_at: decidedAt,
    verification_rejection_reason: null,
    access_mode: 'verified',
    temporary_access_expires_at: null,
    ...overrides,
  }
}

describe('trainer verification service', () => {
  it('loads exactly one scoped row and maps it to the public camelCase model', async () => {
    const { boundary, call } = boundaryWith([accessRow()])

    await expect(getProfessionalAccess(workspaceId, userId, boundary)).resolves.toEqual({
      userId,
      workspaceId,
      status: 'verified',
      crefNumber: '123456-G',
      crefState: 'SP',
      studioName: 'Studio Horizonte',
      submittedAt,
      decidedAt,
      rejectionReason: null,
      mode: 'verified',
      temporaryAccessExpiresAt: null,
    })
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('get_my_professional_access', { p_workspace_id: workspaceId })
    expect(Object.keys(call.mock.calls[0][1])).toEqual(['p_workspace_id'])
  })

  it('rejects missing, duplicate, and non-array access results', async () => {
    await expect(getProfessionalAccess(workspaceId, userId, boundaryWith([]).boundary)).rejects.toThrow(verificationAccessErrorMessage)
    await expect(getProfessionalAccess(workspaceId, userId, boundaryWith([accessRow(), accessRow()]).boundary)).rejects.toThrow(verificationAccessErrorMessage)
    await expect(getProfessionalAccess(workspaceId, userId, boundaryWith(accessRow()).boundary)).rejects.toThrow(verificationAccessErrorMessage)
  })

  it('fails closed on cross-workspace, cross-user, and malformed access rows', async () => {
    const invalidRows = [
      accessRow({ workspace_id: otherWorkspaceId }),
      accessRow({ user_id: otherUserId }),
      accessRow({ user_id: 'user-1' }),
      accessRow({ verification_status: 'approved' }),
      accessRow({ access_mode: 'admin' }),
      accessRow({ cref_number: '12 3456' }),
      accessRow({ cref_number: '123' }),
      accessRow({ cref_state: 'sp' }),
      accessRow({ studio_name: 'x' }),
      accessRow({ studio_name: 'Studio\nOculto' }),
      accessRow({
        verification_status: 'rejected',
        verification_rejection_reason: 'Motivo\nforjado',
        access_mode: 'blocked',
      }),
      accessRow({ verification_submitted_at: 'not-a-timestamp' }),
    ]

    for (const row of invalidRows) {
      await expect(getProfessionalAccess(workspaceId, userId, boundaryWith([row]).boundary)).rejects.toThrow(verificationAccessErrorMessage)
    }
  })

  it('accepts only status, decision, rejection, and access-mode combinations that agree', () => {
    const now = Date.parse('2026-08-08T12:00:00.000Z')
    const temporaryExpiration = '2026-08-10T12:00:00.000Z'
    const validRows = [
      accessRow({
        verification_status: 'unverified',
        verification_submitted_at: null,
        verification_decided_at: null,
        access_mode: 'blocked',
      }),
      accessRow({
        verification_status: 'pending',
        verification_decided_at: null,
        access_mode: 'temporary_homologation',
        temporary_access_expires_at: temporaryExpiration,
      }),
      accessRow(),
      accessRow({
        verification_status: 'rejected',
        verification_rejection_reason: 'Documento sem legibilidade.',
        access_mode: 'blocked',
      }),
    ]
    for (const row of validRows) {
      expect(parseProfessionalAccess(row, workspaceId, userId, now)).not.toBeNull()
    }

    const inconsistentRows = [
      accessRow({ verification_status: 'unverified', verification_submitted_at: submittedAt }),
      accessRow({ verification_status: 'pending', verification_decided_at: null, verification_submitted_at: null, access_mode: 'blocked' }),
      accessRow({ verification_status: 'pending', access_mode: 'blocked' }),
      accessRow({ verification_status: 'verified', access_mode: 'blocked' }),
      accessRow({ verification_status: 'rejected', verification_rejection_reason: null, access_mode: 'blocked' }),
      accessRow({ verification_status: 'rejected', verification_rejection_reason: 'Documento inválido.', verification_decided_at: submittedAt, verification_submitted_at: decidedAt, access_mode: 'blocked' }),
      accessRow({ verification_status: 'pending', verification_decided_at: null, access_mode: 'temporary_homologation', temporary_access_expires_at: null }),
      accessRow({ verification_status: 'pending', verification_decided_at: null, access_mode: 'temporary_homologation', temporary_access_expires_at: '2026-08-01T12:00:00.000Z' }),
      accessRow({ verification_status: 'pending', verification_decided_at: null, access_mode: 'blocked', temporary_access_expires_at: temporaryExpiration }),
      accessRow({ verification_submitted_at: '2026-08-09T12:00:00.000Z', verification_decided_at: '2026-08-09T13:00:00.000Z' }),
    ]
    for (const row of inconsistentRows) {
      expect(parseProfessionalAccess(row, workspaceId, userId, now)).toBeNull()
    }
  })

  it('validates expected workspace and user UUIDs before calling the backend', async () => {
    const { boundary, call } = boundaryWith([accessRow()])
    await expect(getProfessionalAccess('workspace-1', userId, boundary)).rejects.toThrow(verificationAccessErrorMessage)
    await expect(getProfessionalAccess(workspaceId, 'user-1', boundary)).rejects.toThrow(verificationAccessErrorMessage)
    expect(call).not.toHaveBeenCalled()
  })

  it('normalizes the submission and sends no caller-controlled authority fields', async () => {
    const { boundary, call } = boundaryWith(eventId)

    await expect(submitTrainerVerification({
      crefNumber: '  123456-g  ',
      crefState: ' sp ',
      studioName: '  Studio Horizonte  ',
      idempotencyKey,
    }, boundary)).resolves.toBe(eventId)

    expect(call).toHaveBeenCalledWith('submit_trainer_verification', {
      p_cref_number: '123456-G',
      p_cref_state: 'SP',
      p_studio_name: 'Studio Horizonte',
      p_idempotency_key: idempotencyKey,
    })
    expect(Object.keys(call.mock.calls[0][1])).toEqual([
      'p_cref_number',
      'p_cref_state',
      'p_studio_name',
      'p_idempotency_key',
    ])
  })

  it('normalizes an empty optional studio to null', async () => {
    const { boundary, call } = boundaryWith(eventId)
    await submitTrainerVerification({
      crefNumber: '123456-G',
      crefState: 'SP',
      studioName: '   ',
      idempotencyKey,
    }, boundary)
    expect(call.mock.calls[0][1].p_studio_name).toBeNull()
    expect(normalizeStudioName(null)).toBeNull()
  })

  it('exposes deterministic field normalizers', () => {
    expect(normalizeCrefNumber(' abcd-12/z ')).toBe('ABCD-12/Z')
    expect(normalizeCrefState(' rj ')).toBe('RJ')
    expect(normalizeStudioName('  Elo Movimento  ')).toBe('Elo Movimento')
  })

  it('rejects malformed submission fields before any backend call', async () => {
    const invalidCommands = [
      { crefNumber: '123', crefState: 'SP', studioName: null, idempotencyKey },
      { crefNumber: '1'.repeat(25), crefState: 'SP', studioName: null, idempotencyKey },
      { crefNumber: '1234@G', crefState: 'SP', studioName: null, idempotencyKey },
      { crefNumber: '123456-G', crefState: 'S', studioName: null, idempotencyKey },
      { crefNumber: '123456-G', crefState: 'SP', studioName: 'x', idempotencyKey },
      { crefNumber: '123456-G', crefState: 'SP', studioName: 'x'.repeat(81), idempotencyKey },
      { crefNumber: '123456-G', crefState: 'SP', studioName: 'Studio\nOculto', idempotencyKey },
      { crefNumber: '123456-G', crefState: 'SP', studioName: null, idempotencyKey: 'short-key' },
      { crefNumber: '123456-G', crefState: 'SP', studioName: null, idempotencyKey: `x${'!'.repeat(20)}` },
      { crefNumber: '123456-G', crefState: 'SP', studioName: null, idempotencyKey: 'x'.repeat(129) },
      { crefNumber: undefined, crefState: 'SP', studioName: null, idempotencyKey },
      { crefNumber: '123456-G', crefState: undefined, studioName: null, idempotencyKey },
      { crefNumber: '123456-G', crefState: 'SP', studioName: undefined, idempotencyKey },
    ]

    for (const command of invalidCommands) {
      const { boundary, call } = boundaryWith(eventId)
      await expect(submitTrainerVerification(command as never, boundary)).rejects.toThrow(verificationSubmitErrorMessage)
      expect(call).not.toHaveBeenCalled()
    }

    await expect(submitTrainerVerification(null as never, boundaryWith(eventId).boundary)).rejects.toThrow(verificationSubmitErrorMessage)
  })

  it('requires a canonical audit event UUID from the submission RPC', async () => {
    await expect(submitTrainerVerification({
      crefNumber: '123456-G', crefState: 'SP', studioName: null, idempotencyKey,
    }, boundaryWith([{ event_id: eventId }]).boundary)).rejects.toThrow(verificationSubmitErrorMessage)

    await expect(submitTrainerVerification({
      crefNumber: '123456-G', crefState: 'SP', studioName: null, idempotencyKey,
    }, boundaryWith('event-1').boundary)).rejects.toThrow(verificationSubmitErrorMessage)
  })

  it('redacts backend and transport details behind generic messages', async () => {
    const privateDetail = 'duplicate key request_fingerprint=private-value'
    const accessFailure = getProfessionalAccess(workspaceId, userId, boundaryWith(null, { message: privateDetail }).boundary)
    await expect(accessFailure).rejects.toThrow(verificationAccessErrorMessage)
    await expect(accessFailure).rejects.not.toThrow(privateDetail)

    const throwingBoundary: TrainerVerificationRpcBoundary = {
      call: vi.fn(async () => { throw new Error(privateDetail) }),
    }
    const submitFailure = submitTrainerVerification({
      crefNumber: '123456-G', crefState: 'SP', studioName: null, idempotencyKey,
    }, throwingBoundary)
    await expect(submitFailure).rejects.toThrow(verificationSubmitErrorMessage)
    await expect(submitFailure).rejects.not.toThrow(privateDetail)
  })
})
