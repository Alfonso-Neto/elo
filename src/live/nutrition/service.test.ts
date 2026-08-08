import { describe, expect, it, vi } from 'vitest'
import {
  createNutritionService,
  NutritionDomainError,
  type NutritionBoundary,
} from './service'
import { nutritionToday } from './validation'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const studentId = '22222222-2222-4222-8222-222222222222'
const otherWorkspaceId = '33333333-3333-4333-8333-333333333333'
const planId = '44444444-4444-4444-8444-444444444444'
const mealEventId = '55555555-5555-4555-8555-555555555555'
const hydrationEventId = '66666666-6666-4666-8666-666666666666'
const today = nutritionToday()
const key = (prefix: string) => `${prefix}:e1f2a3b4-5c6d-47e8-9f01-23456789abcd`
const ok = (data: unknown) => ({ data, error: null })

function membership() {
  return { workspace_id: workspaceId, user_id: studentId, role: 'student', status: 'active' }
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: planId,
    workspace_id: workspaceId,
    student_user_id: studentId,
    version_number: 2,
    nutritionist_name: 'Camila Rocha',
    nutritionist_crn: 'CRN-3 12345',
    title: 'Plano de rotina',
    valid_from: today,
    valid_until: today,
    meals: [{
      id: 'breakfast', time: '07:30', title: 'Café da manhã',
      description: 'Iogurte, fruta e aveia.', protein_g: 24, carbs_g: 48, fat_g: 12, kcal: 396,
    }],
    hydration_target_ml: 2500,
    notes: null,
    published_at: '2026-08-07T12:00:00.000Z',
    ...overrides,
  }
}

function mealEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: mealEventId, event_sequence: 4, plan_version_id: planId,
    workspace_id: workspaceId, student_user_id: studentId, meal_id: 'breakfast',
    action: 'completed', recorded_on: today, recorded_at: '2026-08-07T13:00:00.000Z',
    ...overrides,
  }
}

function hydrationEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: hydrationEventId, event_sequence: 5, plan_version_id: planId,
    workspace_id: workspaceId, student_user_id: studentId, total_ml: 1000,
    recorded_on: today, recorded_at: '2026-08-07T14:00:00.000Z',
    ...overrides,
  }
}

function fakeBoundary(overrides: Partial<NutritionBoundary> = {}) {
  const rpc = vi.fn(async () => ok(null))
  const value: NutritionBoundary = {
    currentUser: vi.fn(async () => ok({ id: studentId })),
    activeMemberships: vi.fn(async () => ok([membership()])),
    latestConsent: vi.fn(async () => ok([])),
    currentPlan: vi.fn(async () => ok([])),
    mealEvents: vi.fn(async () => ok([])),
    hydrationEvents: vi.fn(async () => ok([])),
    rpc,
    ...overrides,
  }
  return { value, rpc: value.rpc as ReturnType<typeof vi.fn> }
}

