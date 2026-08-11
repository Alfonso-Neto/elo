import { describe, expect, it } from 'vitest'
import { normalizeMembership, normalizeProfile, parseMembershipPayload } from './auth-context'

const userId = '0a258739-7658-4012-b747-0f95dca6372c'
const workspaceId = '23ccf1ec-a377-4b45-a401-11d28a8a1503'

describe('authoritative auth boundary normalization', () => {
  it('accepts canonical profile and membership identifiers', () => {
    expect(normalizeProfile({ id: userId, account_role: 'student', display_name: ' Marina Costa ' }, userId)).toEqual({
      id: userId,
      accountRole: 'student',
      displayName: 'Marina Costa',
    })
    expect(normalizeMembership([{
      workspace_id: workspaceId,
      workspace_name: ' Studio Horizonte ',
      membership_role: 'student',
      trainer_name: ' André Lima ',
    }])).toMatchObject({ workspaceId, workspaceName: 'Studio Horizonte', trainerName: 'André Lima' })
  })

  it('rejects malformed user and workspace identifiers', () => {
    expect(normalizeProfile({ id: 'user-1', account_role: 'student', display_name: 'Marina Costa' }, 'user-1')).toBeNull()
    expect(normalizeMembership([{
      workspace_id: 'workspace-1',
      workspace_name: 'Studio Horizonte',
      membership_role: 'student',
      trainer_name: 'André Lima',
    }])).toBeNull()
  })

  it('rejects names outside database bounds', () => {
    expect(normalizeProfile({ id: userId, account_role: 'student', display_name: 'M' }, userId)).toBeNull()
    expect(normalizeMembership([{
      workspace_id: workspaceId,
      workspace_name: 'x'.repeat(81),
      membership_role: 'student',
      trainer_name: 'André Lima',
    }])).toBeNull()
    expect(normalizeProfile({ id: userId, account_role: 'student', display_name: 'Marina\nCosta' }, userId)).toBeNull()
    expect(normalizeProfile({ id: userId, account_role: 'student', display_name: 'Marina\u202eCosta' }, userId)).toBeNull()
  })

  it('distinguishes no membership from malformed or ambiguous backend rows', () => {
    const membership = {
      workspace_id: workspaceId,
      workspace_name: 'Studio Horizonte',
      membership_role: 'student',
      trainer_name: 'André Lima',
    }
    expect(parseMembershipPayload([])).toEqual({ status: 'none', membership: null })
    expect(parseMembershipPayload([{ ...membership, workspace_id: 'workspace-1' }])).toEqual({ status: 'invalid', membership: null })
    expect(parseMembershipPayload([membership, membership])).toEqual({ status: 'invalid', membership: null })
    expect(normalizeMembership([membership, membership])).toBeNull()
    expect(parseMembershipPayload([{ ...membership, workspace_id: '00000000-0000-0000-0000-000000000000' }])).toEqual({ status: 'invalid', membership: null })
  })
})
