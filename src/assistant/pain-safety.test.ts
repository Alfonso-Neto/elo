import { describe, expect, it } from 'vitest'
import { assessPainSafety } from './pain-safety'

describe('pain safety assessment', () => {
  it('stops the flow for high intensity even without a selected red flag', () => {
    expect(assessPainSafety(8, [])).toMatchObject({ level: 'stop_and_assess', requiresProfessionalAssessment: true })
  })

  it('prioritizes any red flag over a low intensity score', () => {
    expect(assessPainSafety(2, ['loss_of_motion'])).toMatchObject({ level: 'stop_and_assess' })
  })

  it('pauses a moderate-to-high report without inventing a diagnosis', () => {
    const result = assessPainSafety(6, [])
    expect(result.level).toBe('pause_and_contact')
    expect(`${result.title} ${result.guidance}`.toLowerCase()).not.toContain('diagnóstico')
  })

  it('keeps low-intensity reports observable with an escalation path', () => {
    expect(assessPainSafety(3, [])).toMatchObject({ level: 'monitor', requiresProfessionalAssessment: false })
  })
})
