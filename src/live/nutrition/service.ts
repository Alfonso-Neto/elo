import { parseIsoTimestamp } from '../../lib/iso-timestamp'
import { hasUnsafeDisplayCharacters } from '../../lib/safe-text'
import { requireSupabase } from '../../lib/supabase'
import { idempotencyKeyPattern } from '../../signals'
import type {
  NutritionConsentState,
  NutritionDashboard,
  NutritionHydrationEvent,
  NutritionMeal,
  NutritionMealEvent,
  NutritionPlan,
  TrainerNutritionDashboard,
} from './types'
import {
  nutritionDatePattern,
  isNutritionDate,
  nutritionSafeIdPattern,
  nutritionTimePattern,
  nutritionToday,
  nutritionUuidPattern,
} from './validation'

type BackendResult = { data: unknown; error: unknown }

export type NutritionBoundary = {
  currentUser: () => Promise<BackendResult>
  activeMemberships: (userId: string) => Promise<BackendResult>
  professionalMemberships: (userId: string) => Promise<BackendResult>
  linkedStudent: (workspaceId: string, studentUserId: string) => Promise<BackendResult>
  latestConsent: (workspaceId: string, studentUserId: string) => Promise<BackendResult>
  currentPlan: (workspaceId: string, studentUserId: string, today: string) => Promise<BackendResult>
  mealEvents: (workspaceId: string, studentUserId: string, planVersionId: string, today: string) => Promise<BackendResult>
  hydrationEvents: (workspaceId: string, studentUserId: string, planVersionId: string, today: string) => Promise<BackendResult>
  rpc: (name: string, arguments_: Record<string, unknown>) => Promise<BackendResult>
}

export type NutritionErrorCode = 'validation' | 'authentication' | 'membership' | 'ambiguous' | 'access' | 'rate_limited' | 'unavailable'

const errorCopy: Record<NutritionErrorCode, string> = {
  validation: 'Revise os dados de nutrição e tente novamente.',
  authentication: 'Entre novamente para continuar.',
  membership: 'É necessário um vínculo ativo de aluno para continuar.',
  ambiguous: 'Há mais de um vínculo ativo. O suporte precisa revisar esse acesso.',
  access: 'Este plano não está disponível para esta conta ou para o consentimento atual.',
  rate_limited: 'Muitos registros em pouco tempo. Aguarde alguns minutos e tente novamente.',
  unavailable: 'Não foi possível carregar ou salvar a nutrição agora.',
}

export class NutritionDomainError extends Error {
  constructor(readonly code: NutritionErrorCode) {
    super(errorCopy[code])
    this.name = 'NutritionDomainError'
  }
}

const planColumns = [
  'id', 'workspace_id', 'student_user_id', 'version_number', 'nutritionist_name',
  'nutritionist_crn', 'title', 'valid_from', 'valid_until', 'meals',
  'hydration_target_ml', 'notes', 'published_at',
].join(', ')
const mealEventColumns = 'id, event_sequence, plan_version_id, workspace_id, student_user_id, meal_id, action, recorded_on, recorded_at'
const hydrationEventColumns = 'id, event_sequence, plan_version_id, workspace_id, student_user_id, total_ml, recorded_on, recorded_at'

