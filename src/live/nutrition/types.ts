export type NutritionConsentState = 'not_recorded' | 'granted' | 'withdrawn'

export type NutritionMeal = {
  id: string
  time: string
  title: string
  description: string
  proteinG: number
  carbsG: number
  fatG: number
  kcal: number
}

export type NutritionPlan = {
  id: string
  workspaceId: string
  studentUserId: string
  versionNumber: number
  nutritionistName: string
  nutritionistCrn: string
  title: string
  validFrom: string
  validUntil: string
  meals: NutritionMeal[]
  hydrationTargetMl: number
  notes: string | null
  publishedAt: string
}

export type NutritionMealEvent = {
  id: string
  sequence: number
  planVersionId: string
  workspaceId: string
  studentUserId: string
  mealId: string
  action: 'completed' | 'uncompleted'
  recordedOn: string
  recordedAt: string
}

export type NutritionHydrationEvent = {
  id: string
  sequence: number
  planVersionId: string
  workspaceId: string
  studentUserId: string
  totalMl: number
  recordedOn: string
  recordedAt: string
}

export type NutritionDashboard = {
  consent: NutritionConsentState
  plan: NutritionPlan | null
  mealEvents: NutritionMealEvent[]
  hydrationEvents: NutritionHydrationEvent[]
}

export type TrainerNutritionDashboard = {
  plan: NutritionPlan | null
  mealEvents: NutritionMealEvent[]
  hydrationEvents: NutritionHydrationEvent[]
}
