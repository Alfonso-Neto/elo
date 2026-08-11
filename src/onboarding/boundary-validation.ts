import { parseIsoTimestamp } from '../lib/iso-timestamp'
import { hasUnsafeDisplayCharacters } from '../lib/safe-text'

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && canonicalUuidPattern.test(value)
}

export function boundedText(value: unknown, minimum = 2, maximum = 80): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length >= minimum
    && normalized.length <= maximum
    && !hasUnsafeDisplayCharacters(normalized)
    ? normalized
    : null
}

export { parseIsoTimestamp }
