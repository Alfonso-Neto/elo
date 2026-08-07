import { SignalDomainError } from './errors'
import {
  bodySides,
  knownRedFlagCodes,
  painSafetyRedFlagAliases,
  symptomTimings,
  type BodySide,
  type CreatePainReportPayload,
  type KnownRedFlagCode,
  type PainReportDraft,
  type RedFlagAnswers,
  type RedFlagDetection,
  type SymptomTiming,
} from './types'

const bodySideSet = new Set<string>(bodySides)
const timingSet = new Set<string>(symptomTimings)
const knownRedFlagSet = new Set<string>(knownRedFlagCodes)
const painSafetyAliasMap: Readonly<Record<string, KnownRedFlagCode>> = painSafetyRedFlagAliases
const redFlagCodePattern = /^[a-z][a-z0-9_]{1,47}$/
const controlCharacterPattern = /[\u0000-\u001f\u007f]/

const sideAliases: Record<string, BodySide> = {
  esquerda: 'left',
  esquerdo: 'left',
  'lado esquerdo': 'left',
  direita: 'right',
  direito: 'right',
  'lado direito': 'right',
  bilateral: 'bilateral',
  ambos: 'bilateral',
  ambas: 'bilateral',
  'dos dois lados': 'bilateral',
  centro: 'midline',
  central: 'midline',
  'linha media': 'midline',
  'nao se aplica': 'not_applicable',
  'sem lado': 'not_applicable',
}

const timingAliases: Record<string, SymptomTiming> = {
  antes: 'before_activity',
  'antes do treino': 'before_activity',
  'antes da atividade': 'before_activity',
  durante: 'during_activity',
  'durante o treino': 'during_activity',
  'durante a atividade': 'during_activity',
  depois: 'after_activity',
  apos: 'after_activity',
  'depois do treino': 'after_activity',
  'apos o treino': 'after_activity',
  'em repouso': 'at_rest',
  repouso: 'at_rest',
  constante: 'constant',
  'o tempo todo': 'constant',
}

function normalizedLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function mapBodySide(value: string): BodySide | null {
  const normalized = normalizedLabel(value)
  if (bodySideSet.has(normalized)) return normalized as BodySide
  return sideAliases[normalized] ?? null
}

function mapSymptomTiming(value: string): SymptomTiming | null {
  const normalized = normalizedLabel(value)
  if (timingSet.has(normalized)) return normalized as SymptomTiming
  return timingAliases[normalized] ?? null
}

// Deliberately uses only explicit questionnaire answers. Free text must never be
// treated as a reliable medical classifier by this client-side mapper.
export function detectRedFlags(answers: RedFlagAnswers = {}): RedFlagDetection {
  const codes = knownRedFlagCodes.filter((code) => answers[code] === true)
  return { codes: [...codes], requiresPromptEscalation: codes.length > 0 }
}

function normalizeRedFlags(input: PainReportDraft) {
  if (
    input.redFlagAnswers !== undefined
    && (
      !input.redFlagAnswers
      || typeof input.redFlagAnswers !== 'object'
      || Array.isArray(input.redFlagAnswers)
      || Object.entries(input.redFlagAnswers).some(([code, answer]) =>
        !knownRedFlagSet.has(code) || typeof answer !== 'boolean')
    )
  ) return null
  const detected = detectRedFlags(input.redFlagAnswers).codes
  const submitted = input.redFlags ?? []
  if (!Array.isArray(submitted) || submitted.some((code) => typeof code !== 'string')) return null
  const canonicalSubmitted = submitted.map((code) => painSafetyAliasMap[code] ?? code)
  const combined = [...detected, ...canonicalSubmitted]
  const unique = [...new Set(combined)]

  if (
    unique.length > 12
    || unique.some((code) => !redFlagCodePattern.test(code) || !knownRedFlagSet.has(code))
  ) return null

  return unique as KnownRedFlagCode[]
}

export function mapPainReportDraft(
  input: PainReportDraft,
  options: { now?: Date } = {},
): CreatePainReportPayload {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SignalDomainError('validation')
  }
  const errors: Record<string, string> = {}
  const region = typeof input.region === 'string' ? input.region.trim() : ''
  const movement = typeof input.movement === 'string' ? input.movement.trim() : ''
  const detail = typeof input.detail === 'string' ? input.detail.trim() || null : null
  const side = typeof input.side === 'string' ? mapBodySide(input.side) : null
  const timing = typeof input.timing === 'string' ? mapSymptomTiming(input.timing) : null
  const intensity = typeof input.intensity === 'string' && input.intensity.trim() !== ''
    ? Number(input.intensity)
    : input.intensity
  const onsetDate = input.onset instanceof Date
    ? new Date(input.onset.getTime())
    : typeof input.onset === 'string' ? new Date(input.onset) : new Date(Number.NaN)
  const redFlags = normalizeRedFlags(input)
  const now = options.now ?? new Date()

  if (region.length < 2 || region.length > 64 || controlCharacterPattern.test(region)) {
    errors.region = 'Informe uma região válida com até 64 caracteres.'
  }
  if (movement.length < 1 || movement.length > 120 || controlCharacterPattern.test(movement)) {
    errors.movement = 'Informe o movimento relacionado com até 120 caracteres.'
  }
  if (!side) errors.side = 'Escolha um lado válido.'
  if (!timing) errors.timing = 'Escolha quando o desconforto acontece.'
  if (typeof intensity !== 'number' || !Number.isInteger(intensity) || intensity < 0 || intensity > 10) {
    errors.intensity = 'A intensidade precisa ser um número inteiro entre 0 e 10.'
  }
  if (Number.isNaN(onsetDate.getTime()) || onsetDate.getTime() > now.getTime() + 5 * 60_000) {
    errors.onset = 'Informe uma data de início válida.'
  }
  if (detail && (detail.length > 2000 || detail.includes('\u0000'))) {
    errors.detail = 'O detalhe deve ter até 2.000 caracteres.'
  }
  if (!redFlags) errors.redFlags = 'As respostas de sinais de alerta são inválidas.'

  if (Object.keys(errors).length > 0 || !side || !timing || !redFlags || typeof intensity !== 'number') {
    throw new SignalDomainError('validation', { fieldErrors: errors })
  }

  return {
    region,
    side,
    movement,
    timing,
    intensity,
    onset: onsetDate.toISOString(),
    detail,
    redFlags,
  }
}