describe('nutrition scoped read contract', () => {
  it('returns the explicit consent state without inventing a partner plan', async () => {
    const latestConsent = vi.fn(async () => ok([{
      workspace_id: workspaceId, student_user_id: studentId,
      purpose: 'nutrition_processing', action: 'withdrawn', event_sequence: 3,
    }]))
    const { value } = fakeBoundary({ latestConsent })

    await expect(createNutritionService(value).loadDashboard()).resolves.toEqual({
      consent: 'withdrawn', plan: null, mealEvents: [], hydrationEvents: [],
    })
    expect(latestConsent).toHaveBeenCalledWith(workspaceId, studentId)
    expect(value.currentPlan).toHaveBeenCalledWith(workspaceId, studentId, today)
    expect(value.mealEvents).not.toHaveBeenCalled()
  })

  it('loads only today events for the authenticated student and current plan', async () => {
    const { value } = fakeBoundary({
      latestConsent: vi.fn(async () => ok([{
        workspace_id: workspaceId, student_user_id: studentId,
        purpose: 'nutrition_processing', action: 'granted', event_sequence: 1,
      }])),
      currentPlan: vi.fn(async () => ok([plan()])),
      mealEvents: vi.fn(async () => ok([mealEvent()])),
      hydrationEvents: vi.fn(async () => ok([hydrationEvent()])),
    })

    const dashboard = await createNutritionService(value).loadDashboard()
    expect(dashboard).toMatchObject({
      consent: 'granted',
      plan: { id: planId, workspaceId, studentUserId: studentId, hydrationTargetMl: 2500 },
      mealEvents: [{ mealId: 'breakfast', action: 'completed' }],
      hydrationEvents: [{ totalMl: 1000 }],
    })
    expect(value.mealEvents).toHaveBeenCalledWith(workspaceId, studentId, planId, today)
    expect(value.hydrationEvents).toHaveBeenCalledWith(workspaceId, studentId, planId, today)
  })

  it('fails closed on cross-tenant rows and impossible partner dates', async () => {
    const crossTenant = fakeBoundary({ currentPlan: vi.fn(async () => ok([plan({ workspace_id: otherWorkspaceId })])) })
    await expect(createNutritionService(crossTenant.value).loadDashboard()).rejects.toMatchObject({ code: 'unavailable' })

    const impossibleDate = fakeBoundary({ currentPlan: vi.fn(async () => ok([plan({ valid_until: '2026-02-31' })])) })
    await expect(createNutritionService(impossibleDate.value).loadDashboard()).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('rejects an event whose day or plan differs from the scoped request', async () => {
    const { value } = fakeBoundary({
      currentPlan: vi.fn(async () => ok([plan()])),
      mealEvents: vi.fn(async () => ok([mealEvent({ plan_version_id: '77777777-7777-4777-8777-777777777777' })])),
    })
    await expect(createNutritionService(value).loadDashboard()).rejects.toMatchObject({ code: 'unavailable' })
  })
})

describe('nutrition mutation contracts', () => {
  it('records explicit consent with no caller-controlled subject or workspace', async () => {
    const rpc = vi.fn(async () => ok({
      workspace_id: workspaceId, student_user_id: studentId,
      purpose: 'nutrition_processing', action: 'granted',
    }))
    const { value } = fakeBoundary({ rpc })
    await expect(createNutritionService(value).grantConsent(key('nutrition-consent'))).resolves.toBe('granted')
    expect(rpc).toHaveBeenCalledWith('record_current_nutrition_consent', {
      p_action: 'granted', p_idempotency_key: key('nutrition-consent'),
    })
  })

  it('sends exact meal and hydration RPC contracts while deriving identity server-side', async () => {
    const rpc = vi.fn(async (name: string) => name === 'record_nutrition_meal_state'
      ? ok(mealEvent())
      : ok(hydrationEvent()))
    const { value } = fakeBoundary({ rpc })
    const service = createNutritionService(value)
    await service.recordMealState({
      planVersionId: planId, mealId: 'breakfast', action: 'completed',
      idempotencyKey: key('nutrition-meal'),
    })
    await service.recordHydrationTotal({
      planVersionId: planId, totalMl: 1000, idempotencyKey: key('nutrition-water'),
    })
    expect(rpc).toHaveBeenNthCalledWith(1, 'record_nutrition_meal_state', {
      p_plan_version_id: planId, p_meal_id: 'breakfast', p_action: 'completed',
      p_idempotency_key: key('nutrition-meal'),
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'record_nutrition_hydration_total', {
      p_plan_version_id: planId, p_total_ml: 1000,
      p_idempotency_key: key('nutrition-water'),
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('workspace_id')
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('student_user_id')
  })

  it('rejects malformed commands before identity reads or RPCs', async () => {
    const { value, rpc } = fakeBoundary()
    await expect(createNutritionService(value).recordHydrationTotal({
      planVersionId: planId, totalMl: 10001, idempotencyKey: 'retry',
    })).rejects.toMatchObject({ code: 'validation' })
    expect(value.currentUser).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps backend details to a generic domain error without retaining a cause', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: 'XX999', message: 'private.nutrition_plan_versions contained another tenant' },
    }))
    const { value } = fakeBoundary({ rpc })
    const caught = await createNutritionService(value).withdrawConsent(key('nutrition-withdraw')).catch((error: unknown) => error)
    expect(caught).toBeInstanceOf(NutritionDomainError)
    expect(caught).toMatchObject({ code: 'unavailable' })
    if (!(caught instanceof NutritionDomainError)) throw new Error('Expected a nutrition domain error')
    expect(String(caught.message)).not.toContain('private.nutrition')
    expect(caught).not.toHaveProperty('cause')
  })
})
