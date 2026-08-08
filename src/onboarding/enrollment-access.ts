import type { ActiveMembership } from '../auth/auth-context'
import type { ProfessionalAccess } from './trainer-verification-service'
import type { Role } from '../types'

export type EnrollmentAccess = 'demo' | 'app' | 'student-onboarding' | 'trainer-verification' | 'blocked'

export function resolveEnrollmentAccess(input: {
  isDemo: boolean
  role: Role | null
  membership: ActiveMembership | null
  professionalAccess?: ProfessionalAccess | null
}): EnrollmentAccess {
  if (input.isDemo) return 'demo'
  if (input.role === 'student') return input.membership?.membershipRole === 'student' ? 'app' : 'student-onboarding'
  if (input.role === 'trainer') {
    if (!input.membership || !['owner', 'trainer'].includes(input.membership.membershipRole)) return 'blocked'
    if (!input.professionalAccess || input.professionalAccess.workspaceId !== input.membership.workspaceId) return 'trainer-verification'
    return input.professionalAccess.mode === 'verified' || input.professionalAccess.mode === 'temporary_homologation'
      ? 'app'
      : 'trainer-verification'
  }
  return 'blocked'
}