const defaultBoundary: NutritionBoundary = {
  async currentUser() {
    const { data, error } = await requireSupabase().auth.getUser()
    return { data: data.user, error }
  },
  async activeMemberships(userId) {
    const { data, error } = await requireSupabase().from('workspace_members')
      .select('workspace_id, user_id, role, status')
      .eq('user_id', userId).eq('role', 'student').eq('status', 'active').limit(2)
    return { data, error }
  },
  async professionalMemberships(userId) {
    const { data, error } = await requireSupabase().from('workspace_members')
      .select('workspace_id, user_id, role, status')
      .eq('user_id', userId).in('role', ['owner', 'trainer']).eq('status', 'active').limit(2)
    return { data, error }
  },
  async linkedStudent(workspaceId, studentUserId) {
    const { data, error } = await requireSupabase().from('workspace_members')
      .select('workspace_id, user_id, role, status')
      .eq('workspace_id', workspaceId).eq('user_id', studentUserId)
      .eq('role', 'student').eq('status', 'active').limit(1)
    return { data, error }
  },
  async latestConsent(workspaceId, studentUserId) {
    const { data, error } = await requireSupabase().from('consent_events')
      .select('workspace_id, student_user_id, purpose, action, event_sequence')
      .eq('workspace_id', workspaceId).eq('student_user_id', studentUserId)
      .eq('purpose', 'nutrition_processing').order('event_sequence', { ascending: false }).limit(1)
    return { data, error }
  },
  async currentPlan(workspaceId, studentUserId, today) {
    const { data, error } = await requireSupabase().from('nutrition_plan_versions')
      .select(planColumns).eq('workspace_id', workspaceId).eq('student_user_id', studentUserId)
      .is('redacted_at', null).lte('valid_from', today).gte('valid_until', today)
      .order('version_number', { ascending: false }).limit(1)
    return { data, error }
  },
  async mealEvents(workspaceId, studentUserId, planVersionId, today) {
    const { data, error } = await requireSupabase().from('nutrition_meal_events')
      .select(mealEventColumns).eq('workspace_id', workspaceId).eq('student_user_id', studentUserId)
      .eq('plan_version_id', planVersionId).eq('recorded_on', today).is('redacted_at', null)
      .order('event_sequence', { ascending: false }).limit(100)
    return { data, error }
  },
  async hydrationEvents(workspaceId, studentUserId, planVersionId, today) {
    const { data, error } = await requireSupabase().from('nutrition_hydration_events')
      .select(hydrationEventColumns).eq('workspace_id', workspaceId).eq('student_user_id', studentUserId)
      .eq('plan_version_id', planVersionId).eq('recorded_on', today).is('redacted_at', null)
      .order('event_sequence', { ascending: false }).limit(100)
    return { data, error }
  },
  async rpc(name, arguments_) {
    const { data, error } = await requireSupabase().rpc(name, arguments_)
    return { data, error }
  },
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function rows(value: unknown) {
  if (!Array.isArray(value)) throw new NutritionDomainError('unavailable')
  return value
}

function requiredString(row: Record<string, unknown>, key: string, maximum = Number.MAX_SAFE_INTEGER) {
  const value = row[key]
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value !== value.trim() || hasUnsafeDisplayCharacters(value)) {
    throw new NutritionDomainError('unavailable')
  }
  return value
}

function uuid(row: Record<string, unknown>, key: string) {
  const value = requiredString(row, key, 36)
  if (!nutritionUuidPattern.test(value)) throw new NutritionDomainError('unavailable')
  return value
}

function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new NutritionDomainError('unavailable')
  return parsed
}

function number(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new NutritionDomainError('unavailable')
  return value
}

function timestamp(row: Record<string, unknown>, key: string) {
  const value = requiredString(row, key, 50)
  if (parseIsoTimestamp(value) === null) throw new NutritionDomainError('unavailable')
  return value
}

function date(row: Record<string, unknown>, key: string) {
  const value = requiredString(row, key, 10)
  if (!nutritionDatePattern.test(value) || !isNutritionDate(value)) throw new NutritionDomainError('unavailable')
  return value
}

function parseMeal(value: unknown): NutritionMeal {
  if (!record(value) || Object.keys(value).some((key) => !['id','time','title','description','protein_g','carbs_g','fat_g','kcal'].includes(key))) throw new NutritionDomainError('unavailable')
  const id = requiredString(value, 'id', 64)
  const time = requiredString(value, 'time', 5)
  if (!nutritionSafeIdPattern.test(id) || !nutritionTimePattern.test(time)) throw new NutritionDomainError('unavailable')
  return {
    id,
    time,
    title: requiredString(value, 'title', 100),
    description: requiredString(value, 'description', 500),
    proteinG: number(value.protein_g, 0, 300),
    carbsG: number(value.carbs_g, 0, 500),
    fatG: number(value.fat_g, 0, 200),
    kcal: integer(value.kcal, 0, 3000),
  }
}

