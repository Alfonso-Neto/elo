import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CalendarDays, Check, CheckCircle2, ChevronRight, Circle, Dumbbell, FileCheck2, HeartPulse,
  LoaderCircle, MessageCircle, Salad, ShieldCheck, TimerReset,
} from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { BackButton, Button, Drawer, Eyebrow, Modal, MovementDemo, PageIntro, Progress, SuccessState } from '../components'
import {
  usePrototype,
  type StudentWorkoutCompletionSnapshot,
  type StudentWorkoutSessionDraft,
  type StudentWorkoutVersionSnapshot,
} from '../prototype-context'
import { createIdempotencyKey, createSignalService } from '../signals'
import type { PainReportSummary } from '../signals'
import type { Exercise, FormQuestion } from '../types'
import {
  completeWorkoutVersion, getLatestAnamnesisAssignment, getLatestWorkoutVersion,
  listAnamnesisSubmissions, submitAnamnesis, type AnamnesisAnswers, type AnamnesisAssignment,
  type AnamnesisSubmission, type TrainingScope, type WorkoutVersion,
} from './training'
import { validateAnswers } from './training/validation'
import { createNutritionService, type NutritionDashboard } from './nutrition'
import { createOperationsService, type ScheduleSession, type ScheduleSlot } from './operations'
import './live-training.css'

type DraftAnswers = Record<string, string | string[]>
type LoadPhase = 'loading' | 'ready' | 'error'

type WorkoutCompletionSnapshot = StudentWorkoutCompletionSnapshot & {
  sessionKey: string
  scopeKey: string
}

const emptyStudentWorkoutSession: StudentWorkoutSessionDraft = {
  completedExerciseIds: [],
  elapsedSeconds: 0,
  runningSince: null,
  feedback: { rpe: 7, mood: 'Na medida', comment: '' },
  completionIdempotencyKey: '',
  completion: { state: 'idle' },
}

function createStudentWorkoutSession(): StudentWorkoutSessionDraft {
  return {
    ...emptyStudentWorkoutSession,
    completedExerciseIds: [],
    feedback: { ...emptyStudentWorkoutSession.feedback },
    completion: { state: 'idle' },
  }
}

function elapsedWorkoutSeconds(session: StudentWorkoutSessionDraft, now: number) {
  const accumulated = Math.max(0, Math.floor(session.elapsedSeconds))
  if (session.runningSince === null) return accumulated
  return accumulated + Math.max(0, Math.floor((now - session.runningSince) / 1000))
}

function matchesCompletionSnapshot(session: StudentWorkoutSessionDraft, snapshot: WorkoutCompletionSnapshot) {
  const pending = session.completion.state === 'pending' ? session.completion.snapshot : null
  if (!pending) return false
  return pending.workoutVersionId === snapshot.workoutVersionId
    && pending.workoutTitle === snapshot.workoutTitle
    && pending.idempotencyKey === snapshot.idempotencyKey
    && pending.rpe === snapshot.rpe
    && pending.mood === snapshot.mood
    && pending.comment === snapshot.comment
    && pending.completedExerciseIds.length === snapshot.completedExerciseIds.length
    && pending.completedExerciseIds.every((id, index) => id === snapshot.completedExerciseIds[index])
    && session.completionIdempotencyKey === snapshot.idempotencyKey
    && session.feedback.rpe === snapshot.rpe
    && session.feedback.mood === snapshot.mood
    && session.feedback.comment === snapshot.comment
    && session.completedExerciseIds.length === snapshot.completedExerciseIds.length
    && session.completedExerciseIds.every((id, index) => id === snapshot.completedExerciseIds[index])
}

function snapshotWorkoutVersion(workout: WorkoutVersion): StudentWorkoutVersionSnapshot {
  return { ...workout, exercises: workout.exercises.map((exercise) => ({ ...exercise })) }
}

export function buildAnamnesisAnswers(questions: FormQuestion[], draft: DraftAnswers): AnamnesisAnswers | null {
  const answers: AnamnesisAnswers = {}
  for (const question of questions) {
    const raw = draft[question.id]
    if (Array.isArray(raw)) {
      if (raw.length) answers[question.id] = [...raw]
      else if (question.required) return null
      continue
    }
    const value = raw?.trim() ?? ''
    if (!value) {
      if (question.required) return null
      continue
    }
    answers[question.id] = value
  }
  return validateAnswers(answers, questions) ? answers : null
}

function studentScope(membership: ReturnType<typeof useAuth>['membership'], profile: ReturnType<typeof useAuth>['profile']): TrainingScope | null {
  return membership?.membershipRole === 'student' && profile?.accountRole === 'student'
    ? { workspaceId: membership.workspaceId, userId: profile.id, role: 'student' }
    : null
}

