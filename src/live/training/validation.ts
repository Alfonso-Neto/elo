import type { Exercise, FormQuestion, QuestionType } from '../../types'
import { parseIsoTimestamp } from '../../lib/iso-timestamp'
import { hasUnsafeDisplayCharacters } from '../../lib/safe-text'
import type { AnamnesisAnswers, PageCursor, TrainingScope } from './types'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const safeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/
const questionTypes = new Set<QuestionType>(['text', 'long', 'single', 'multi', 'scale', 'yesno', 'number'])

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}

export function isIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && idempotencyPattern.test(value)
}

export function boundedString(value: unknown, minimum: number, maximum: number, multiline = false): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  if (clean.length < minimum || clean.length > maximum || hasUnsafeDisplayCharacters(clean, multiline)) return null
  return clean
}

export function isIsoTimestamp(value: unknown): value is string {
  const parsed = parseIsoTimestamp(value)
  return parsed !== null && parsed <= Date.now() + (5 * 60 * 1000)
}

export function validateScope(scope: TrainingScope) {
  return isUuid(scope.workspaceId) && isUuid(scope.userId) && (scope.role === 'trainer' || scope.role === 'student')
}

export function validateCursor(cursor: PageCursor | undefined) {
  return !cursor || (isIsoTimestamp(cursor.at) && isUuid(cursor.id))
}

export function normalizeLimit(value: number | undefined) {
  if (value === undefined) return 20
  if (!Number.isInteger(value) || value < 1 || value > 50) return null
  return value
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key))
}

function fitsJsonSize(value: unknown, maximum: number) {
  try {
    const serialized = JSON.stringify(value)
    return typeof serialized === 'string' && new TextEncoder().encode(serialized).byteLength <= maximum
  } catch {
    return false
  }
}

export function validateExercises(value: unknown): value is Exercise[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return false
  if (!fitsJsonSize(value, 65536)) return false
  const ids = new Set<string>()
  const required = ['id', 'name', 'muscle', 'sets', 'reps', 'load', 'rest', 'tempo', 'rir', 'note'] as const
  const allowed = new Set([...required, 'suggested'])
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
    const item = candidate as Record<string, unknown>
    if (!hasOnlyKeys(item, allowed) || required.some((key) => !(key in item))) return false
    if (typeof item.id !== 'string' || !safeIdPattern.test(item.id) || ids.has(item.id)) return false
    ids.add(item.id)
    if (typeof item.name !== 'string' || !boundedString(item.name, 2, 120) || item.name !== item.name.trim()) return false
    if (typeof item.muscle !== 'string' || !boundedString(item.muscle, 1, 80) || item.muscle !== item.muscle.trim()) return false
    for (const key of ['sets', 'reps', 'load', 'rest', 'tempo', 'rir'] as const) {
      if (!boundedString(item[key], 1, 40) || item[key] !== String(item[key]).trim()) return false
    }
    if (typeof item.note !== 'string' || item.note.length > 500 || item.note !== item.note.trim() || hasUnsafeDisplayCharacters(item.note, true)) return false
    if ('suggested' in item && typeof item.suggested !== 'boolean') return false
  }
  return true
}

export function validateQuestions(value: unknown): value is FormQuestion[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return false
  if (!fitsJsonSize(value, 65536)) return false
  const ids = new Set<string>()
  const allowed = new Set(['id', 'label', 'type', 'options', 'required'])
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
    const item = candidate as Record<string, unknown>
    if (!hasOnlyKeys(item, allowed) || !('id' in item) || !('label' in item) || !('type' in item)) return false
    if (typeof item.id !== 'string' || !safeIdPattern.test(item.id) || ids.has(item.id)) return false
    ids.add(item.id)
    if (typeof item.label !== 'string' || !boundedString(item.label, 2, 180) || item.label !== item.label.trim()) return false
    if (typeof item.type !== 'string' || !questionTypes.has(item.type as QuestionType)) return false
    if ('required' in item && typeof item.required !== 'boolean') return false
    if (item.type === 'single' || item.type === 'multi') {
      if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 20) return false
      const options = new Set<string>()
      for (const option of item.options) {
        if (!boundedString(option, 1, 100) || option !== option.trim() || options.has(option)) return false
        options.add(option)
      }
    } else if ('options' in item) return false
  }
  return true
}

export function validateExerciseIds(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 50
    && new Set(value).size === value.length
    && value.every((item) => typeof item === 'string' && safeIdPattern.test(item))
}

export function validateAnswerEnvelope(value: unknown): value is AnamnesisAnswers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const object = value as Record<string, unknown>
  if (Object.keys(object).length > 50 || !fitsJsonSize(object, 131072)) return false
  return Object.entries(object).every(([key, answer]) => {
    if (!safeIdPattern.test(key)) return false
    if (typeof answer === 'string') return answer.length >= 1 && answer.length <= 4000 && answer === answer.trim() && !hasUnsafeDisplayCharacters(answer, true)
    if (typeof answer === 'number') return Number.isFinite(answer) && Math.abs(answer) <= 1000000000
    return Array.isArray(answer)
      && answer.length >= 1
      && answer.length <= 20
      && new Set(answer).size === answer.length
      && answer.every((item) => typeof item === 'string' && item.length >= 1 && item.length <= 100 && item === item.trim() && !hasUnsafeDisplayCharacters(item))
  })
}

export function validateAnswers(value: unknown, questions: unknown): value is AnamnesisAnswers {
  if (!validateQuestions(questions) || !validateAnswerEnvelope(value)) return false
  const answers = value as Record<string, unknown>
  const questionById = new Map(questions.map((question) => [question.id, question]))
  if (Object.keys(answers).some((key) => !questionById.has(key))) return false

  for (const question of questions) {
    const present = Object.prototype.hasOwnProperty.call(answers, question.id)
    if (!present) {
      if (question.required === true) return false
      continue
    }

    const answer = answers[question.id]
    if (question.type === 'text') {
      if (typeof answer !== 'string' || answer.length < 1 || answer.length > 500 || answer !== answer.trim() || hasUnsafeDisplayCharacters(answer)) return false
    } else if (question.type === 'long') {
      if (typeof answer !== 'string' || answer.length < 1 || answer.length > 4000 || answer !== answer.trim() || hasUnsafeDisplayCharacters(answer, true)) return false
    } else if (question.type === 'single') {
      if (typeof answer !== 'string' || !question.options?.includes(answer)) return false
    } else if (question.type === 'multi') {
      if (!Array.isArray(answer)
        || answer.length < 1
        || answer.length > (question.options?.length ?? 0)
        || new Set(answer).size !== answer.length
        || answer.some((item) => typeof item !== 'string' || !question.options?.includes(item))) return false
    } else if (question.type === 'scale') {
      if (!((typeof answer === 'number' && Number.isInteger(answer) && answer >= 0 && answer <= 10)
        || (typeof answer === 'string' && /^(10|[0-9])$/.test(answer)))) return false
    } else if (question.type === 'yesno') {
      if (answer !== 'Sim' && answer !== 'Não') return false
    } else if (question.type === 'number') {
      if (!((typeof answer === 'number' && Number.isFinite(answer) && Math.abs(answer) <= 1000000000)
        || (typeof answer === 'string' && /^-?[0-9]{1,9}([.,][0-9]{1,4})?$/.test(answer)))) return false
    } else return false
  }

  return true
}