function parsePlan(value: unknown): NutritionPlan {
  if (!record(value) || !Array.isArray(value.meals) || value.meals.length < 1 || value.meals.length > 12) throw new NutritionDomainError('unavailable')
  const notes = value.notes === null ? null : requiredString(value, 'notes', 1000)
  const plan: NutritionPlan = {
    id: uuid(value, 'id'),
    workspaceId: uuid(value, 'workspace_id'),
    studentUserId: uuid(value, 'student_user_id'),
    versionNumber: integer(value.version_number, 1),
    nutritionistName: requiredString(value, 'nutritionist_name', 120),
    nutritionistCrn: requiredString(value, 'nutritionist_crn', 40),
    title: requiredString(value, 'title', 120),
    validFrom: date(value, 'valid_from'),
    validUntil: date(value, 'valid_until'),
    meals: value.meals.map(parseMeal),
    hydrationTargetMl: integer(value.hydration_target_ml, 500, 6000),
    notes,
    publishedAt: timestamp(value, 'published_at'),
  }
  if (new Set(plan.meals.map((meal) => meal.id)).size !== plan.meals.length) throw new NutritionDomainError('unavailable')
  return plan
}

function parseMealEvent(value: unknown): NutritionMealEvent {
  if (!record(value) || (value.action !== 'completed' && value.action !== 'uncompleted')) throw new NutritionDomainError('unavailable')
  const mealId = requiredString(value, 'meal_id', 64)
  if (!nutritionSafeIdPattern.test(mealId)) throw new NutritionDomainError('unavailable')
  return {
    id: uuid(value, 'id'), sequence: integer(value.event_sequence, 1), planVersionId: uuid(value, 'plan_version_id'),
    workspaceId: uuid(value, 'workspace_id'), studentUserId: uuid(value, 'student_user_id'), mealId,
    action: value.action, recordedOn: date(value, 'recorded_on'), recordedAt: timestamp(value, 'recorded_at'),
  }
}

function parseHydrationEvent(value: unknown): NutritionHydrationEvent {
  if (!record(value)) throw new NutritionDomainError('unavailable')
  return {
    id: uuid(value, 'id'), sequence: integer(value.event_sequence, 1), planVersionId: uuid(value, 'plan_version_id'),
    workspaceId: uuid(value, 'workspace_id'), studentUserId: uuid(value, 'student_user_id'),
    totalMl: integer(value.total_ml, 0, 10000), recordedOn: date(value, 'recorded_on'), recordedAt: timestamp(value, 'recorded_at'),
  }
}

function backendCode(error: unknown) {
  return record(error) && typeof error.code === 'string' ? error.code : ''
}

function mapError(error: unknown) {
  if (error instanceof NutritionDomainError) return error
  const code = backendCode(error)
  if (code === '21000') return new NutritionDomainError('ambiguous')
  if (code === '42501') return new NutritionDomainError('access')
  if (code === '54000') return new NutritionDomainError('rate_limited')
  if (code === '22023') return new NutritionDomainError('validation')
  return new NutritionDomainError('unavailable')
}

function validateCommandId(value: string, kind: 'uuid' | 'meal') {
  const pattern = kind === 'uuid' ? nutritionUuidPattern : nutritionSafeIdPattern
  if (!pattern.test(value)) throw new NutritionDomainError('validation')
}

