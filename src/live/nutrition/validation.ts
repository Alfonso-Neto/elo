import type { NutritionHydrationEvent, NutritionMealEvent } from './types'

export const nutritionUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const nutritionSafeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/
export const nutritionDatePattern = /^\d{4}-\d{2}-\d{2}$/
export const nutritionTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export function isNutritionDate(value: string) {
  if (!nutritionDatePattern.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

export function nutritionToday(timeZone = 'America/Sao_Paulo', reference = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(reference)
  const byType = new Map(parts.map((part) => [part.type, part.value]))
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`
}

export function deriveCompletedMealIds(events: NutritionMealEvent[]) {
  const latest = new Map<string, NutritionMealEvent>()
  for (const event of events) {
    const current = latest.get(event.mealId)
    if (!current || event.sequence > current.sequence) latest.set(event.mealId, event)
  }
  return new Set([...latest.values()].filter((event) => event.action === 'completed').map((event) => event.mealId))
}

export function latestHydrationTotal(events: NutritionHydrationEvent[]) {
  return events.reduce((latest, event) => !latest || event.sequence > latest.sequence ? event : latest, null as NutritionHydrationEvent | null)?.totalMl ?? 0
}
