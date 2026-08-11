import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { createGeneralForm } from './form-data'
import type { Exercise, FormQuestion, Page, Role } from './types'

type Toast = { title: string; message: string } | null
export type AssistantEntry = { kind: 'exercise-pain'; movement: string } | null
export type WorkoutSessionDraft = { title: string; exercises: Exercise[] }
export type StudentWorkoutVersionSnapshot = {
  id: string
  workspaceId: string
  studentUserId: string
  publishedByUserId: string
  publishedByRole: 'owner' | 'trainer'
  versionNumber: number
  title: string
  exercises: Exercise[]
  publishedAt: string
}
export type StudentWorkoutCompletionSnapshot = {
  workoutVersionId: string
  workoutTitle: string
  completedExerciseIds: string[]
  rpe: number
  mood: string
  comment: string
  idempotencyKey: string
}
export type StudentWorkoutCompletionState =
  | { state: 'idle' }
  | { state: 'pending'; snapshot: StudentWorkoutCompletionSnapshot }
  | { state: 'succeeded'; receipt: { workoutTitle: string; rpe: number; completedExerciseCount: number } }
export type StudentWorkoutSessionDraft = {
  completedExerciseIds: string[]
  elapsedSeconds: number
  runningSince: number | null
  feedback: { rpe: number; mood: string; comment: string }
  completionIdempotencyKey: string
  completion: StudentWorkoutCompletionState
}
export type FormSessionDraft = { title: string; questions: FormQuestion[] }
export type MessageSessionDraft = { body: string; idempotencyKey: string }

type EloAppState = {
  role: Role
  page: Page
  workout: Exercise[]
  workoutName: string
  workoutDraftStudentId: string
  workoutSessionDrafts: Record<string, WorkoutSessionDraft>
  studentWorkoutSessionDrafts: Record<string, StudentWorkoutSessionDraft>
  studentWorkoutPinnedVersions: Record<string, StudentWorkoutVersionSnapshot>
  messageSessionDrafts: Record<string, MessageSessionDraft>
  formQuestions: FormQuestion[]
  formDraftStudentId: string
  formSessionDrafts: Record<string, FormSessionDraft>
  formLastSentDrafts: Record<string, FormSessionDraft>
  formTitle: string
  selectedStudentId: string
  assistantEntry: AssistantEntry
  toast: Toast
  navigate: (page: Page) => void
  setWorkout: Dispatch<SetStateAction<Exercise[]>>
  setWorkoutName: (name: string) => void
  setWorkoutDraftStudentId: (studentId: string) => void
  setWorkoutSessionDrafts: Dispatch<SetStateAction<Record<string, WorkoutSessionDraft>>>
  setStudentWorkoutSessionDrafts: Dispatch<SetStateAction<Record<string, StudentWorkoutSessionDraft>>>
  setStudentWorkoutPinnedVersions: Dispatch<SetStateAction<Record<string, StudentWorkoutVersionSnapshot>>>
  setMessageSessionDrafts: Dispatch<SetStateAction<Record<string, MessageSessionDraft>>>
  setFormQuestions: Dispatch<SetStateAction<FormQuestion[]>>
  setFormTitle: (title: string) => void
  setFormDraftStudentId: (studentId: string) => void
  setFormSessionDrafts: Dispatch<SetStateAction<Record<string, FormSessionDraft>>>
  setFormLastSentDrafts: Dispatch<SetStateAction<Record<string, FormSessionDraft>>>
  setSelectedStudentId: (id: string) => void
  openExercisePainReport: (movement: string) => void
  clearAssistantEntry: () => void
  notify: (title: string, message: string) => void
}

const EloAppContext = createContext<EloAppState | null>(null)

