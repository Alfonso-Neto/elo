import { describe, expect, it } from 'vitest'
import { resolveEnrollmentAccess } from './enrollment-access'

const trainerMembership = {
  workspaceId: 'workspace-1',
  workspaceName: 'Studio Horizonte',
  membershipRole: 'owner' as const,
  trainerName: 'André Lima',
}

const professionalAccess = {
  userId: 'trainer-1',
  workspaceId: 'workspace-1',
  status: 'verified' as const,
  mode: 'verified' as const,
  crefNumber: '123456-G/SP',
  crefState: 'SP',
  studioName: 'Studio Horizonte',
  submittedAt: '2026-08-01T12:00:00.000Z',
  decidedAt: '2026-08-02T12:00:00.000Z',
  rejectionReason: null,
  temporaryAccessExpiresAt: null,
}

describe('enrollment access gate', () => {
  it('blocks access without an authoritative account role', () => {
    expect(resolveEnrollmentAccess({ role: null, membership: null })).toBe('blocked')
  })

  it('gates a remote student until an active student membership exists', () => {
    expect(resolveEnrollmentAccess({ role: 'student', membership: null })).toBe('student-onboarding')
    expect(resolveEnrollmentAccess({ role: 'student', membership: { ...trainerMembership, membershipRole: 'student' } })).toBe('app')
  })

  it('fails closed when a role and its membership authority disagree', () => {
    expect(resolveEnrollmentAccess({ role: 'student', membership: trainerMembership })).toBe('student-onboarding')
    expect(resolveEnrollmentAccess({ role: 'trainer', membership: null })).toBe('blocked')
    expect(resolveEnrollmentAccess({ role: 'trainer', membership: { ...trainerMembership, membershipRole: 'student' } })).toBe('blocked')
  })

  it('gates professional accounts by server-derived verification access', () => {
    expect(resolveEnrollmentAccess({ role: 'trainer', membership: trainerMembership, professionalAccess: null })).toBe('trainer-verification')
    expect(resolveEnrollmentAccess({ role: 'trainer', membership: trainerMembership, professionalAccess: { ...professionalAccess, status: 'pending', mode: 'blocked', decidedAt: null } })).toBe('trainer-verification')
    expect(resolveEnrollmentAccess({ role: 'trainer', membership: trainerMembership, professionalAccess })).toBe('app')
    expect(resolveEnrollmentAccess({ role: 'trainer', membership: trainerMembership, professionalAccess: { ...professionalAccess, status: 'unverified', mode: 'temporary_homologation', submittedAt: null, decidedAt: null, temporaryAccessExpiresAt: '2026-08-09T12:00:00.000Z' } })).toBe('app')
    expect(resolveEnrollmentAccess({ role: 'trainer', membership: trainerMembership, professionalAccess: { ...professionalAccess, workspaceId: 'another-workspace' } })).toBe('trainer-verification')
  })
})
