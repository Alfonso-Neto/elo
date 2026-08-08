import { describe, expect, it } from 'vitest'
import { buildLiveSignalQueue } from './LiveTrainerDashboard'
import type { EnrolledStudent } from '../onboarding/enrollment-service'
import type { PainReportLifecycleSummary } from '../signals'

const student: EnrolledStudent = { userId: '22222222-2222-4222-8222-222222222222', displayName: 'Marina Costa', joinedAt: null }
const report = (overrides: Partial<PainReportLifecycleSummary> = {}): PainReportLifecycleSummary => ({
  id: '33333333-3333-4333-8333-333333333333',
  sequence: 1,
  workspaceId: '11111111-1111-4111-8111-111111111111',
  studentUserId: student.userId,
  region: 'Joelho',
  side: 'right',
  movement: 'Leg press',
  timing: 'during_activity',
  intensity: 5,
  onset: '2026-08-07T14:00:00.000Z',
  redFlags: [],
  createdAt: '2026-08-07T14:01:00.000Z',
  status: 'open',
  acknowledgedAt: null,
  resolvedAt: null,
  resolutionNote: null,
  ...overrides,
})

describe('live trainer signal queue', () => {
  it('groups reports by linked student and puts structured alerts first', () => {
    const other = { ...student, userId: '44444444-4444-4444-8444-444444444444', displayName: 'Rafael Lima' }
    const result = buildLiveSignalQueue([student, other], [
      report(),
      report({ id: '55555555-5555-4555-8555-555555555555', sequence: 2 }),
      report({ id: '66666666-6666-4666-8666-666666666666', studentUserId: other.userId, intensity: 2, redFlags: ['major_trauma'] }),
    ])

    expect(result[0]).toMatchObject({ studentName: 'Rafael Lima', critical: true, count: 1 })
    expect(result[1]).toMatchObject({ studentName: 'Marina Costa', critical: false, count: 2 })
  })

  it('never exposes an identifier as the visible fallback name', () => {
    expect(buildLiveSignalQueue([], [report()])[0].studentName).toBe('Aluno vinculado')
  })
})
