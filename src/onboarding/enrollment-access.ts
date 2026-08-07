import type { ActiveMembership } from '../auth/auth-context'
import type { Role } from '../types'

export type EnrollmentAccess = 'demo' | 'app' | 'student-onboarding' | 'blocked'

export function resolveEnrollmentAccess(input: {
  isDemo: boolean
  role: Role | null
  membership: ActiveMembership | null
}): EnrollmentAccess {
  if (input.isDemo) return 'demo'
  if (input.role === 'student') return input.membership?.membershipRole === 'student' ? 'app' : 'student-onboarding'
  if (input.role === 'trainer') {
    return input.membership && ['owner', 'trainer'].includes(input.membership.membershipRole) ? 'app' : 'blocked'
  }
  return 'blocked'
}
