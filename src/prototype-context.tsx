import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { generalForm, initialMessages, initialPainReports, initialSessions, initialWorkout } from './data'
import type { ChatMessage, Exercise, FormQuestion, Page, PainReport, Role, Session } from './types'

type Toast = { title: string; message: string } | null
type WorkoutFeedback = { rpe: number; mood: string; comment: string; createdAt: string } | null
type StudentNote = { id: string; studentId: string; text: string; createdAt: string }

type PrototypeContextValue = {
  role: Role
  page: Page
  workout: Exercise[]
  workoutName: string
  studentWorkout: Exercise[]
  studentWorkoutName: string
  painReports: PainReport[]
  sessions: Session[]
  messages: ChatMessage[]
  formQuestions: FormQuestion[]
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
  toast: Toast
  navigate: (page: Page) => void
  switchRole: (role: Role) => void
  setWorkout: React.Dispatch<React.SetStateAction<Exercise[]>>
  setWorkoutName: (name: string) => void
  addPainReport: (report: Omit<PainReport, 'id' | 'createdAt' | 'status'>) => void
  reviewPainReports: () => void
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>
  addMessage: (sender: Role, text: string) => void
  setFormQuestions: React.Dispatch<React.SetStateAction<FormQuestion[]>>
  setFormTitle: (title: string) => void
  setCompletedExercises: React.Dispatch<React.SetStateAction<string[]>>
  toggleMeal: (id: string) => void
  setWater: React.Dispatch<React.SetStateAction<number>>
  submitForm: (answers: Record<string, string | string[]>) => void
  sendWorkout: (publishedWorkout?: Exercise[], publishedName?: string) => void
  sendForm: () => void
  submitWorkoutFeedback: (rpe: number, mood: string, comment: string) => void
  addStudentNote: (studentId: string, text: string) => void
  setSelectedStudentId: (id: string) => void
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

export function PrototypeProvider({ children, lockedRole }: { children: ReactNode; lockedRole?: Role }) {
  const requestedRole = new URLSearchParams(window.location.search).get('role')
  const initialRole: Role = lockedRole ?? (requestedRole === 'student' || requestedRole === 'trainer' ? requestedRole : readLocal('elo-role', 'trainer'))
  const requestedPage = window.location.hash.replace('#/', '')
  const initialPage: Page = isPage(requestedPage) && canAccessPage(initialRole, requestedPage)
    ? requestedPage
    : homeForRole(initialRole)
  const [role, setRole] = useState<Role>(initialRole)
  const [page, setPage] = useState<Page>(initialPage)
  const [workout, setWorkout] = useState<Exercise[]>(() => readLocal('elo-workout', initialWorkout))
  const [workoutName, setWorkoutName] = useState(() => readLocal('elo-workout-name', 'Treino A · Inferiores conscientes'))
  const [studentWorkout, setStudentWorkout] = useState<Exercise[]>(() => readLocal('elo-published-workout', initialWorkout))
  const [studentWorkoutName, setStudentWorkoutName] = useState(() => readLocal('elo-published-workout-name', 'Treino A · Inferiores conscientes'))
  const [painReports, setPainReports] = useState<PainReport[]>(() => readLocal('elo-pain', initialPainReports))
  const [sessions, setSessions] = useState<Session[]>(() => readLocal('elo-sessions', initialSessions))
  const [messages, setMessages] = useState<ChatMessage[]>(() => readLocal('elo-messages', initialMessages))
  const [formQuestions, setFormQuestions] = useState<FormQuestion[]>(() => readLocal('elo-form', generalForm))
  const [publishedFormQuestions, setPublishedFormQuestions] = useState<FormQuestion[]>(() => readLocal('elo-published-form', generalForm))
  const [formTitle, setFormTitle] = useState(() => readLocal('elo-form-title', 'Anamnese · contexto inicial'))
  const [publishedFormTitle, setPublishedFormTitle] = useState(() => readLocal('elo-published-form-title', 'Anamnese geral'))
  const [formAnswers, setFormAnswers] = useState<Record<string, string | string[]>>(() => readLocal('elo-form-answers', {}))
  const [completedExercises, setCompletedExercises] = useState<string[]>(() => readLocal('elo-completed', []))
  const [completedMeals, setCompletedMeals] = useState<string[]>(() => readLocal('elo-meals', []))
  const [water, setWater] = useState(() => readLocal('elo-water', 3))
  const [formSubmitted, setFormSubmitted] = useState(() => readLocal('elo-form-submitted', false))
  const [formSent, setFormSent] = useState(() => readLocal('elo-form-sent', true))
  const [workoutSent, setWorkoutSent] = useState(() => readLocal('elo-workout-sent', false))
  const [workoutFeedback, setWorkoutFeedback] = useState<WorkoutFeedback>(() => readLocal('elo-workout-feedback', null))
  const [studentNotes, setStudentNotes] = useState<StudentNote[]>(() => readLocal('elo-student-notes', []))
  const [selectedStudentId, setSelectedStudentId] = useState('marina')
  const [toast, setToast] = useState<Toast>(null)

  useEffect(() => { if (!lockedRole) localStorage.setItem('elo-role', JSON.stringify(role)) }, [lockedRole, role])
  useEffect(() => {
    if (!lockedRole) return
    setRole(lockedRole)
    setPage((current) => canAccessPage(lockedRole, current) ? current : homeForRole(lockedRole))
  }, [lockedRole])
  useEffect(() => { localStorage.setItem('elo-workout', JSON.stringify(workout)) }, [workout])
  useEffect(() => { localStorage.setItem('elo-workout-name', JSON.stringify(workoutName)) }, [workoutName])
  useEffect(() => { localStorage.setItem('elo-published-workout', JSON.stringify(studentWorkout)) }, [studentWorkout])
  useEffect(() => { localStorage.setItem('elo-published-workout-name', JSON.stringify(studentWorkoutName)) }, [studentWorkoutName])
  useEffect(() => { localStorage.setItem('elo-pain', JSON.stringify(painReports)) }, [painReports])
  useEffect(() => { localStorage.setItem('elo-sessions', JSON.stringify(sessions)) }, [sessions])
  useEffect(() => { localStorage.setItem('elo-messages', JSON.stringify(messages)) }, [messages])
  useEffect(() => { localStorage.setItem('elo-form', JSON.stringify(formQuestions)) }, [formQuestions])
  useEffect(() => { localStorage.setItem('elo-published-form', JSON.stringify(publishedFormQuestions)) }, [publishedFormQuestions])
  useEffect(() => { localStorage.setItem('elo-form-title', JSON.stringify(formTitle)) }, [formTitle])
  useEffect(() => { localStorage.setItem('elo-published-form-title', JSON.stringify(publishedFormTitle)) }, [publishedFormTitle])
  useEffect(() => { localStorage.setItem('elo-form-answers', JSON.stringify(formAnswers)) }, [formAnswers])
  useEffect(() => { localStorage.setItem('elo-completed', JSON.stringify(completedExercises)) }, [completedExercises])
  useEffect(() => { localStorage.setItem('elo-meals', JSON.stringify(completedMeals)) }, [completedMeals])
  useEffect(() => { localStorage.setItem('elo-water', JSON.stringify(water)) }, [water])
  useEffect(() => { localStorage.setItem('elo-form-submitted', JSON.stringify(formSubmitted)) }, [formSubmitted])
  useEffect(() => { localStorage.setItem('elo-form-sent', JSON.stringify(formSent)) }, [formSent])
  useEffect(() => { localStorage.setItem('elo-workout-sent', JSON.stringify(workoutSent)) }, [workoutSent])
  useEffect(() => { localStorage.setItem('elo-workout-feedback', JSON.stringify(workoutFeedback)) }, [workoutFeedback])
  useEffect(() => { localStorage.setItem('elo-student-notes', JSON.stringify(studentNotes)) }, [studentNotes])
  useEffect(() => {
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
  }, [])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [page])
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
    setWorkout(initialWorkout); setWorkoutName('Treino A · Inferiores conscientes'); setStudentWorkout(initialWorkout); setStudentWorkoutName('Treino A · Inferiores conscientes'); setPainReports(initialPainReports)
    setSessions(initialSessions); setMessages(initialMessages); setFormQuestions(generalForm); setPublishedFormQuestions(generalForm); setFormTitle('Anamnese · contexto inicial'); setPublishedFormTitle('Anamnese geral'); setFormAnswers({}); setCompletedExercises([])
    const resetRole = lockedRole ?? 'trainer'
    const resetPage = homeForRole(resetRole)
    setCompletedMeals([]); setWater(3); setFormSubmitted(false); setFormSent(true); setWorkoutSent(false); setWorkoutFeedback(null); setStudentNotes([]); setRole(resetRole); setPage(resetPage)
    window.history.replaceState(null, '', `#/${resetPage}`); notify('Protótipo reiniciado', 'Todos os dados voltaram ao cenário inicial.')
  }

  const value = useMemo<PrototypeContextValue>(() => ({
    role, page, workout, workoutName, studentWorkout, studentWorkoutName, painReports, sessions, messages, formQuestions, publishedFormQuestions, formTitle, publishedFormTitle, formAnswers, completedExercises,
    completedMeals, water, formSubmitted, formSent, workoutSent, workoutFeedback, studentNotes, selectedStudentId, toast, navigate, switchRole,
    setWorkout, setWorkoutName, addPainReport, reviewPainReports, setSessions, addMessage, setFormQuestions, setFormTitle,
    setCompletedExercises, toggleMeal, setWater, submitForm, sendWorkout, sendForm, submitWorkoutFeedback, addStudentNote, setSelectedStudentId, notify, resetPrototype,
  }), [role, page, workout, workoutName, studentWorkout, studentWorkoutName, painReports, sessions, messages, formQuestions, publishedFormQuestions, formTitle, publishedFormTitle, formAnswers, completedExercises, completedMeals, water, formSubmitted, formSent, workoutSent, workoutFeedback, studentNotes, selectedStudentId, toast, lockedRole])

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>
}

export function usePrototype() {
  const value = useContext(PrototypeContext)
  if (!value) throw new Error('usePrototype must be used inside PrototypeProvider')
  return value
}