const trainerOnlyPages: Page[] = ['dashboard', 'students', 'student-detail', 'copilot', 'builder', 'forms', 'form-builder']
const studentOnlyPages: Page[] = ['today', 'workout', 'assistant', 'nutrition', 'student-form']
const sharedPages: Page[] = ['schedule', 'messages']
const isPage = (value: string): value is Page => [...trainerOnlyPages, ...studentOnlyPages, ...sharedPages].includes(value as Page)
const homeForRole = (role: Role): Page => role === 'trainer' ? 'dashboard' : 'today'
const canAccessPage = (role: Role, page: Page) => sharedPages.includes(page) || (role === 'trainer' ? trainerOnlyPages.includes(page) : studentOnlyPages.includes(page))

export const legacyBrowserStorageKeys = [
  'elo-role', 'elo-workout', 'elo-workout-name', 'elo-published-workout', 'elo-published-workout-name',
  'elo-pain', 'elo-sessions', 'elo-messages', 'elo-form', 'elo-published-form', 'elo-form-title',
  'elo-published-form-title', 'elo-form-answers', 'elo-completed', 'elo-meals', 'elo-water',
  'elo-form-submitted', 'elo-form-sent', 'elo-workout-sent', 'elo-workout-feedback', 'elo-student-notes',
  'elo-other-messages',
] as const

export function clearLegacyBrowserStorage() {
  legacyBrowserStorageKeys.forEach((key) => {
    try { localStorage.removeItem(key) } catch { /* Storage can be unavailable in hardened browsers. */ }
  })
}

function requestedPageFor(role: Role) {
  const requested = window.location.hash.replace('#/', '')
  return isPage(requested) && canAccessPage(role, requested) ? requested : homeForRole(role)
}

