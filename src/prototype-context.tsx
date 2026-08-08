import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { generalForm, initialMessages, initialPainReports, initialSessions, initialWorkout } from './data'
import type { ChatMessage, Exercise, FormQuestion, Page, PainReport, Role, Session } from './types'

type Toast = { title: string; message: string } | null
type WorkoutFeedback = { rpe: number; mood: string; comment: string; createdAt: string } | null
type StudentNote = { id: string; studentId: string; text: string; createdAt: string }
export type AssistantEntry = { kind: 'exercise-pain'; movement: string } | null
export type WorkoutSessionDraft = { title: string; exercises: Exercise[] }
export type FormSessionDraft = { title: string; questions: FormQuestion[] }

type PrototypeContextValue = {
  role: Role
  page: Page
  workout: Exercise[]
  workoutName: string
  workoutDraftStudentId: string
  workoutSessionDrafts: Record<string, WorkoutSessionDraft>
  studentWorkout: Exercise[]
  studentWorkoutName: string
  painReports: PainReport[]
  sessions: Session[]
  messages: ChatMessage[]
  formQuestions: FormQuestion[]
  formDraftStudentId: string
  formSessionDrafts: Record<string, FormSessionDraft>
  formLastSentDrafts: Record<string, FormSessionDraft>
  publishedFormQuestions: FormQuestion[]
  formTitle: string
  publishedFormTitle: string
  formAnswers: Record<string, string | string[]>
  completedExercises: string[]
  completedMeals: string[]
  water: number
  formSubmitted: boolean
  formSent: boolean
  workoutSent: boolean
  workoutFeedback: WorkoutFeedback
  studentNotes: StudentNote[]
  selectedStudentId: string
  assistantEntry: AssistantEntry
  toast: Toast
  navigate: (page: Page) => void
  switchRole: (role: Role) => void
  setWorkout: React.Dispatch<React.SetStateAction<Exercise[]>>
  setWorkoutName: (name: string) => void
  setWorkoutDraftStudentId: (studentId: string) => void
  setWorkoutSessionDrafts: React.Dispatch<React.SetStateAction<Record<string, WorkoutSessionDraft>>>
  addPainReport: (report: Omit<PainReport, 'id' | 'createdAt' | 'status'>) => void
  reviewPainReports: () => void
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>
  addMessage: (sender: Role, text: string) => void
  setFormQuestions: React.Dispatch<React.SetStateAction<FormQuestion[]>>
  setFormTitle: (title: string) => void
  setFormDraftStudentId: (studentId: string) => void
  setFormSessionDrafts: React.Dispatch<React.SetStateAction<Record<string, FormSessionDraft>>>
  setFormLastSentDrafts: React.Dispatch<React.SetStateAction<Record<string, FormSessionDraft>>>
  setCompletedExercises: React.Dispatch<React.SetStateAction<string[]>>
  toggleMeal: (id: string) => void
  setWater: React.Dispatch<React.SetStateAction<number>>
  submitForm: (answers: Record<string, string | string[]>) => void
  sendWorkout: (publishedWorkout?: Exercise[], publishedName?: string) => void
  sendForm: () => void
  submitWorkoutFeedback: (rpe: number, mood: string, comment: string) => void
  addStudentNote: (studentId: string, text: string) => void
  setSelectedStudentId: (id: string) => void
  openExercisePainReport: (movement: string) => void
  clearAssistantEntry: () => void
  notify: (title: string, message: string) => void
  resetPrototype: () => void
}

const PrototypeContext = createContext<PrototypeContextValue | null>(null)

const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch { return fallback }
}

