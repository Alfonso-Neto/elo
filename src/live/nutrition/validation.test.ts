import { describe, expect, it } from 'vitest'
import type { NutritionHydrationEvent, NutritionMealEvent } from './types'
import {
  deriveCompletedMealIds,
  isNutritionDate,
  latestHydrationTotal,
  nutritionToday,
} from './validation'

const mealEvent = (sequence: number, mealId: string, action: 'completed' | 'uncompleted') => ({
  id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
  sequence,
  planVersionId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  studentUserId: '33333333-3333-4333-8333-333333333333',
  mealId,
  action,
  recordedOn: '2026-08-07',
  recordedAt: `2026-08-07T12:00:0${sequence}.000Z`,
}) satisfies NutritionMealEvent

const waterEvent = (sequence: number, totalMl: number) => ({
  id: `40000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
  sequence,
  planVersionId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  studentUserId: '33333333-3333-4333-8333-333333333333',
  totalMl,
  recordedOn: '2026-08-07',
  recordedAt: `2026-08-07T12:00:0${sequence}.000Z`,
}) satisfies NutritionHydrationEvent

describe('nutrition daily-state derivation', () => {
  it('uses the newest append-only action for each meal regardless of response order', () => {
    const completed = deriveCompletedMealIds([
      mealEvent(4, 'lunch', 'uncompleted'),
      mealEvent(1, 'lunch', 'completed'),
      mealEvent(3, 'breakfast', 'completed'),
      mealEvent(2, 'breakfast', 'uncompleted'),
    ])
    expect([...completed]).toEqual(['breakfast'])
  })

  it('uses the newest hydration total and starts at zero without events', () => {
    expect(latestHydrationTotal([waterEvent(3, 750), waterEvent(1, 250), waterEvent(5, 1250)])).toBe(1250)
    expect(latestHydrationTotal([])).toBe(0)
  })

  it('derives the calendar day in Sao Paulo around a UTC boundary', () => {
    expect(nutritionToday('America/Sao_Paulo', new Date('2026-08-08T01:30:00.000Z'))).toBe('2026-08-07')
    expect(nutritionToday('America/Sao_Paulo', new Date('2026-08-08T03:30:00.000Z'))).toBe('2026-08-08')
  })

  it('rejects normalized but impossible calendar dates', () => {
    expect(isNutritionDate('2026-02-28')).toBe(true)
    expect(isNutritionDate('2026-02-29')).toBe(false)
    expect(isNutritionDate('2026-04-31')).toBe(false)
    expect(isNutritionDate('2026-13-01')).toBe(false)
  })
})