function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="empty-state"><ShieldCheck size={29} /><h3>Não foi possível abrir este conteúdo.</h3><p>{message}</p><Button variant="secondary" onClick={onRetry}>Tentar novamente</Button></div>
}

export function LiveStudentTodayScreen() {
  const { navigate } = usePrototype()
  const auth = useAuth()
  const scope = studentScope(auth.membership, auth.profile)
  const [workout, setWorkout] = useState<WorkoutVersion | null>(null)
  const [assignment, setAssignment] = useState<AnamnesisAssignment | null>(null)
  const [submission, setSubmission] = useState<AnamnesisSubmission | null>(null)
  const [reports, setReports] = useState<PainReportSummary[]>([])
  const [nutrition, setNutrition] = useState<NutritionDashboard | null>(null)
  const [nutritionUnavailable, setNutritionUnavailable] = useState(false)
  const [sessions, setSessions] = useState<ScheduleSession[]>([])
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [scheduleUnavailable, setScheduleUnavailable] = useState(false)
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [error, setError] = useState('')

  const load = async () => {
    if (!scope) return
    setPhase('loading'); setError('')
    try {
      const operations = createOperationsService()
      const [core, nutritionResult, scheduleResult] = await Promise.all([
        Promise.all([
          getLatestWorkoutVersion(scope),
          getLatestAnamnesisAssignment(scope),
          listAnamnesisSubmissions(scope, undefined, { limit: 50 }),
          createSignalService().listOwnReports({ limit: 20 }),
        ]),
        createNutritionService().loadDashboard()
          .then((value) => ({ value, unavailable: false }))
          .catch(() => ({ value: null, unavailable: true })),
        Promise.all([
          operations.listScheduleSessions({ limit: 50 }),
          operations.listScheduleSlots({ limit: 50 }),
        ]).then(([sessionPage, slotPage]) => ({ sessions: sessionPage.items, slots: slotPage.items, unavailable: false }))
          .catch(() => ({ sessions: [], slots: [], unavailable: true })),
      ])
      const [nextWorkout, nextAssignment, submissionPage, reportPage] = core
      setWorkout(nextWorkout)
      setAssignment(nextAssignment)
      setSubmission(nextAssignment ? submissionPage.items.find((item) => item.assignmentId === nextAssignment.id) ?? null : null)
      setReports(reportPage.items)
      setNutrition(nutritionResult.value)
      setNutritionUnavailable(nutritionResult.unavailable)
      setSessions(scheduleResult.sessions)
      setSlots(scheduleResult.slots)
      setScheduleUnavailable(scheduleResult.unavailable)
      setPhase('ready')
    } catch (cause) {
      setPhase('error'); setError(cause instanceof Error ? cause.message : 'Não foi possível carregar seu resumo.')
    }
  }
  useEffect(() => { void load() }, [scope?.workspaceId, scope?.userId])
  if (phase === 'loading') return <div className="page enter"><div className="live-loading"><LoaderCircle className="spin" size={24} /><p>Organizando seu dia...</p></div></div>
  if (phase === 'error') return <div className="page enter"><LoadFailure message={error} onRetry={() => void load()} /></div>

  const displayName = auth.profile?.displayName ?? 'Aluno'
  const firstName = displayName.split(/\s+/)[0]
  const trainerFirstName = auth.membership?.trainerName.split(/\s+/)[0] ?? 'seu professor'
  const date = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase()
  const formDone = Boolean(assignment && submission)
  const nextSchedule = sessions
    .filter((session) => session.state === 'confirmed' || session.state === 'requested')
    .map((session) => ({ session, slot: slots.find((slot) => slot.id === session.slotId) }))
    .filter((item): item is { session: ScheduleSession; slot: ScheduleSlot } => Boolean(item.slot && item.slot.state !== 'cancelled' && Date.parse(item.slot.startAt) >= Date.now()))
    .sort((a, b) => Date.parse(a.slot.startAt) - Date.parse(b.slot.startAt))[0]
  const nextScheduleTitle = scheduleUnavailable
    ? 'Agenda indisponível agora'
    : nextSchedule
      ? nextSchedule.session.state === 'confirmed'
        ? new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(nextSchedule.slot.startAt)).replace('.', '')
        : 'Aguardando confirmação'
      : 'Escolha um horário'
  const nextScheduleCopy = scheduleUnavailable
    ? 'Abra a agenda para tentar novamente.'
    : nextSchedule?.slot.place ?? 'Veja os horários publicados pelo professor.'
  const nutritionTitle = nutritionUnavailable
    ? 'Nutrição indisponível agora'
    : nutrition?.plan?.title ?? 'Nutrição profissional'
  const nutritionCopy = nutritionUnavailable
    ? 'Abra a área para tentar novamente.'
    : nutrition?.plan
      ? `${nutrition.plan.meals.length} refeições · ${nutrition.plan.nutritionistName}${nutrition.consent === 'withdrawn' ? ' · compartilhamento pausado' : ''}`
      : nutrition?.consent === 'granted'
        ? 'Aguardando plano de nutricionista parceiro'
        : 'Autorize para conectar um plano profissional'
  return <div className="page student-home live-training-screen enter"><section className="student-welcome"><Eyebrow accent>{date}</Eyebrow><h2>Oi, {firstName}.</h2><p>{reports.length ? `Seu último relato já está no contexto de ${trainerFirstName}.` : workout ? 'Seu treino está pronto. Vá no seu ritmo e compartilhe qualquer sinal importante.' : `Seu espaço com ${trainerFirstName} está ativo e protegido.`}</p></section>
    <section className="today-grid"><button className="today-workout" onClick={() => navigate('workout')}><div className="workout-orbit"><strong>{workout ? `V${workout.versionNumber}` : '—'}</strong><small>{workout ? 'PUBLICADA' : 'AGUARDANDO'}</small><i style={{ '--progress': workout ? '360deg' : '0deg' } as React.CSSProperties} /></div><div><Eyebrow>{workout ? 'SEU TREINO ATUAL' : 'PRIMEIRA PRESCRIÇÃO'}</Eyebrow><h3>{workout?.title ?? 'Seu professor ainda está preparando o treino'}</h3><p>{workout ? `${workout.exercises.length} exercícios · versão imutável` : 'Você será avisado quando a primeira versão for publicada.'}</p><span>{workout ? 'Abrir treino' : 'Ver status'} <ChevronRight size={16} /></span></div><span className="today-number">01</span></button>
      <div className="today-side"><button onClick={() => navigate('assistant')}><span className="today-icon danger"><HeartPulse size={20} /></span><div><Eyebrow>COMO VOCÊ ESTÁ?</Eyebrow><h3>Algo doeu ou atrapalhou?</h3><p>{reports.length ? `${reports.length} sinais registrados por você.` : 'Conte em menos de um minuto.'}</p></div><ChevronRight size={18} /></button><button onClick={() => navigate('schedule')}><span className="today-icon blue"><CalendarDays size={20} /></span><div><Eyebrow>{nextSchedule?.session.state === 'confirmed' ? 'PRÓXIMA SESSÃO' : 'AGENDA COMPARTILHADA'}</Eyebrow><h3>{nextScheduleTitle}</h3><p>{nextScheduleCopy}</p></div><ChevronRight size={18} /></button></div>
    </section>
    <section className="student-lower"><div><SectionTitleCompat index="02" title="Para você agora" /><div className="student-task-list"><button onClick={() => navigate('student-form')}><span className={formDone ? 'task-check done' : 'task-check'}>{formDone ? <Check size={16} /> : <FileCheck2 size={16} />}</span><span><strong>{assignment?.title ?? 'Nenhuma anamnese pendente'}</strong><small>{formDone ? 'Respostas registradas com consentimento' : assignment ? `${trainerFirstName} enviou perguntas para você` : 'Seu histórico está em dia'}</small></span><span className={`tag ${formDone || !assignment ? 'success' : 'warning'}`}>{formDone ? 'Concluída' : assignment ? 'Pendente' : 'Em dia'}</span></button><button onClick={() => navigate('nutrition')}><span className={nutrition?.plan && !nutritionUnavailable ? 'task-check done' : 'task-check'}>{nutrition?.plan && !nutritionUnavailable ? <Check size={16} /> : <Salad size={16} />}</span><span><strong>{nutritionTitle}</strong><small>{nutritionCopy}</small></span><ChevronRight size={16} /></button><button onClick={() => navigate('messages')}><span className="task-check"><MessageCircle size={16} /></span><span><strong>Conversa com {trainerFirstName}</strong><small>Canal privado do seu acompanhamento</small></span><ChevronRight size={16} /></button></div></div>
      <aside className="continuity-card"><Eyebrow>SEU ELO REAL</Eyebrow><strong>{reports.length}</strong><span>{reports.length === 1 ? 'sinal compartilhado' : 'sinais compartilhados'}</span><p>Consistência também é registrar contexto e adaptar quando o corpo pede.</p><Button variant="secondary" onClick={() => void load()}>Atualizar resumo</Button></aside>
    </section>
  </div>
}