export function createNutritionService(boundary: NutritionBoundary = defaultBoundary) {
  async function safely<T>(operation: () => Promise<T>) {
    try { return await operation() } catch (error) { throw mapError(error) }
  }

  async function membership() {
    const userResult = await boundary.currentUser()
    if (userResult.error) throw userResult.error
    if (!record(userResult.data) || typeof userResult.data.id !== 'string' || !nutritionUuidPattern.test(userResult.data.id)) throw new NutritionDomainError('authentication')
    const userId = userResult.data.id
    const membershipResult = await boundary.activeMemberships(userId)
    if (membershipResult.error) throw membershipResult.error
    const memberships = rows(membershipResult.data)
    if (memberships.length === 0) throw new NutritionDomainError('membership')
    if (memberships.length > 1) throw new NutritionDomainError('ambiguous')
    const row = memberships[0]
    if (!record(row) || row.role !== 'student' || row.status !== 'active' || row.user_id !== userId) throw new NutritionDomainError('unavailable')
    return { workspaceId: uuid(row, 'workspace_id'), userId }
  }

  async function professionalSubject(studentUserId: string) {
    validateCommandId(studentUserId, 'uuid')
    const userResult = await boundary.currentUser()
    if (userResult.error) throw userResult.error
    if (!record(userResult.data) || typeof userResult.data.id !== 'string' || !nutritionUuidPattern.test(userResult.data.id)) throw new NutritionDomainError('authentication')
    const userId = userResult.data.id
    const membershipResult = await boundary.professionalMemberships(userId)
    if (membershipResult.error) throw membershipResult.error
    const memberships = rows(membershipResult.data)
    if (memberships.length === 0) throw new NutritionDomainError('membership')
    if (memberships.length > 1) throw new NutritionDomainError('ambiguous')
    const member = memberships[0]
    if (!record(member) || (member.role !== 'owner' && member.role !== 'trainer') || member.status !== 'active' || member.user_id !== userId) throw new NutritionDomainError('unavailable')
    const workspaceId = uuid(member, 'workspace_id')
    const studentResult = await boundary.linkedStudent(workspaceId, studentUserId)
    if (studentResult.error) throw studentResult.error
    const students = rows(studentResult.data)
    if (students.length !== 1) throw new NutritionDomainError('access')
    const student = students[0]
    if (!record(student) || student.workspace_id !== workspaceId || student.user_id !== studentUserId || student.role !== 'student' || student.status !== 'active') throw new NutritionDomainError('unavailable')
    return { workspaceId, userId, studentUserId }
  }

  async function loadDashboard(): Promise<NutritionDashboard> {
    return safely(async () => {
      const scope = await membership()
      const today = nutritionToday()
      const [consentResult, planResult] = await Promise.all([
        boundary.latestConsent(scope.workspaceId, scope.userId),
        boundary.currentPlan(scope.workspaceId, scope.userId, today),
      ])
      if (consentResult.error) throw consentResult.error
      if (planResult.error) throw planResult.error
      const consentRows = rows(consentResult.data)
      let consent: NutritionConsentState = 'not_recorded'
      if (consentRows.length > 1) throw new NutritionDomainError('unavailable')
      if (consentRows.length === 1) {
        const value = consentRows[0]
        if (!record(value) || value.workspace_id !== scope.workspaceId || value.student_user_id !== scope.userId || value.purpose !== 'nutrition_processing' || (value.action !== 'granted' && value.action !== 'withdrawn')) throw new NutritionDomainError('unavailable')
        consent = value.action
      }
      const planRows = rows(planResult.data)
      if (planRows.length > 1) throw new NutritionDomainError('unavailable')
      const plan = planRows.length ? parsePlan(planRows[0]) : null
      if (plan && (plan.workspaceId !== scope.workspaceId || plan.studentUserId !== scope.userId)) throw new NutritionDomainError('unavailable')
      if (!plan) return { consent, plan: null, mealEvents: [], hydrationEvents: [] }
      const [mealResult, hydrationResult] = await Promise.all([
        boundary.mealEvents(scope.workspaceId, scope.userId, plan.id, today),
        boundary.hydrationEvents(scope.workspaceId, scope.userId, plan.id, today),
      ])
      if (mealResult.error) throw mealResult.error
      if (hydrationResult.error) throw hydrationResult.error
      const mealEvents = rows(mealResult.data).map(parseMealEvent)
      const hydrationEvents = rows(hydrationResult.data).map(parseHydrationEvent)
      if (mealEvents.some((event) => event.workspaceId !== scope.workspaceId || event.studentUserId !== scope.userId || event.planVersionId !== plan.id || event.recordedOn !== today)) throw new NutritionDomainError('unavailable')
      if (hydrationEvents.some((event) => event.workspaceId !== scope.workspaceId || event.studentUserId !== scope.userId || event.planVersionId !== plan.id || event.recordedOn !== today)) throw new NutritionDomainError('unavailable')
      return { consent, plan, mealEvents, hydrationEvents }
    })
  }

  async function loadTrainerStudentDashboard(studentUserId: string): Promise<TrainerNutritionDashboard> {
    return safely(async () => {
      const scope = await professionalSubject(studentUserId)
      const today = nutritionToday()
      const planResult = await boundary.currentPlan(scope.workspaceId, scope.studentUserId, today)
      if (planResult.error) throw planResult.error
      const planRows = rows(planResult.data)
      if (planRows.length > 1) throw new NutritionDomainError('unavailable')
      const plan = planRows.length ? parsePlan(planRows[0]) : null
      if (plan && (plan.workspaceId !== scope.workspaceId || plan.studentUserId !== scope.studentUserId)) throw new NutritionDomainError('unavailable')
      if (!plan) return { plan: null, mealEvents: [], hydrationEvents: [] }
      const [mealResult, hydrationResult] = await Promise.all([
        boundary.mealEvents(scope.workspaceId, scope.studentUserId, plan.id, today),
        boundary.hydrationEvents(scope.workspaceId, scope.studentUserId, plan.id, today),
      ])
      if (mealResult.error) throw mealResult.error
      if (hydrationResult.error) throw hydrationResult.error
      const mealEvents = rows(mealResult.data).map(parseMealEvent)
      const hydrationEvents = rows(hydrationResult.data).map(parseHydrationEvent)
      if (mealEvents.some((event) => event.workspaceId !== scope.workspaceId || event.studentUserId !== scope.studentUserId || event.planVersionId !== plan.id || event.recordedOn !== today)) throw new NutritionDomainError('unavailable')
      if (hydrationEvents.some((event) => event.workspaceId !== scope.workspaceId || event.studentUserId !== scope.studentUserId || event.planVersionId !== plan.id || event.recordedOn !== today)) throw new NutritionDomainError('unavailable')
      return { plan, mealEvents, hydrationEvents }
    })
  }

  async function recordConsent(action: 'granted' | 'withdrawn', idempotencyKey: string) {
    return safely(async () => {
      if (!idempotencyKeyPattern.test(idempotencyKey)) throw new NutritionDomainError('validation')
      const scope = await membership()
      const result = await boundary.rpc('record_current_nutrition_consent', { p_action: action, p_idempotency_key: idempotencyKey })
      if (result.error) throw result.error
      if (!record(result.data) || result.data.workspace_id !== scope.workspaceId || result.data.student_user_id !== scope.userId || result.data.purpose !== 'nutrition_processing' || result.data.action !== action) throw new NutritionDomainError('unavailable')
      return action
    })
  }

  async function recordMealState(command: { planVersionId: string; mealId: string; action: 'completed' | 'uncompleted'; idempotencyKey: string }) {
    return safely(async () => {
      validateCommandId(command.planVersionId, 'uuid'); validateCommandId(command.mealId, 'meal')
      if ((command.action !== 'completed' && command.action !== 'uncompleted') || !idempotencyKeyPattern.test(command.idempotencyKey)) throw new NutritionDomainError('validation')
      const scope = await membership()
      const result = await boundary.rpc('record_nutrition_meal_state', { p_plan_version_id: command.planVersionId, p_meal_id: command.mealId, p_action: command.action, p_idempotency_key: command.idempotencyKey })
      if (result.error) throw result.error
      const event = parseMealEvent(result.data)
      if (event.workspaceId !== scope.workspaceId || event.studentUserId !== scope.userId || event.planVersionId !== command.planVersionId || event.mealId !== command.mealId || event.action !== command.action) throw new NutritionDomainError('unavailable')
      return event
    })
  }

  async function recordHydrationTotal(command: { planVersionId: string; totalMl: number; idempotencyKey: string }) {
    return safely(async () => {
      validateCommandId(command.planVersionId, 'uuid')
      if (!Number.isSafeInteger(command.totalMl) || command.totalMl < 0 || command.totalMl > 10000 || !idempotencyKeyPattern.test(command.idempotencyKey)) throw new NutritionDomainError('validation')
      const scope = await membership()
      const result = await boundary.rpc('record_nutrition_hydration_total', { p_plan_version_id: command.planVersionId, p_total_ml: command.totalMl, p_idempotency_key: command.idempotencyKey })
      if (result.error) throw result.error
      const event = parseHydrationEvent(result.data)
      if (event.workspaceId !== scope.workspaceId || event.studentUserId !== scope.userId || event.planVersionId !== command.planVersionId || event.totalMl !== command.totalMl) throw new NutritionDomainError('unavailable')
      return event
    })
  }

  return {
    loadDashboard,
    loadTrainerStudentDashboard,
    grantConsent: (idempotencyKey: string) => recordConsent('granted', idempotencyKey),
    withdrawConsent: (idempotencyKey: string) => recordConsent('withdrawn', idempotencyKey),
    recordMealState,
    recordHydrationTotal,
  }
}
