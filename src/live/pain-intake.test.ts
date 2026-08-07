import { describe, expect, it, vi } from 'vitest'
import { mapPainIntakeSelection, submitConsentedPainIntake } from './pain-intake'

describe('live pain intake orchestration', () => {
  it('maps presentation labels into the constrained signal contract', () => {
    expect(mapPainIntakeSelection({
      location: 'Joelho direito',
      movement: 'Leg press 45°',
      moment: 'Durante a descida',
      intensity: 7,
      detail: 'Melhorou quando parei.',
      redFlags: ['major_swelling'],
      onset: '2026-08-07T15:00:00.000Z',
    })).toEqual({
      region: 'Joelho',
      side: 'right',
      movement: 'Leg press 45°',
      timing: 'during_activity',
      intensity: 7,
      onset: '2026-08-07T15:00:00.000Z',
      detail: 'Melhorou quando parei.',
      redFlags: ['major_swelling'],
    })
  })

  it('records consent before the report and preserves caller keys across retries', async () => {
    const calls: string[] = []
    const service = {
      grantCurrentHealthConsent: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => { calls.push(`consent:${idempotencyKey}`); return {} as never }),
      createPainReport: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => { calls.push(`report:${idempotencyKey}`); return '33333333-3333-4333-8333-333333333333' }),
    }
    const command = {
      consentIdempotencyKey: 'consent-granted:11111111-1111-4111-8111-111111111111',
      reportIdempotencyKey: 'pain-report:22222222-2222-4222-8222-222222222222',
      draft: mapPainIntakeSelection({ location: 'Lombar', movement: 'Caminhando', moment: 'Após o treino', intensity: 3, detail: '', redFlags: [], onset: '2026-08-07T15:00:00.000Z' }),
    }

    await submitConsentedPainIntake(service as never, command)
    await submitConsentedPainIntake(service as never, command)

    expect(calls).toEqual([
      `consent:${command.consentIdempotencyKey}`,
      `report:${command.reportIdempotencyKey}`,
      `consent:${command.consentIdempotencyKey}`,
      `report:${command.reportIdempotencyKey}`,
    ])
  })

  it('never creates a health record if consent recording fails', async () => {
    const createPainReport = vi.fn()
    const service = { grantCurrentHealthConsent: vi.fn(async () => { throw new Error('generic failure') }), createPainReport }
    await expect(submitConsentedPainIntake(service as never, {
      consentIdempotencyKey: 'consent-granted:11111111-1111-4111-8111-111111111111',
      reportIdempotencyKey: 'pain-report:22222222-2222-4222-8222-222222222222',
      draft: mapPainIntakeSelection({ location: 'Lombar', movement: 'Caminhando', moment: 'Após o treino', intensity: 3, detail: '', redFlags: [], onset: '2026-08-07T15:00:00.000Z' }),
    })).rejects.toThrow('generic failure')
    expect(createPainReport).not.toHaveBeenCalled()
  })
})