function SectionTitleCompat({ index, title }: { index: string; title: string }) {
  return <div className="section-title"><span>{index}</span><div><h3>{title}</h3></div></div>
}

export function LiveStudentWorkoutScreen() {
  const {
    navigate, notify, openExercisePainReport, studentWorkoutPinnedVersions, studentWorkoutSessionDrafts,
    setStudentWorkoutPinnedVersions, setStudentWorkoutSessionDrafts,
  } = usePrototype()
  const auth = useAuth()
  const scope = studentScope(auth.membership, auth.profile)
  const scopeKey = scope ? `${scope.workspaceId}:${scope.userId}` : ''
  const activeScopeKeyRef = useRef(scopeKey)
  activeScopeKeyRef.current = scopeKey
  const [workout, setWorkout] = useState<WorkoutVersion | null>(null)
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [loadedScopeKey, setLoadedScopeKey] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Exercise | null>(null)
  const [playing, setPlaying] = useState(true)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [timerNow, setTimerNow] = useState(() => Date.now())
  const loadRequestVersion = useRef(0)
  const completionRequestVersion = useRef(0)
  const submitGuard = useRef(false)

  const load = async () => {
    const requestVersion = ++loadRequestVersion.current
    const requestScopeKey = scopeKey
    setWorkout(null)
    setLoadedScopeKey('')
    setSelected(null)
    setFeedbackOpen(false)
    setPhase('loading')
    setError('')
    if (!scope || !requestScopeKey) return
    try {
      const pinned = studentWorkoutPinnedVersions[requestScopeKey]
      const next = pinned ?? await getLatestWorkoutVersion(scope)
      if (requestVersion !== loadRequestVersion.current || requestScopeKey !== activeScopeKeyRef.current) return
      setWorkout(next)
      setLoadedScopeKey(requestScopeKey)
      setTimerNow(Date.now())
      setPhase('ready')
    } catch (cause) {
      if (requestVersion !== loadRequestVersion.current || requestScopeKey !== activeScopeKeyRef.current) return
      setPhase('error'); setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o treino.')
    }
  }
  useEffect(() => {
    submitGuard.current = false
    void load()
    return () => {
      loadRequestVersion.current += 1
      completionRequestVersion.current += 1
      submitGuard.current = false
    }
  }, [scopeKey])

  const sessionKey = scope && workout ? `${scope.workspaceId}:${scope.userId}:${workout.id}` : ''
  const session = sessionKey ? studentWorkoutSessionDrafts[sessionKey] ?? emptyStudentWorkoutSession : emptyStudentWorkoutSession
  const validExerciseIds = new Set(workout?.exercises.map((exercise) => exercise.id) ?? [])
  const completed = session.completedExerciseIds.filter((id) => validExerciseIds.has(id))
  const started = session.runningSince !== null
  const seconds = elapsedWorkoutSeconds(session, timerNow)
  const { rpe, mood, comment } = session.feedback
  const submitting = session.completion.state === 'pending'
  const receipt = session.completion.state === 'succeeded' ? session.completion.receipt : null

  const updateSession = useCallback((update: (current: StudentWorkoutSessionDraft) => StudentWorkoutSessionDraft) => {
    if (!sessionKey) return
    setStudentWorkoutSessionDrafts((current) => {
      const exists = Boolean(current[sessionKey])
      const previous = current[sessionKey] ?? createStudentWorkoutSession()
      const next = update(previous)
      return next === previous && exists ? current : { ...current, [sessionKey]: next }
    })
  }, [sessionKey, setStudentWorkoutSessionDrafts])

  const pinWorkout = useCallback(() => {
    if (!scopeKey || !workout) return
    setStudentWorkoutPinnedVersions((current) => current[scopeKey]
      ? current
      : { ...current, [scopeKey]: snapshotWorkoutVersion(workout) })
  }, [scopeKey, setStudentWorkoutPinnedVersions, workout])

  useEffect(() => {
    setTimerNow(Date.now())
    if (!started) return
    const timer = window.setInterval(() => setTimerNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sessionKey, session.runningSince, started])

  const changePayload = (update: (current: StudentWorkoutSessionDraft) => StudentWorkoutSessionDraft) => {
    if (session.completion.state !== 'idle') return
    pinWorkout()
    setError('')
    updateSession((current) => current.completion.state === 'idle'
      ? { ...update(current), completionIdempotencyKey: '', completion: { state: 'idle' } }
      : current)
  }
  const toggle = (id: string) => {
    if (!validExerciseIds.has(id)) return
    changePayload((current) => {
      const currentCompleted = current.completedExerciseIds.filter((exerciseId) => validExerciseIds.has(exerciseId))
      return {
        ...current,
        completedExerciseIds: currentCompleted.includes(id)
          ? currentCompleted.filter((exerciseId) => exerciseId !== id)
          : [...currentCompleted, id],
      }
    })
  }
  const updateFeedback = (feedback: Partial<StudentWorkoutSessionDraft['feedback']>) => {
    changePayload((current) => ({ ...current, feedback: { ...current.feedback, ...feedback } }))
  }
  const toggleTimer = () => {
    if (session.completion.state !== 'idle') return
    pinWorkout()
    const now = Date.now()
    setTimerNow(now)
    updateSession((current) => {
      if (current.completion.state !== 'idle') return current
      return current.runningSince === null
        ? { ...current, runningSince: now }
        : { ...current, elapsedSeconds: elapsedWorkoutSeconds(current, now), runningSince: null }
    })
  }
  const submit = async () => {
    if (!scope || !workout || !sessionKey || submitting || receipt || submitGuard.current) return
    submitGuard.current = true
    pinWorkout()
    const key = session.completionIdempotencyKey || createIdempotencyKey('complete-workout')
    const normalizedMood = mood.trim()
    const normalizedComment = comment.trim()
    const snapshot: WorkoutCompletionSnapshot = {
      sessionKey,
      scopeKey,
      workoutVersionId: workout.id,
      workoutTitle: workout.title,
      completedExerciseIds: [...completed],
      rpe,
      mood: normalizedMood,
      comment: normalizedComment,
      idempotencyKey: key,
    }
    const sharedSnapshot: StudentWorkoutCompletionSnapshot = {
      workoutVersionId: snapshot.workoutVersionId,
      workoutTitle: snapshot.workoutTitle,
      completedExerciseIds: [...snapshot.completedExerciseIds],
      rpe: snapshot.rpe,
      mood: snapshot.mood,
      comment: snapshot.comment,
      idempotencyKey: snapshot.idempotencyKey,
    }
    const requestVersion = ++completionRequestVersion.current
    const now = Date.now()
    setStudentWorkoutSessionDrafts((current) => {
      const active = current[sessionKey] ?? createStudentWorkoutSession()
      if (active.completion.state !== 'idle') return current
      return {
        ...current,
        [sessionKey]: {
          ...active,
          completedExerciseIds: [...snapshot.completedExerciseIds],
          elapsedSeconds: elapsedWorkoutSeconds(active, now),
          runningSince: null,
          feedback: { rpe: snapshot.rpe, mood: snapshot.mood, comment: snapshot.comment },
          completionIdempotencyKey: key,
          completion: { state: 'pending', snapshot: sharedSnapshot },
        },
      }
    })
    setTimerNow(now)
    setError('')
    try {
      await completeWorkoutVersion(scope, {
        workoutVersionId: snapshot.workoutVersionId,
        rpe: snapshot.rpe,
        mood: snapshot.mood,
        comment: snapshot.comment,
        completedExerciseIds: snapshot.completedExerciseIds,
        idempotencyKey: snapshot.idempotencyKey,
      })
      setStudentWorkoutSessionDrafts((current) => {
        const active = current[snapshot.sessionKey]
        if (!active || !matchesCompletionSnapshot(active, snapshot)) return current
        return {
          ...current,
          [snapshot.sessionKey]: {
            ...createStudentWorkoutSession(),
            completion: {
              state: 'succeeded',
              receipt: {
                workoutTitle: snapshot.workoutTitle,
                rpe: snapshot.rpe,
                completedExerciseCount: snapshot.completedExerciseIds.length,
              },
            },
          },
        }
      })
      const isCurrent = requestVersion === completionRequestVersion.current
        && snapshot.scopeKey === activeScopeKeyRef.current
      if (isCurrent) {
        setFeedbackOpen(false)
        setError('')
      }
      notify('Treino concluído', `Seu professor recebeu o feedback de esforço ${snapshot.rpe}/10.`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível enviar o feedback agora.'
      setStudentWorkoutSessionDrafts((current) => {
        const active = current[snapshot.sessionKey]
        if (!active || !matchesCompletionSnapshot(active, snapshot)) return current
        return {
          ...current,
          [snapshot.sessionKey]: { ...active, completion: { state: 'idle' } },
        }
      })
      if (requestVersion !== completionRequestVersion.current || snapshot.scopeKey !== activeScopeKeyRef.current) {
        notify('Conclusão não registrada', message)
        return
      }
      setError(message)
    } finally {
      submitGuard.current = false
    }
  }

  if (!scope) return <div className="page enter"><div className="empty-state"><ShieldCheck size={29} /><h3>Treino indisponível.</h3><p>Entre com uma conta de aluno vinculada para abrir esta área protegida.</p></div></div>
  if (phase === 'error') return <div className="page enter"><LoadFailure message={error} onRetry={() => void load()} /></div>
  if (phase === 'loading' || loadedScopeKey !== scopeKey) return <div className="page enter"><div className="live-loading"><LoaderCircle className="spin" size={24} /><p>Carregando seu treino publicado...</p></div></div>
  if (!workout) return <div className="page enter"><BackButton onClick={() => navigate('today')} label="Voltar para hoje" /><div className="empty-state"><Dumbbell size={30} /><h3>Seu primeiro treino ainda não foi publicado.</h3><p>Quando seu professor confirmar uma prescrição, ela aparecerá aqui como uma versão protegida.</p></div></div>
  if (receipt) return <div className="page enter"><SuccessState title="Feedback entregue." copy={`Treino “${receipt.workoutTitle}” · esforço ${receipt.rpe}/10 · ${receipt.completedExerciseCount} exercícios marcados. O registro é imutável.`} action={<Button onClick={() => navigate('today')}>Voltar para hoje</Button>} /></div>

  const progress = Math.round((completed.length / Math.max(workout.exercises.length, 1)) * 100)
  return <div className="page workout-page live-training-screen enter"><BackButton onClick={() => navigate('today')} label="Voltar para hoje" /><PageIntro eyebrow={`TREINO PUBLICADO · VERSÃO ${workout.versionNumber}`} title={workout.title} copy={`Prescrição do seu professor em ${new Intl.DateTimeFormat('pt-BR',{ dateStyle:'short' }).format(new Date(workout.publishedAt))}. Seus registros de execução não alteram esta versão.`} action={<div className="workout-timer"><TimerReset size={18} /><span><strong>{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</strong><small>{started ? 'EM ANDAMENTO' : 'PRONTO'}</small></span><Button disabled={submitting} onClick={toggleTimer}>{started ? 'Pausar' : 'Começar'}</Button></div>} />
    <div className="workout-progress"><div><span><strong>{completed.length} de {workout.exercises.length}</strong> exercícios</span><b>{progress}%</b></div><Progress value={progress} label="Progresso do treino" /></div>
    <div className="student-exercise-list">{workout.exercises.map((exercise,index) => { const done = completed.includes(exercise.id); return <article className={done ? 'done' : ''} key={exercise.id}><button className="complete-exercise" disabled={submitting} onClick={() => toggle(exercise.id)} aria-label={done ? `Desmarcar ${exercise.name}` : `Concluir ${exercise.name}`}>{done ? <Check size={18} /> : <Circle size={18} />}</button><span className="exercise-order">{String(index + 1).padStart(2,'0')}</span><button className="exercise-info" disabled={submitting} onClick={() => { pinWorkout(); setSelected(exercise) }}><span className="exercise-glyph"><Dumbbell size={18} /></span><span><strong>{exercise.name}</strong><small>{exercise.sets} séries × {exercise.reps} · {exercise.load} · {exercise.rest}</small></span>{exercise.suggested && <span className="tag success">REVISADO</span>}<ChevronRight size={17} /></button></article> })}</div>
    <Button className="finish-workout" disabled={submitting} onClick={() => { pinWorkout(); setFeedbackOpen(true) }}><CheckCircle2 size={17} /> Finalizar e enviar feedback</Button>
    {error && <p className="builder-validation" role="alert"><AlertCircleIcon /> {error}</p>}
    {selected && <Drawer title={selected.name} eyebrow="EXECUÇÃO E PARÂMETROS" onClose={() => !submitting && setSelected(null)}><MovementDemo name={selected.name} playing={playing} onToggle={() => setPlaying((value) => !value)} /><div className="exercise-stats">{[['Séries',selected.sets],['Reps',selected.reps],['Carga',selected.load],['Descanso',selected.rest],['Cadência',selected.tempo],['RIR',selected.rir]].map(([label,value]) => <div key={label}><strong>{value}</strong><small>{label}</small></div>)}</div><div className="trainer-note"><Eyebrow>RECADO DO SEU PROFESSOR</Eyebrow><p>{selected.note || 'Sem observação adicional.'}</p></div><Button variant="secondary" className="wide" disabled={submitting} onClick={() => { const movement = selected.name; pinWorkout(); setSelected(null); openExercisePainReport(movement) }}><HeartPulse size={16} /> Senti dor neste exercício</Button></Drawer>}
    {(feedbackOpen || submitting) && <Modal title="Como foi para você?" eyebrow="FEEDBACK PÓS-TREINO" onClose={() => !submitting && setFeedbackOpen(false)} size="small"><div className="feedback-form"><label><span>Esforço percebido</span><strong>{rpe}/10</strong><input type="range" min="0" max="10" value={rpe} disabled={submitting} onChange={(event) => updateFeedback({ rpe: Number(event.target.value) })} /></label><div className="mood-options" role="group" aria-label="Sensação após o treino">{['Leve','Na medida','Pesado'].map((option) => <button className={mood === option ? 'active' : ''} disabled={submitting} onClick={() => updateFeedback({ mood: option })} aria-pressed={mood === option} key={option}>{option}</button>)}</div><label><span>Quer acrescentar algo?</span><textarea value={comment} disabled={submitting} onChange={(event) => updateFeedback({ comment: event.target.value.slice(0,1000) })} placeholder="Opcional: dificuldade, conquista ou contexto útil..." /></label>{error && <p className="form-error" role="alert">{error}</p>}<Button className="wide" disabled={submitting} onClick={() => void submit()}>{submitting ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />} Registrar conclusão</Button><small className="immutable-copy">A conclusão cria um registro imutável; ela não modifica a prescrição.</small></div></Modal>}
  </div>
}

function AlertCircleIcon() { return <span aria-hidden="true">!</span> }

export function LiveStudentFormScreen() {
  const { navigate, notify } = usePrototype()
  const auth = useAuth()
  const scope = studentScope(auth.membership, auth.profile)
  const [assignment, setAssignment] = useState<AnamnesisAssignment | null>(null)
  const [submission, setSubmission] = useState<AnamnesisSubmission | null>(null)
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState<DraftAnswers>({})
  const [consent, setConsent] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const [invalidQuestionId, setInvalidQuestionId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const keys = useRef<{ consent: string; submission: string } | null>(null)
  const consentRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    if (!scope) return
    setPhase('loading'); setError('')
    try {
      const nextAssignment = await getLatestAnamnesisAssignment(scope)
      let existing: AnamnesisSubmission | null = null
      if (nextAssignment) {
        const page = await listAnamnesisSubmissions(scope, undefined, { limit: 50 })
        existing = page.items.find((item) => item.assignmentId === nextAssignment.id) ?? null
      }
      setAssignment(nextAssignment); setSubmission(existing); setAnswers({}); setConsent(false); setInvalidQuestionId(''); keys.current = null; setPhase('ready')
    } catch (cause) {
      setPhase('error'); setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a anamnese.')
    }
  }
  useEffect(() => { void load() }, [scope?.workspaceId, scope?.userId])
  const changed = () => { keys.current = null; setError(''); setConsentError(false); setInvalidQuestionId('') }
  const setAnswer = (id: string, value: string | string[]) => { changed(); setAnswers((items) => ({ ...items, [id]: value })) }
  const submit = async () => {
    if (!scope || !assignment || submitting) return
    if (!consent) { setConsentError(true); window.requestAnimationFrame(() => consentRef.current?.focus()); return }
    const normalized = buildAnamnesisAnswers(assignment.questions, answers)
    if (!normalized) {
      const invalidQuestion = assignment.questions.find((question) => !buildAnamnesisAnswers([question], { [question.id]: answers[question.id] }))
      setInvalidQuestionId(invalidQuestion?.id ?? '')
      setError('Revise as respostas obrigatórias e os formatos informados.')
      window.requestAnimationFrame(() => {
        const root = invalidQuestion ? document.getElementById(`anamnesis-${invalidQuestion.id}`) : null
        const control = root?.matches('input, textarea, button') ? root : root?.querySelector<HTMLElement>('button')
        control?.focus()
      })
      return
    }
    const commandKeys = keys.current ?? { consent: createIdempotencyKey('form-consent'), submission: createIdempotencyKey('submit-anamnesis') }
    keys.current = commandKeys
    setSubmitting(true); setError('')
    try {
      await createSignalService().grantCurrentHealthConsent({ idempotencyKey: commandKeys.consent })
      await submitAnamnesis(scope, { assignmentId: assignment.id, questions: assignment.questions, answers: normalized, idempotencyKey: commandKeys.submission })
      setSubmission({ id: 'pending-confirmed', assignmentId: assignment.id, workspaceId: scope.workspaceId, studentUserId: scope.userId, answers: normalized, submittedAt: new Date().toISOString() })
      notify('Anamnese enviada', 'As respostas foram registradas com a evidência de consentimento vigente.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a anamnese agora.')
    } finally { setSubmitting(false) }
  }

  if (phase === 'loading') return <div className="page enter"><div className="live-loading"><LoaderCircle className="spin" size={24} /><p>Carregando sua anamnese...</p></div></div>
  if (phase === 'error') return <div className="page enter"><LoadFailure message={error} onRetry={() => void load()} /></div>
  if (!assignment) return <div className="page enter"><BackButton onClick={() => navigate('today')} label="Voltar para hoje" /><div className="empty-state"><FileCheck2 size={30} /><h3>Nenhuma anamnese pendente.</h3><p>Quando seu professor enviar perguntas para este acompanhamento, elas aparecerão aqui.</p></div></div>
  if (submission) return <div className="page enter"><BackButton onClick={() => navigate('today')} label="Voltar para hoje" /><SuccessState title="Anamnese respondida." copy={`“${assignment.title}” foi registrada em ${new Intl.DateTimeFormat('pt-BR',{ dateStyle:'short', timeStyle:'short' }).format(new Date(submission.submittedAt))}. A versão enviada é imutável.`} action={<Button onClick={() => navigate('today')}>Voltar para hoje</Button>} /><div className="submitted-answer-summary">{assignment.questions.map((question,index) => <article key={question.id}><Eyebrow>{String(index + 1).padStart(2,'0')}</Eyebrow><strong>{question.label}</strong><p>{Array.isArray(submission.answers[question.id]) ? (submission.answers[question.id] as string[]).join(', ') : String(submission.answers[question.id] ?? 'Não respondida')}</p></article>)}</div></div>

  return <div className="page live-training-screen student-form-page enter"><BackButton onClick={() => navigate('today')} label="Voltar para hoje" /><PageIntro eyebrow="ANAMNESE · CONSENTIMENTO EXPLÍCITO" title={assignment.title} copy={`Enviada por ${auth.membership?.trainerName ?? 'seu professor'}. Responda apenas o que for necessário para o acompanhamento.`} />
    <div className="student-form-list">{assignment.questions.map((question,index) => {
      const inputId = `anamnesis-${question.id}`
      const labelId = `${inputId}-label`
      const scalarInput = question.type === 'long' || question.type === 'text' || question.type === 'number'
      const invalid = invalidQuestionId === question.id
      const errorId = `${inputId}-error`
      return <article key={question.id}><Eyebrow>{String(index + 1).padStart(2,'0')} · {question.type}</Eyebrow><label id={labelId} htmlFor={scalarInput ? inputId : undefined}>{question.label}{question.required && <b> *</b>}</label><QuestionInput question={question} value={answers[question.id]} onChange={(value) => setAnswer(question.id,value)} inputId={inputId} labelId={labelId} invalid={invalid} errorId={errorId} />{invalid && <small id={errorId} className="student-question-error">Revise esta resposta para continuar.</small>}</article>
    })}</div>
    <section className="student-form-consent"><ShieldCheck size={20} /><div><Eyebrow>DADO DE SAÚDE · FINALIDADE RESTRITA</Eyebrow><p>As respostas serão usadas para acompanhamento, segurança e comunicação com a equipe vinculada. Você poderá retirar o consentimento; novos usos e o acesso profissional serão interrompidos conforme a política vigente.</p><label className="switch-label"><input ref={consentRef} type="checkbox" checked={consent} disabled={submitting} onChange={(event) => { changed(); setConsent(event.target.checked) }} aria-invalid={consentError} aria-describedby={consentError ? 'live-anamnesis-consent-error' : undefined} /><i /><span>Autorizo o registro e o compartilhamento destas respostas com meu professor.</span></label>{consentError && <small id="live-anamnesis-consent-error" role="alert">Confirme o consentimento antes de enviar.</small>}</div></section>
    {error && <p className="builder-validation" role="alert"><AlertCircleIcon /> {error}</p>}
    <Button className="wide student-form-submit" disabled={submitting} onClick={() => void submit()}>{submitting ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />} Enviar respostas</Button>
  </div>
}

function QuestionInput({ question, value, onChange, inputId, labelId, invalid, errorId }: { question: FormQuestion; value: string | string[] | undefined; onChange: (value: string | string[]) => void; inputId: string; labelId: string; invalid: boolean; errorId: string }) {
  const scalar = typeof value === 'string' ? value : ''
  if (question.type === 'long') return <textarea id={inputId} value={scalar} maxLength={4000} aria-required={question.required} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} onChange={(event) => onChange(event.target.value)} placeholder="Sua resposta" />
  if (question.type === 'text') return <input id={inputId} value={scalar} maxLength={500} aria-required={question.required} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} onChange={(event) => onChange(event.target.value)} placeholder="Sua resposta" />
  if (question.type === 'number') return <input id={inputId} inputMode="decimal" value={scalar} aria-required={question.required} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} onChange={(event) => onChange(event.target.value)} placeholder="Ex.: 3 ou 7,5" />
  if (question.type === 'scale') return <div id={inputId} className="student-scale" role="group" aria-labelledby={labelId} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}>{Array.from({ length: 11 },(_,number) => <button type="button" className={scalar === String(number) ? 'active' : ''} aria-pressed={scalar === String(number)} onClick={() => onChange(String(number))} key={number}>{number}</button>)}</div>
  const options = question.type === 'yesno' ? ['Sim','Não'] : question.options ?? []
  if (question.type === 'multi') {
    const selected = Array.isArray(value) ? value : []
    return <div id={inputId} className="student-choices" role="group" aria-labelledby={labelId} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}>{options.map((option) => { const active = selected.includes(option); return <button type="button" className={active ? 'active' : ''} aria-pressed={active} key={option} onClick={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])}><i>{active && <Check size={12} />}</i>{option}</button> })}</div>
  }
  return <div id={inputId} className="student-choices" role="radiogroup" aria-labelledby={labelId} aria-required={question.required} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}>{options.map((option) => <button type="button" role="radio" className={scalar === option ? 'active' : ''} aria-checked={scalar === option} key={option} onClick={() => onChange(option)}><i>{scalar === option && <Check size={12} />}</i>{option}</button>)}</div>
}
