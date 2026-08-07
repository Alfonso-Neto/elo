import type { PainRedFlag } from '../assistant/pain-safety'
import type { SignalService } from '../signals/service'
import type { PainReportDraft } from '../signals/types'

export type PainIntakeSelection = {
  location: string
  movement: string
  moment: string
  intensity: number
  detail: string
  redFlags: PainRedFlag[]
  onset: string
}

export type PendingPainIntake = {
  consentIdempotencyKey: string
  reportIdempotencyKey: string
  draft: PainReportDraft
}

type PainIntakeService = Pick<SignalService, 'grantCurrentHealthConsent' | 'createPainReport'>

const timingByLabel: Record<string, PainReportDraft['timing']> = {
  'Durante a descida': 'during_activity',
  'Durante a subida': 'during_activity',
  'Depois da série': 'after_activity',
  'Após o treino': 'after_activity',
  'Em repouso': 'at_rest',
}

export function mapPainIntakeSelection(selection: PainIntakeSelection): PainReportDraft {
  const side = selection.location.endsWith(' direito')
    ? 'right'
    : selection.location.endsWith(' esquerdo') ? 'left' : selection.location === 'Lombar' ? 'midline' : 'not_applicable'
  const region = selection.location.replace(/ (direito|esquerdo)$/, '')
  return {
    region,
    side,
    movement: selection.movement,
    timing: timingByLabel[selection.moment] ?? 'during_activity',
    intensity: selection.intensity,
    onset: selection.onset,
    detail: selection.detail || null,
    redFlags: selection.redFlags,
  }
}

export async function submitConsentedPainIntake(service: PainIntakeService, command: PendingPainIntake) {
  await service.grantCurrentHealthConsent({ idempotencyKey: command.consentIdempotencyKey })
  return service.createPainReport({ idempotencyKey: command.reportIdempotencyKey, draft: command.draft })
}
