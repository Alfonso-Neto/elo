import { describe, expect, it } from 'vitest'
import { resolveEnrollmentAccess } from './enrollment-access'

const trainerMembership = {
  workspaceId: 'workspace-1',
  workspaceName: 'Studio Horizonte',
  membershipRole: 'owner' as const,
  trainerName: 'André Lima',
}

describe('enrollment access gate', () => {
  it('always preserves the explicit demo bypass', () => {
    expect(resolveEnrollmentAccess({ isDemo: true, role: null, membership: null })).toBe('demo')
  })

  it('gates a remote student until an active student membership exists', () => {
    expect(resolveEnrollmentAccess({ isDemo: false, role: 'student', membership: null })).toBe('student-onboarding')
    expect(resolveEnrollmentAccess({ isDemo: false, role: 'student', membership: { ...trainerMembership, membershipRole: 'student' } })).toBe('app')
  })

  it('fails closed when a role and its membership authority disagree', () => {
    expect(resolveEnrollmentAccess({ isDemo: false, role: 'student', membership: trainerMembership })).toBe('student-onboarding')
    expect(resolveEnrollmentAccess({ isDemo: false, role: 'trainer', membership: null })).toBe('blocked')
    expect(resolveEnrollmentAccess({ isDemo: false, role: 'trainer', membership: { ...trainerMembership, membershipRole: 'student' } })).toBe('blocked')
  })
})
