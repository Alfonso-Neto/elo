const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && canonicalUuidPattern.test(value)
}

export function boundedText(value: unknown, minimum = 2, maximum = 80): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length >= minimum && normalized.length <= maximum ? normalized : null
}

export function parseIsoTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !isoTimestampPattern.test(value)) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}
