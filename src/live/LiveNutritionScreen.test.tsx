import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrototypeProvider } from '../prototype-context'
import type { NutritionDashboard, NutritionMealEvent } from './nutrition'
import { LiveNutritionScreen, sumNutritionMeals } from './LiveNutritionScreen'

const service = vi.hoisted(() => ({
  loadDashboard: vi.fn(),
  grantConsent: vi.fn(),
  withdrawConsent: vi.fn(),
  recordMealState: vi.fn(),
  recordHydrationTotal: vi.fn(),
}))

vi.mock('./nutrition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./nutrition')>()
  return { ...actual, createNutritionService: () => service }
})

const workspaceId = '11111111-1111-4111-8111-111111111111'
const studentId = '22222222-2222-4222-8222-222222222222'
const planId = '33333333-3333-4333-8333-333333333333'

const emptyDashboard: NutritionDashboard = {
  consent: 'not_recorded', plan: null, mealEvents: [], hydrationEvents: [],
}

const planDashboard: NutritionDashboard = {
  consent: 'granted',
  plan: {
    id: planId,
    workspaceId,
    studentUserId: studentId,
    versionNumber: 2,
    nutritionistName: 'Camila Reis',
    nutritionistCrn: 'CRN-3 12345',
    title: 'Plano de rotina',
    validFrom: '2026-08-01',
    validUntil: '2026-08-31',
    meals: [{ id: 'breakfast', time: '07:30', title: 'Café da manhã', description: 'Iogurte, fruta e aveia.', proteinG: 24, carbsG: 48, fatG: 12, kcal: 396 }],
    hydrationTargetMl: 2500,
    notes: null,
    publishedAt: '2026-08-07T12:00:00.000Z',
  },
  mealEvents: [],
  hydrationEvents: [],
}

function renderScreen() {
  return render(<PrototypeProvider lockedRole="student"><LiveNutritionScreen /></PrototypeProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  service.loadDashboard.mockResolvedValue(emptyDashboard)
  service.grantConsent.mockResolvedValue('granted')
  service.withdrawConsent.mockResolvedValue('withdrawn')
})

describe('live nutrition experience', () => {
  it('requires explicit acknowledgement before recording nutrition consent', async () => {
    renderScreen()
    const authorize = await screen.findByRole('button', { name: 'Autorizar integração nutricional' })
    fireEvent.click(authorize)
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirme que leu a finalidade')
    expect(service.grantConsent).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(authorize)
    await waitFor(() => expect(service.grantConsent).toHaveBeenCalledWith(expect.stringMatching(/^nutrition-consent:/)))
  })

  it('records a real daily meal event and updates completion without local storage', async () => {
    service.loadDashboard.mockResolvedValue(planDashboard)
    const event: NutritionMealEvent = {
      id: '44444444-4444-4444-8444-444444444444', sequence: 1, planVersionId: planId,
      workspaceId, studentUserId: studentId, mealId: 'breakfast', action: 'completed',
      recordedOn: '2026-08-07', recordedAt: '2026-08-07T13:00:00.000Z',
    }
    service.recordMealState.mockResolvedValue(event)
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    renderScreen()

    const mealButton = await screen.findByRole('button', { name: 'Registrar Café da manhã' })
    fireEvent.click(mealButton)
    await waitFor(() => expect(service.recordMealState).toHaveBeenCalledWith({
      planVersionId: planId,
      mealId: 'breakfast',
      action: 'completed',
      idempotencyKey: expect.stringMatching(/^nutrition-meal-completed:/),
    }))
    expect(await screen.findByText('1 de 1 registradas hoje')).toBeInTheDocument()
    expect(storageSpy).not.toHaveBeenCalledWith('elo-meals', expect.anything())
    storageSpy.mockRestore()
  })

  it('sums only selected meals for honest macro progress', () => {
    const meals = [
      { id: 'one', time: '08:00', title: 'Um', description: 'Primeira refeição', proteinG: 10, carbsG: 20, fatG: 5, kcal: 165 },
      { id: 'two', time: '12:00', title: 'Dois', description: 'Segunda refeição', proteinG: 30, carbsG: 40, fatG: 10, kcal: 370 },
    ]
    expect(sumNutritionMeals(meals)).toEqual({ proteinG: 40, carbsG: 60, fatG: 15, kcal: 535 })
    expect(sumNutritionMeals(meals, new Set(['two']))).toEqual({ proteinG: 30, carbsG: 40, fatG: 10, kcal: 370 })
  })
})