const readStorageEvent = <T,>(value: string | null, fallback: T): T => {
  if (value === null) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

const trainerOnlyPages: Page[] = ['dashboard', 'students', 'student-detail', 'copilot', 'builder', 'forms', 'form-builder']
const studentOnlyPages: Page[] = ['today', 'workout', 'assistant', 'nutrition', 'student-form']
const isPage = (value: string): value is Page => [...trainerOnlyPages, ...studentOnlyPages, 'schedule', 'messages'].includes(value as Page)
const homeForRole = (role: Role): Page => role === 'trainer' ? 'dashboard' : 'today'
const canAccessPage = (role: Role, page: Page) => page === 'schedule' || page === 'messages' || (role === 'trainer' ? trainerOnlyPages.includes(page) : studentOnlyPages.includes(page))

export const legacyPrototypeStorageKeys = [
  'elo-role', 'elo-workout', 'elo-workout-name', 'elo-published-workout', 'elo-published-workout-name',
  'elo-pain', 'elo-sessions', 'elo-messages', 'elo-form', 'elo-published-form', 'elo-form-title',
  'elo-published-form-title', 'elo-form-answers', 'elo-completed', 'elo-meals', 'elo-water',
  'elo-form-submitted', 'elo-form-sent', 'elo-workout-sent', 'elo-workout-feedback', 'elo-student-notes',
] as const

export function PrototypeProvider({ children, lockedRole }: { children: ReactNode; lockedRole?: Role }) {
  const isRemote = lockedRole !== undefined
  const demoState = <T,>(key: string, demoFallback: T, remoteFallback: T) => isRemote ? remoteFallback : readLocal(key, demoFallback)
  const requestedRole = new URLSearchParams(window.location.search).get('role')
  const initialRole: Role = lockedRole ?? (requestedRole === 'student' || requestedRole === 'trainer' ? requestedRole : readLocal('elo-role', 'trainer'))
  const requestedPage = window.location.hash.replace('#/', '')
  const initialPage: Page = isPage(requestedPage) && canAccessPage(initialRole, requestedPage)
    ? requestedPage
    : homeForRole(initialRole)
  const [role, setRole] = useState<Role>(initialRole)
  const [page, setPage] = useState<Page>(initialPage)
  const [workout, setWorkout] = useState<Exercise[]>(() => demoState('elo-workout', initialWorkout, []))
  const [workoutName, setWorkoutName] = useState(() => demoState('elo-workout-name', 'Treino A · Inferiores conscientes', 'Nova prescrição'))
  const [workoutDraftStudentId, setWorkoutDraftStudentId] = useState('')
  const [workoutSessionDrafts, setWorkoutSessionDrafts] = useState<Record<string, WorkoutSessionDraft>>({})
  const [studentWorkout, setStudentWorkout] = useState<Exercise[]>(() => demoState('elo-published-workout', initialWorkout, []))
  const [studentWorkoutName, setStudentWorkoutName] = useState(() => demoState('elo-published-workout-name', 'Treino A · Inferiores conscientes', 'Nenhum treino publicado'))
  const [painReports, setPainReports] = useState<PainReport[]>(() => demoState('elo-pain', initialPainReports, []))
  const [sessions, setSessions] = useState<Session[]>(() => demoState('elo-sessions', initialSessions, []))
  const [messages, setMessages] = useState<ChatMessage[]>(() => demoState('elo-messages', initialMessages, []))
  const [formQuestions, setFormQuestions] = useState<FormQuestion[]>(() => demoState('elo-form', generalForm, generalForm))
  const [formDraftStudentId, setFormDraftStudentId] = useState('')
  const [formSessionDrafts, setFormSessionDrafts] = useState<Record<string, FormSessionDraft>>({})
  const [formLastSentDrafts, setFormLastSentDrafts] = useState<Record<string, FormSessionDraft>>({})
  const [publishedFormQuestions, setPublishedFormQuestions] = useState<FormQuestion[]>(() => demoState('elo-published-form', generalForm, []))
  const [formTitle, setFormTitle] = useState(() => demoState('elo-form-title', 'Anamnese · contexto inicial', 'Nova anamnese'))
  const [publishedFormTitle, setPublishedFormTitle] = useState(() => demoState('elo-published-form-title', 'Anamnese geral', 'Nenhuma anamnese pendente'))
  const [formAnswers, setFormAnswers] = useState<Record<string, string | string[]>>(() => demoState('elo-form-answers', {}, {}))
  const [completedExercises, setCompletedExercises] = useState<string[]>(() => demoState('elo-completed', [], []))
  const [completedMeals, setCompletedMeals] = useState<string[]>(() => demoState('elo-meals', [], []))
  const [water, setWater] = useState(() => demoState('elo-water', 3, 0))
  const [formSubmitted, setFormSubmitted] = useState(() => demoState('elo-form-submitted', false, false))
  const [formSent, setFormSent] = useState(() => demoState('elo-form-sent', true, false))
  const [workoutSent, setWorkoutSent] = useState(() => demoState('elo-workout-sent', false, false))
  const [workoutFeedback, setWorkoutFeedback] = useState<WorkoutFeedback>(() => demoState('elo-workout-feedback', null, null))
  const [studentNotes, setStudentNotes] = useState<StudentNote[]>(() => demoState('elo-student-notes', [], []))
  const [selectedStudentId, setSelectedStudentId] = useState(isRemote ? '' : 'marina')
  const [assistantEntry, setAssistantEntry] = useState<AssistantEntry>(null)
  const [toast, setToast] = useState<Toast>(null)

  useEffect(() => {
    if (!isRemote) return
    legacyPrototypeStorageKeys.forEach((key) => localStorage.removeItem(key))
  }, [isRemote])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-role', JSON.stringify(role)) }, [isRemote, role])
  useEffect(() => {
    if (!lockedRole) return
    setRole(lockedRole)
    setPage((current) => canAccessPage(lockedRole, current) ? current : homeForRole(lockedRole))
  }, [lockedRole])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-workout', JSON.stringify(workout)) }, [isRemote, workout])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-workout-name', JSON.stringify(workoutName)) }, [isRemote, workoutName])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-published-workout', JSON.stringify(studentWorkout)) }, [isRemote, studentWorkout])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-published-workout-name', JSON.stringify(studentWorkoutName)) }, [isRemote, studentWorkoutName])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-pain', JSON.stringify(painReports)) }, [isRemote, painReports])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-sessions', JSON.stringify(sessions)) }, [isRemote, sessions])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-messages', JSON.stringify(messages)) }, [isRemote, messages])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-form', JSON.stringify(formQuestions)) }, [formQuestions, isRemote])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-published-form', JSON.stringify(publishedFormQuestions)) }, [isRemote, publishedFormQuestions])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-form-title', JSON.stringify(formTitle)) }, [formTitle, isRemote])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-published-form-title', JSON.stringify(publishedFormTitle)) }, [isRemote, publishedFormTitle])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-form-answers', JSON.stringify(formAnswers)) }, [formAnswers, isRemote])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-completed', JSON.stringify(completedExercises)) }, [completedExercises, isRemote])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-meals', JSON.stringify(completedMeals)) }, [completedMeals, isRemote])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-water', JSON.stringify(water)) }, [isRemote, water])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-form-submitted', JSON.stringify(formSubmitted)) }, [formSubmitted, isRemote])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-form-sent', JSON.stringify(formSent)) }, [formSent, isRemote])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-workout-sent', JSON.stringify(workoutSent)) }, [isRemote, workoutSent])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-workout-feedback', JSON.stringify(workoutFeedback)) }, [isRemote, workoutFeedback])
  useEffect(() => { if (!isRemote) localStorage.setItem('elo-student-notes', JSON.stringify(studentNotes)) }, [isRemote, studentNotes])
  useEffect(() => {
    if (isRemote) return
    const sync = (event: StorageEvent) => {
      switch (event.key) {
        case 'elo-workout': setWorkout(readStorageEvent(event.newValue, initialWorkout)); break
        case 'elo-workout-name': setWorkoutName(readStorageEvent(event.newValue, 'Treino A · Inferiores conscientes')); break
        case 'elo-published-workout': setStudentWorkout(readStorageEvent(event.newValue, initialWorkout)); break
        case 'elo-published-workout-name': setStudentWorkoutName(readStorageEvent(event.newValue, 'Treino A · Inferiores conscientes')); break
        case 'elo-pain': setPainReports(readStorageEvent(event.newValue, initialPainReports)); break
        case 'elo-sessions': setSessions(readStorageEvent(event.newValue, initialSessions)); break
        case 'elo-messages': setMessages(readStorageEvent(event.newValue, initialMessages)); break
        case 'elo-form': setFormQuestions(readStorageEvent(event.newValue, generalForm)); break
        case 'elo-published-form': setPublishedFormQuestions(readStorageEvent(event.newValue, generalForm)); break
        case 'elo-form-title': setFormTitle(readStorageEvent(event.newValue, 'Anamnese · contexto inicial')); break
        case 'elo-published-form-title': setPublishedFormTitle(readStorageEvent(event.newValue, 'Anamnese geral')); break
        case 'elo-form-answers': setFormAnswers(readStorageEvent(event.newValue, {})); break
        case 'elo-completed': setCompletedExercises(readStorageEvent(event.newValue, [])); break
        case 'elo-meals': setCompletedMeals(readStorageEvent(event.newValue, [])); break
        case 'elo-water': setWater(readStorageEvent(event.newValue, 3)); break
        case 'elo-form-submitted': setFormSubmitted(readStorageEvent(event.newValue, false)); break
        case 'elo-form-sent': setFormSent(readStorageEvent(event.newValue, true)); break
        case 'elo-workout-sent': setWorkoutSent(readStorageEvent(event.newValue, false)); break
        case 'elo-workout-feedback': setWorkoutFeedback(readStorageEvent(event.newValue, null)); break
        case 'elo-student-notes': setStudentNotes(readStorageEvent(event.newValue, [])); break
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [isRemote])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [page])
  useEffect(() => { if (page !== 'assistant') setAssistantEntry(null) }, [page])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 4200); return () => window.clearTimeout(timer) }, [toast])
  useEffect(() => {
    const onHash = () => {
      const raw = window.location.hash.replace('#/', '')
      if (!isPage(raw)) return
      if (lockedRole) {
        if (!canAccessPage(lockedRole, raw)) {
          const home = homeForRole(lockedRole)
          setRole(lockedRole)
          setPage(home)
          window.history.replaceState(null, '', `#/${home}`)
          return
        }
        setRole(lockedRole)
        setPage(raw)
        return
      }
      if (trainerOnlyPages.includes(raw)) setRole('trainer')
      if (studentOnlyPages.includes(raw)) setRole('student')
      setPage(raw)
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onHash)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('popstate', onHash) }
  }, [lockedRole])

  const notify = (title: string, message: string) => setToast({ title, message })
  const navigate = (next: Page) => {
    const target = lockedRole && !canAccessPage(lockedRole, next) ? homeForRole(lockedRole) : next
    setPage(target)
    window.history.pushState(null, '', `#/${target}`)
    document.getElementById('main-content')?.focus()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const openExercisePainReport = (movement: string) => {
    const cleanMovement = movement.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!cleanMovement) return
    setAssistantEntry({ kind: 'exercise-pain', movement: cleanMovement })
    navigate('assistant')
  }
  const clearAssistantEntry = () => setAssistantEntry(null)
  const switchRole = (next: Role) => {
    if (lockedRole) return
    setRole(next)
    navigate(homeForRole(next))
  }
  const addPainReport = (report: Omit<PainReport, 'id' | 'createdAt' | 'status'>) => {
    setPainReports((current) => [{ ...report, id: `pain-${Date.now()}`, createdAt: 'Agora', status: 'open' }, ...current])
    notify('Relato enviado ao treinador', 'Local, momento e intensidade foram registrados com segurança.')
  }
  const reviewPainReports = () => setPainReports((items) => items.map((item) => item.studentId === selectedStudentId ? { ...item, status: 'reviewed' } : item))
  const addMessage = (sender: Role, text: string) => {
    const clean = text.trim().slice(0, 600)
    if (!clean) return
    setMessages((items) => [...items, { id: `msg-${Date.now()}`, sender, text: clean, time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date()) }])
  }
  const toggleMeal = (id: string) => setCompletedMeals((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
  const submitForm = (answers: Record<string, string | string[]>) => { setFormAnswers(answers); setFormSubmitted(true); notify('Anamnese enviada', 'As respostas agora fazem parte do seu histórico protegido.') }
  const sendWorkout = (publishedWorkout: Exercise[] = workout, publishedName = workoutName) => {
    setStudentWorkout(publishedWorkout.map((item) => ({ ...item })))
    setStudentWorkoutName(publishedName)
    setCompletedExercises([])
    setWorkoutSent(true)
    setPainReports((items) => items.map((item) => item.studentId === 'marina' ? { ...item, status: 'reviewed' } : item))
    notify('Treino enviado para Marina', 'A versão revisada já aparece na experiência da aluna.')
  }
  const sendForm = () => {
    setPublishedFormQuestions(formQuestions.map((question) => ({ ...question, options: question.options ? [...question.options] : undefined })))
    setPublishedFormTitle(formTitle.trim() || 'Anamnese sem título')
    setFormAnswers({})
    setFormSubmitted(false)
    setFormSent(true)
    notify('Anamnese enviada para Marina', `${formQuestions.length} perguntas · consentimento será solicitado antes da resposta.`)
  }
  const submitWorkoutFeedback = (rpe: number, mood: string, comment: string) => { setWorkoutFeedback({ rpe, mood, comment: comment.trim().slice(0, 400), createdAt: 'Agora' }); notify('Treino concluído', `RPE ${rpe}/10 · ${mood.toLowerCase()}. O André recebeu seu feedback.`) }
  const addStudentNote = (studentId: string, text: string) => {
    const clean = text.trim().slice(0, 500)
    if (!clean) return
    setStudentNotes((items) => [{ id: `note-${Date.now()}`, studentId, text: clean, createdAt: 'Agora' }, ...items])
    notify('Observação salva', 'A nota privada foi anexada à linha de sinais do aluno.')
  }
  const resetPrototype = () => {
    Object.keys(localStorage).filter((key) => key.startsWith('elo-') && key !== 'elo-auth').forEach((key) => localStorage.removeItem(key))
    setWorkout(initialWorkout); setWorkoutName('Treino A · Inferiores conscientes'); setWorkoutDraftStudentId(''); setWorkoutSessionDrafts({}); setStudentWorkout(initialWorkout); setStudentWorkoutName('Treino A · Inferiores conscientes'); setPainReports(initialPainReports)
    setFormDraftStudentId(''); setFormSessionDrafts({}); setFormLastSentDrafts({})
    setSessions(initialSessions); setMessages(initialMessages); setFormQuestions(generalForm); setPublishedFormQuestions(generalForm); setFormTitle('Anamnese · contexto inicial'); setPublishedFormTitle('Anamnese geral'); setFormAnswers({}); setCompletedExercises([])
    const resetRole = lockedRole ?? 'trainer'
    const resetPage = homeForRole(resetRole)
    setCompletedMeals([]); setWater(3); setFormSubmitted(false); setFormSent(true); setWorkoutSent(false); setWorkoutFeedback(null); setStudentNotes([]); setAssistantEntry(null); setRole(resetRole); setPage(resetPage)
    window.history.replaceState(null, '', `#/${resetPage}`); notify('Protótipo reiniciado', 'Todos os dados voltaram ao cenário inicial.')
  }

  const value = useMemo<PrototypeContextValue>(() => ({
    role, page, workout, workoutName, workoutDraftStudentId, workoutSessionDrafts, studentWorkout, studentWorkoutName, painReports, sessions, messages, formQuestions, formDraftStudentId, formSessionDrafts, formLastSentDrafts, publishedFormQuestions, formTitle, publishedFormTitle, formAnswers, completedExercises,
    completedMeals, water, formSubmitted, formSent, workoutSent, workoutFeedback, studentNotes, selectedStudentId, assistantEntry, toast, navigate, switchRole,
    setWorkout, setWorkoutName, setWorkoutDraftStudentId, setWorkoutSessionDrafts, addPainReport, reviewPainReports, setSessions, addMessage, setFormQuestions, setFormTitle, setFormDraftStudentId, setFormSessionDrafts, setFormLastSentDrafts,
    setCompletedExercises, toggleMeal, setWater, submitForm, sendWorkout, sendForm, submitWorkoutFeedback, addStudentNote, setSelectedStudentId, openExercisePainReport, clearAssistantEntry, notify, resetPrototype,
  }), [role, page, workout, workoutName, workoutDraftStudentId, workoutSessionDrafts, studentWorkout, studentWorkoutName, painReports, sessions, messages, formQuestions, formDraftStudentId, formSessionDrafts, formLastSentDrafts, publishedFormQuestions, formTitle, publishedFormTitle, formAnswers, completedExercises, completedMeals, water, formSubmitted, formSent, workoutSent, workoutFeedback, studentNotes, selectedStudentId, assistantEntry, toast, lockedRole])

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>
}

export function usePrototype() {
  const value = useContext(PrototypeContext)
  if (!value) throw new Error('usePrototype must be used inside PrototypeProvider')
  return value
}
