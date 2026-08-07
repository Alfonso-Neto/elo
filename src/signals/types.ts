export const bodySides = ['left', 'right', 'bilateral', 'midline', 'not_applicable'] as const
export type BodySide = (typeof bodySides)[number]

export const symptomTimings = [
  'before_activity',
  'during_activity',
  'after_activity',
  'at_rest',
  'constant',
] as const
export type SymptomTiming = (typeof symptomTimings)[number]

export const knownRedFlagCodes = [
  'chest_pain',
  'shortness_of_breath',
  'fainting',
  'major_trauma',
  'loss_of_strength',
  'loss_of_sensation',
  'fever',
  'bowel_bladder_change',
  'major_swelling',
  'loss_of_motion',
  'numbness_or_weakness',
] as const
export type KnownRedFlagCode = (typeof knownRedFlagCodes)[number]
export type RedFlagAnswers = Partial<Record<KnownRedFlagCode, boolean>>

// Canonicalizes the safety questionnaire vocabulary already used by the UI.
// Keeping this mapping here prevents presentation labels from becoming stored data.
export const painSafetyRedFlagAliases = {
  trauma: 'major_trauma',
  major_swelling: 'major_swelling',
  loss_of_motion: 'loss_of_motion',
  numbness_or_weakness: 'numbness_or_weakness',
} as const satisfies Record<string, KnownRedFlagCode>
export type PainSafetyRedFlagCode = keyof typeof painSafetyRedFlagAliases

export type PainReportDraft = {
  region: string
  side: BodySide | string
  movement: string
  timing: SymptomTiming | string
  intensity: number | string
  onset: Date | string
  detail?: string | null
  redFlagAnswers?: RedFlagAnswers
  redFlags?: readonly string[]
}

export type CreatePainReportPayload = {
  region: string
  side: BodySide
  movement: string
  timing: SymptomTiming
  intensity: number
  onset: string
  detail: string | null
  redFlags: KnownRedFlagCode[]
}

export type IdempotentSignalCommand = {
  idempotencyKey: string
}

export type CreatePainReportCommand = IdempotentSignalCommand & {
  draft: PainReportDraft
}

export type AcknowledgePainReportCommand = IdempotentSignalCommand & {
  painReportId: string
  note?: string | null
}

export type ResolvePainReportCommand = IdempotentSignalCommand & {
  painReportId: string
  resolutionNote: string
}

export type SignalPageOptions = {
  limit?: number
  offset?: number
}

export type SignalPage<T> = {
  items: T[]
  nextOffset: number | null
}

export type ActiveStudentMembership = {
  workspaceId: string
  userId: string
  role: 'student'
  status: 'active'
}

export type ConsentPolicy = {
  purpose: 'health_processing'
  policyVersion: string
  publishedAt: string
}

export type ConsentEvent = {
  id: string
  workspaceId: string
  studentUserId: string
  purpose: 'health_processing'
  policyVersion: string
  action: 'granted' | 'withdrawn'
  createdAt: string
}

export type PainReport = {
  id: string
  sequence: number
  workspaceId: string
  studentUserId: string
  region: string
  side: BodySide
  movement: string
  timing: SymptomTiming
  intensity: number
  onset: string
  detail: string | null
  redFlags: KnownRedFlagCode[]
  createdAt: string
}

export type PainReportSummary = Omit<PainReport, 'detail'>

export type PainReportEvent = {
  id: string
  sequence: number
  painReportId: string
  workspaceId: string
  studentUserId: string
  actorUserId: string
  action: 'acknowledged' | 'resolved'
  note: string | null
  createdAt: string
}

export type RedFlagDetection = {
  codes: KnownRedFlagCode[]
  requiresPromptEscalation: boolean
}