export function EloAppProvider({ children, lockedRole }: { children: ReactNode; lockedRole: Role }) {
  const role = lockedRole
  const [page, setPage] = useState<Page>(() => requestedPageFor(lockedRole))
  const [workout, setWorkout] = useState<Exercise[]>([])
  const [workoutName, setWorkoutName] = useState('Nova prescrição')
  const [workoutDraftStudentId, setWorkoutDraftStudentId] = useState('')
  const [workoutSessionDrafts, setWorkoutSessionDrafts] = useState<Record<string, WorkoutSessionDraft>>({})
  const [studentWorkoutSessionDrafts, setStudentWorkoutSessionDrafts] = useState<Record<string, StudentWorkoutSessionDraft>>({})
  const [studentWorkoutPinnedVersions, setStudentWorkoutPinnedVersions] = useState<Record<string, StudentWorkoutVersionSnapshot>>({})
  const [messageSessionDrafts, setMessageSessionDrafts] = useState<Record<string, MessageSessionDraft>>({})
  const [formQuestions, setFormQuestions] = useState<FormQuestion[]>(createGeneralForm)
  const [formDraftStudentId, setFormDraftStudentId] = useState('')
  const [formSessionDrafts, setFormSessionDrafts] = useState<Record<string, FormSessionDraft>>({})
  const [formLastSentDrafts, setFormLastSentDrafts] = useState<Record<string, FormSessionDraft>>({})
  const [formTitle, setFormTitle] = useState('Nova anamnese')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [assistantEntry, setAssistantEntry] = useState<AssistantEntry>(null)
  const [toast, setToast] = useState<Toast>(null)

  const hasUnsavedSessionData = Boolean(
    workoutDraftStudentId
    || formDraftStudentId
    || Object.keys(workoutSessionDrafts).length
    || Object.keys(formSessionDrafts).length
    || Object.values(messageSessionDrafts).some((draft) => draft.body.trim())
    || Object.values(studentWorkoutSessionDrafts).some((draft) => draft.completion.state !== 'succeeded'),
  )

  useEffect(() => {
    clearLegacyBrowserStorage()
  }, [])

  useEffect(() => {
    if (!hasUnsavedSessionData) return
    const protectDrafts = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectDrafts)
    return () => window.removeEventListener('beforeunload', protectDrafts)
  }, [hasUnsavedSessionData])

  useEffect(() => {
    const target = requestedPageFor(lockedRole)
    setPage(target)
    const current = window.location.hash.replace('#/', '')
    if (current !== target) window.history.replaceState(null, '', '#/' + target)
  }, [lockedRole])

  useEffect(() => {
    setStudentWorkoutPinnedVersions((current) => {
      let next = current
      Object.entries(current).forEach(([scopeKey, pinned]) => {
        const session = studentWorkoutSessionDrafts[scopeKey + ':' + pinned.id]
        if (session?.completion.state !== 'succeeded') return
        if (next === current) next = { ...current }
        delete next[scopeKey]
      })
      return next
    })
  }, [studentWorkoutSessionDrafts])

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [page])
  useEffect(() => { if (page !== 'assistant') setAssistantEntry(null) }, [page])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const onRouteChange = () => {
      const raw = window.location.hash.replace('#/', '')
      // Professional verification is owned by AppGate. Redirecting it here
      // would race the outer auth boundary and hide the verification screen.
      if (raw === 'verificacao') return
      if (!isPage(raw) || !canAccessPage(lockedRole, raw)) {
        const home = homeForRole(lockedRole)
        setPage(home)
        window.history.replaceState(null, '', '#/' + home)
        return
      }
      setPage(raw)
    }
    window.addEventListener('hashchange', onRouteChange)
    window.addEventListener('popstate', onRouteChange)
    return () => {
      window.removeEventListener('hashchange', onRouteChange)
      window.removeEventListener('popstate', onRouteChange)
    }
  }, [lockedRole])

  const notify = useCallback((title: string, message: string) => setToast({ title, message }), [])
  const navigate = useCallback((next: Page) => {
    const target = canAccessPage(lockedRole, next) ? next : homeForRole(lockedRole)
    setPage(target)
    window.history.pushState(null, '', '#/' + target)
    document.getElementById('main-content')?.focus()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [lockedRole])
  const openExercisePainReport = useCallback((movement: string) => {
    const cleanMovement = movement.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!cleanMovement) return
    setAssistantEntry({ kind: 'exercise-pain', movement: cleanMovement })
    navigate('assistant')
  }, [navigate])
  const clearAssistantEntry = useCallback(() => setAssistantEntry(null), [])

  const value = useMemo<EloAppState>(() => ({
    role,
    page,
    workout,
    workoutName,
    workoutDraftStudentId,
    workoutSessionDrafts,
    studentWorkoutSessionDrafts,
    studentWorkoutPinnedVersions,
    messageSessionDrafts,
    formQuestions,
    formDraftStudentId,
    formSessionDrafts,
    formLastSentDrafts,
    formTitle,
    selectedStudentId,
    assistantEntry,
    toast,
    navigate,
    setWorkout,
    setWorkoutName,
    setWorkoutDraftStudentId,
    setWorkoutSessionDrafts,
    setStudentWorkoutSessionDrafts,
    setStudentWorkoutPinnedVersions,
    setMessageSessionDrafts,
    setFormQuestions,
    setFormTitle,
    setFormDraftStudentId,
    setFormSessionDrafts,
    setFormLastSentDrafts,
    setSelectedStudentId,
    openExercisePainReport,
    clearAssistantEntry,
    notify,
  }), [
    assistantEntry,
    clearAssistantEntry,
    formDraftStudentId,
    formLastSentDrafts,
    formQuestions,
    formSessionDrafts,
    formTitle,
    messageSessionDrafts,
    navigate,
    notify,
    openExercisePainReport,
    page,
    role,
    selectedStudentId,
    studentWorkoutPinnedVersions,
    studentWorkoutSessionDrafts,
    toast,
    workout,
    workoutDraftStudentId,
    workoutName,
    workoutSessionDrafts,
  ])

  return <EloAppContext.Provider value={value}>{children}</EloAppContext.Provider>
}

export function useEloApp() {
  const value = useContext(EloAppContext)
  if (!value) throw new Error('useEloApp must be used inside EloAppProvider')
  return value
}
