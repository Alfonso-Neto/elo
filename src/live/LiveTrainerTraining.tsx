import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertCircle, AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Check, ChevronDown,
  Dumbbell, Eye, FileCheck2, FilePlus2, GripVertical, HeartPulse, Info, LoaderCircle,
  Plus, Search, Send, ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { createAssistantService, type AssistantProposal, type TrainerCopilotContext } from '../assistant/assistant-service'
import {
  applyAssistantProposalToDraft, buildAssistantWorkoutContext, buildBuilderReviewReport,
  formatStructuredWorkoutFeedback,
} from '../assistant/workout-proposal'
import { BackButton, Button, Drawer, Eyebrow, MovementDemo, PageIntro, SectionTitle, SuccessState } from '../components'
import { exerciseLibrary, formTemplateQuestions, formTemplates, generalForm } from '../data'
import { listEnrolledStudents, type EnrolledStudent } from '../onboarding/enrollment-service'
import { usePrototype } from '../prototype-context'
import { createIdempotencyKey, createSignalService } from '../signals'
import type { Exercise, FormQuestion, QuestionType } from '../types'
import {
  assignAnamnesis, getLatestWorkoutVersion, listAnamnesisAssignments, listAnamnesisSubmissions,
  listWorkoutCompletions, publishWorkoutVersion, type AnamnesisAssignment,
  type AnamnesisSubmission, type TrainingScope,
} from './training'
import './live-training.css'

type LoadPhase = 'loading' | 'ready' | 'error'
type BuilderReviewPhase = 'idle' | 'loading' | 'processing' | 'complete' | 'error'
type BuilderReviewCoverage = {
  signals: 'included' | 'none' | 'unavailable'
  feedback: 'included' | 'none' | 'unavailable'
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function dateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'registro recente' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

const exerciseDraftFields: (keyof Exercise)[] = ['id', 'name', 'muscle', 'sets', 'reps', 'load', 'rest', 'tempo', 'rir', 'note', 'suggested']

function matchesWorkoutSnapshot(candidate: { title: string; exercises: Exercise[] }, title: string, exercises: Exercise[]) {
  return candidate.title === title
    && candidate.exercises.length === exercises.length
    && candidate.exercises.every((exercise, index) => exerciseDraftFields.every((field) => exercise[field] === exercises[index]?.[field]))
}

function useTrainerTarget() {
  const { membership, profile } = useAuth()
  const { selectedStudentId, setSelectedStudentId } = usePrototype()
  const selectedStudentIdRef = useRef(selectedStudentId)
  const [students, setStudents] = useState<EnrolledStudent[]>([])
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [error, setError] = useState('')
  const scope = useMemo<TrainingScope | null>(() => membership && profile ? { workspaceId: membership.workspaceId, userId: profile.id, role: 'trainer' } : null, [membership, profile])
  useEffect(() => { selectedStudentIdRef.current = selectedStudentId }, [selectedStudentId])

  const load = useCallback(async () => {
    setPhase('loading')
    setError('')
    try {
      const next = await listEnrolledStudents()
      setStudents(next)
      if (!next.some((student) => student.userId === selectedStudentIdRef.current)) setSelectedStudentId(next[0]?.userId ?? '')
      setPhase('ready')
    } catch (cause) {
      setPhase('error')
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os alunos vinculados.')
    }
  }, [setSelectedStudentId])
  useEffect(() => { void load() }, [load])
  return { students, student: students.find((item) => item.userId === selectedStudentId) ?? null, selectedStudentId, setSelectedStudentId, scope, phase, error, reload: load }
}

function TargetState({ phase, error, onRetry }: { phase: LoadPhase; error: string; onRetry: () => void }) {
  if (phase === 'loading') return <div className="live-loading"><LoaderCircle className="spin" size={23} /><p>Carregando o contexto real...</p></div>
  if (phase === 'error') return <div className="empty-state"><ShieldCheck size={29} /><h3>O contexto não abriu agora.</h3><p>{error}</p><Button variant="secondary" onClick={onRetry}>Tentar novamente</Button></div>
  return <div className="empty-state"><FileCheck2 size={29} /><h3>Nenhum aluno vinculado.</h3><p>Convide um aluno antes de prescrever ou enviar uma anamnese.</p></div>
}

function TargetPicker({ students, value, onChange, label, disabled = false }: { students: EnrolledStudent[]; value: string; onChange: (value: string) => void; label: string; disabled?: boolean }) {
  const student = students.find((item) => item.userId === value)
  return <label className="training-target-picker"><span className="person-avatar priority">{initials(student?.displayName ?? 'Aluno')}</span><span><small>{label}</small><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{students.map((item) => <option value={item.userId} key={item.userId}>{item.displayName}</option>)}</select></span></label>
}

const builderOperationLabels: Record<AssistantProposal['workout_changes'][number]['operation'], string> = {
  reduce_load_percent: 'Reduzir carga',
  reduce_volume_percent: 'Reduzir volume',
  replace_exercise: 'Trocar exercício',
  remove_exercise: 'Retirar exercício',
  add_rest_seconds: 'Aumentar descanso',
  cap_rpe: 'Limitar RPE',
  pause_session: 'Pausar sessão',
  request_professional_review: 'Solicitar avaliação profissional',
}

const builderUrgencyLabels: Record<AssistantProposal['urgency'], string> = {
  routine: 'ACOMPANHAR',
  soon: 'REVISAR EM BREVE',
  urgent: 'PRIORIDADE',
  emergency: 'INTERROMPER E ENCAMINHAR',
}

function builderProposalValue(change: AssistantProposal['workout_changes'][number]) {
  if (change.operation === 'replace_exercise') return change.value_text
  if (change.value_number === null) return null
  if (change.operation === 'reduce_load_percent' || change.operation === 'reduce_volume_percent') return `${change.value_number}%`
  if (change.operation === 'add_rest_seconds') return `+${change.value_number}s`
  if (change.operation === 'cap_rpe') return `RPE ${change.value_number}`
  return String(change.value_number)
}

function BuilderReviewCoverageNote({ coverage }: { coverage: BuilderReviewCoverage }) {
  const signalLabel = coverage.signals === 'included' ? 'sinal estruturado incluído' : coverage.signals === 'none' ? 'sem relato de dor recente' : 'sinais indisponíveis'
  const feedbackLabel = coverage.feedback === 'included' ? 'RPE recente incluído' : coverage.feedback === 'none' ? 'sem conclusão recente' : 'feedback indisponível'
  return <div className="builder-review-coverage" aria-label="Cobertura usada pelo Copiloto"><span><HeartPulse size={14} /> {signalLabel}</span><span><Activity size={14} /> {feedbackLabel}</span></div>
}

function BuilderCopilotPanel({
  phase, proposal, decision, error, coverage, deciding, draftCount, onRun, onDecide,
}: {
  phase: BuilderReviewPhase
  proposal: AssistantProposal | null
  decision: 'accepted' | 'rejected' | null
  error: string
  coverage: BuilderReviewCoverage
  deciding: boolean
  draftCount: number
  onRun: () => void
  onDecide: (decision: 'accepted' | 'rejected') => void
}) {
  if (decision) return <SuccessState title={decision === 'accepted' ? 'Revisão registrada no rascunho.' : 'Proposta rejeitada e registrada.'} copy={decision === 'accepted' ? 'Os ajustes aceitos continuam editáveis. Nada foi publicado para o aluno.' : 'O rascunho permaneceu como estava e a decisão ficou auditada.'} />
  if (phase === 'idle') return <div className="builder-copilot-intro"><span><Sparkles size={23} /></span><Eyebrow>REVISÃO SOB DEMANDA</Eyebrow><h3>Quer um segundo olhar sobre este rascunho?</h3><p>O Copiloto cruza até 20 exercícios com o último sinal estruturado e os RPEs recentes. Ele mostra perguntas, limites e sugestões; você decide o que entra.</p><div className="builder-review-snapshot"><strong>{draftCount}</strong><span><b>{draftCount === 1 ? 'exercício' : 'exercícios'}</b><small>Somente um snapshot minimizado será analisado.</small></span></div><Button className="wide" disabled={draftCount === 0} onClick={onRun}><Sparkles size={16} /> Revisar este rascunho</Button><small className="anchor-copy">A revisão não salva, altera nem publica nada sozinha.</small></div>
  if (phase === 'loading' || phase === 'processing') return <div className="builder-review-progress" role="status"><LoaderCircle className={phase === 'loading' ? 'spin' : ''} size={24} /><span><strong>{phase === 'loading' ? 'Organizando sinais e parâmetros...' : 'A revisão continua em processamento.'}</strong><small>O rascunho permanece intacto.</small></span>{phase === 'processing' && <Button variant="secondary" onClick={onRun}>Verificar novamente</Button>}</div>
  if (phase === 'error') return <div className="builder-review-error" role="alert"><Info size={20} /><div><strong>O Copiloto não concluiu esta revisão.</strong><p>{error}</p></div><BuilderReviewCoverageNote coverage={coverage} /><Button variant="secondary" className="wide" onClick={onRun}>Tentar novamente</Button></div>
  if (!proposal) return null

  return <div className={`builder-review-proposal urgency-${proposal.urgency}`}>
    <BuilderReviewCoverageNote coverage={coverage} />
    <article className="builder-review-summary"><Sparkles size={19} /><div><Eyebrow>PROPOSTA · {builderUrgencyLabels[proposal.urgency]}</Eyebrow><h3>{proposal.summary}</h3></div></article>
    {proposal.red_flags.length > 0 && <div className="builder-review-alerts">{proposal.red_flags.map((flag) => <article key={flag.code}><AlertTriangle size={17} /><span><strong>{flag.label}</strong><p>{flag.evidence}</p><small>{flag.recommended_action}</small></span></article>)}</div>}
    {proposal.rationale.length > 0 && <section className="builder-review-list"><Eyebrow>POR QUE VALE PENSAR</Eyebrow>{proposal.rationale.map((reason, index) => <article key={`${index}-${reason}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{reason}</p></article>)}</section>}
    {proposal.questions.length > 0 && <section className="builder-review-list questions"><Eyebrow>PERGUNTAS ANTES DE PUBLICAR</Eyebrow>{proposal.questions.map((question) => <article key={question.id}><span>?</span><p><strong>{question.question}</strong><small>{question.reason}</small></p></article>)}</section>}
    <section className="builder-review-list changes"><Eyebrow>AJUSTES PROPOSTOS · AINDA NÃO APLICADOS</Eyebrow>{proposal.workout_changes.length ? proposal.workout_changes.map((change, index) => <article key={`${change.operation}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><p><strong>{builderOperationLabels[change.operation]}{change.target ? ` · ${change.target}` : ''}</strong><small>{builderProposalValue(change) ?? 'Sem valor automático'} · {change.guardrail}{change.duration_sessions ? ` · ${change.duration_sessions} sessões` : ''}</small></p></article>) : <p className="mini-empty">Nenhuma mudança de parâmetro foi proposta; revise as perguntas acima.</p>}</section>
    {proposal.sources.length > 0 && <section className="builder-review-sources"><Eyebrow>FONTES DECLARADAS</Eyebrow><div>{proposal.sources.map((source) => <span key={`${source.kind}-${source.label}`}><ShieldCheck size={13} /> {source.label}</span>)}</div></section>}
    {proposal.uncertainties.length > 0 && <section className="builder-review-uncertainties"><Eyebrow>INCERTEZAS DECLARADAS</Eyebrow>{proposal.uncertainties.map((item) => <p key={item}>? {item}</p>)}</section>}
    <div className="proposal-disclaimer"><Info size={16} /><p>{proposal.disclaimer}</p></div>
    {error && <p className="builder-validation" role="alert"><AlertTriangle size={15} /> {error}</p>}
    <footer className="builder-review-actions"><Button variant="ghost" disabled={deciding} onClick={() => onDecide('rejected')}><X size={16} /> Manter meu rascunho</Button><Button disabled={deciding} onClick={() => onDecide('accepted')}>{deciding ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Aceitar no rascunho</Button></footer>
    <p className="anchor-copy">Aceitar registra sua decisão e cria apenas uma edição local. Publicar continua sendo outra ação explícita.</p>
  </div>
}

export function LiveWorkoutBuilderScreen() {
  const {
    navigate, workout: stagedWorkout, workoutName: stagedName, workoutDraftStudentId,
    workoutSessionDrafts, setWorkoutDraftStudentId, setWorkoutSessionDrafts, notify,
  } = usePrototype()
  const target = useTrainerTarget()
  const [draft, setDraft] = useState<Exercise[]>([])
  const [title, setTitle] = useState('Nova prescrição')
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [error, setError] = useState('')
  const [published, setPublished] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [expanded, setExpanded] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryQuery, setLibraryQuery] = useState('')
  const [preview, setPreview] = useState<Exercise | null>(null)
  const [playing, setPlaying] = useState(true)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [reviewPhase, setReviewPhase] = useState<BuilderReviewPhase>('idle')
  const [reviewProposal, setReviewProposal] = useState<AssistantProposal | null>(null)
  const [reviewProposalId, setReviewProposalId] = useState('')
  const [reviewDecision, setReviewDecision] = useState<'accepted' | 'rejected' | null>(null)
  const [reviewError, setReviewError] = useState('')
  const [reviewCoverage, setReviewCoverage] = useState<BuilderReviewCoverage>({ signals: 'none', feedback: 'none' })
  const [decidingReview, setDecidingReview] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const publishKey = useRef('')
  const publishRequestVersion = useRef(0)
  const reviewKey = useRef('')
  const reviewSnapshot = useRef<{ report: string; context: TrainerCopilotContext } | null>(null)
  const reviewRequestVersion = useRef(0)
  const sessionDraftsRef = useRef(workoutSessionDrafts)

  useEffect(() => { sessionDraftsRef.current = workoutSessionDrafts }, [workoutSessionDrafts])
  useEffect(() => () => { publishRequestVersion.current += 1 }, [])

  const resetReview = useCallback(() => {
    reviewRequestVersion.current += 1
    reviewKey.current = ''
    reviewSnapshot.current = null
    setReviewPhase('idle')
    setReviewProposal(null)
    setReviewProposalId('')
    setReviewDecision(null)
    setReviewError('')
    setReviewCoverage({ signals: 'none', feedback: 'none' })
    setDecidingReview(false)
  }, [])

  useEffect(() => {
    if (!target.scope || !target.selectedStudentId || !target.student) return
    let active = true
    setPhase('loading')
    setError('')
    setPublished(false)
    setPublishing(false)
    publishKey.current = ''
    publishRequestVersion.current += 1
    resetReview()
    if (workoutDraftStudentId === target.selectedStudentId && stagedWorkout.length) {
      const stagedDraft = stagedWorkout.map((item) => ({ ...item }))
      setDraft(stagedDraft)
      setTitle(stagedName)
      setExpanded(stagedWorkout[0]?.id ?? '')
      setWorkoutSessionDrafts((current) => ({ ...current, [target.selectedStudentId]: { title: stagedName, exercises: stagedDraft.map((item) => ({ ...item })) } }))
      setWorkoutDraftStudentId('')
      setPhase('ready')
      return
    }
    const sessionDraft = sessionDraftsRef.current[target.selectedStudentId]
    if (sessionDraft) {
      setDraft(sessionDraft.exercises.map((item) => ({ ...item })))
      setTitle(sessionDraft.title)
      setExpanded(sessionDraft.exercises[0]?.id ?? '')
      setPhase('ready')
      return
    }
    void getLatestWorkoutVersion(target.scope, target.selectedStudentId)
      .then((version) => {
        if (!active) return
        setDraft(version?.exercises.map((item) => ({ ...item })) ?? [])
        setTitle(version?.title ?? 'Nova prescrição')
        setExpanded(version?.exercises[0]?.id ?? '')
        setPhase('ready')
      })
      .catch((cause) => {
        if (!active) return
        setPhase('error')
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o treino.')
      })
    return () => { active = false }
  }, [stagedName, stagedWorkout, target.scope, target.selectedStudentId, target.student, workoutDraftStudentId, setWorkoutDraftStudentId, setWorkoutSessionDrafts, reloadToken, resetReview])

  const changed = () => { publishKey.current = ''; setPublished(false); setError(''); resetReview() }
  const rememberDraft = (nextTitle: string, exercises: Exercise[]) => {
    if (!target.selectedStudentId) return
    setWorkoutSessionDrafts((current) => ({
      ...current,
      [target.selectedStudentId]: { title: nextTitle, exercises: exercises.map((item) => ({ ...item })) },
    }))
  }
  const updateExercise = (id: string, key: keyof Exercise, value: string) => {
    if (publishing) return
    const next = draft.map((item) => item.id === id ? { ...item, [key]: value } : item)
    changed(); setDraft(next); rememberDraft(title, next)
  }
  const move = (index: number, direction: number) => {
    if (publishing) return
    const destination = index + direction
    if (destination < 0 || destination >= draft.length) return
    const next = [...draft]
    const moving = next[index]
    next[index] = next[destination]
    next[destination] = moving
    changed(); setDraft(next); rememberDraft(title, next)
  }
  const addExercise = (exercise: Exercise) => {
    if (publishing) return
    if (draft.some((item) => item.id === exercise.id)) { notify('Exercício já incluído', 'Edite os parâmetros diretamente na prescrição.'); return }
    const next = [...draft, { ...exercise }]
    changed(); setDraft(next); rememberDraft(title, next); setExpanded(exercise.id); setLibraryOpen(false)
  }
  const removeExercise = (exerciseId: string) => {
    if (publishing) return
    const next = draft.filter((item) => item.id !== exerciseId)
    changed(); setDraft(next); rememberDraft(title, next)
  }
  const canPublish = Boolean(title.trim()) && draft.length > 0 && draft.every((exercise) => exercise.name.trim() && exercise.sets.trim() && exercise.reps.trim())
  const publish = async () => {
    if (!target.scope || !target.student || !canPublish || publishing) return
    const student = target.student
    const publishedTitle = title
    const publishedExercises = draft.map((exercise) => ({ ...exercise }))
    const requestVersion = ++publishRequestVersion.current
    const key = publishKey.current || createIdempotencyKey('publish-workout')
    publishKey.current = key
    setPublishing(true)
    setError('')
    try {
      await publishWorkoutVersion(target.scope, { studentUserId: student.userId, title: publishedTitle, exercises: publishedExercises, idempotencyKey: key })
      setWorkoutSessionDrafts((current) => {
        const currentDraft = current[student.userId]
        if (!currentDraft || !matchesWorkoutSnapshot(currentDraft, publishedTitle, publishedExercises)) return current
        const next = { ...current }
        delete next[student.userId]
        return next
      })
      if (requestVersion !== publishRequestVersion.current) {
        notify('Treino publicado', `${student.displayName} recebeu a versão confirmada. Qualquer rascunho mais novo foi preservado.`)
        return
      }
      setPublished(true)
      notify('Treino publicado', `${student.displayName} recebeu uma nova versão imutável.`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível publicar o treino agora.'
      if (requestVersion !== publishRequestVersion.current) {
        notify('Publicação não concluída', `${student.displayName}: ${message}`)
        return
      }
      setError(message)
    } finally {
      if (requestVersion === publishRequestVersion.current) setPublishing(false)
    }
  }

  const runBuilderReview = async () => {
    if (!target.scope || !target.student || !draft.length || reviewPhase === 'loading') return
    const requestVersion = ++reviewRequestVersion.current
    const key = reviewKey.current || createIdempotencyKey('builder-review')
    reviewKey.current = key
    setReviewPhase('loading')
    setReviewError('')
    try {
      let snapshot = reviewSnapshot.current
      if (!snapshot) {
        const [signalResult, feedbackResult] = await Promise.allSettled([
          createSignalService().listStudentReports(target.scope.workspaceId, target.student.userId, { limit: 1 }),
          listWorkoutCompletions(target.scope, target.student.userId, { limit: 4 }),
        ])
        if (requestVersion !== reviewRequestVersion.current) return
        const latestPainReport = signalResult.status === 'fulfilled' ? signalResult.value.items[0] ?? null : null
        const recentCompletions = feedbackResult.status === 'fulfilled' ? feedbackResult.value.items : []
        const coverage: BuilderReviewCoverage = {
          signals: signalResult.status === 'rejected' ? 'unavailable' : latestPainReport ? 'included' : 'none',
          feedback: feedbackResult.status === 'rejected' ? 'unavailable' : recentCompletions.length ? 'included' : 'none',
        }
        setReviewCoverage(coverage)
        snapshot = {
          report: buildBuilderReviewReport({
            title,
            workout: draft,
            latestPainReport,
            signalLookupFailed: coverage.signals === 'unavailable',
          }),
          context: {
            training_goal: `Revisar a coerência do rascunho “${(title.trim() || 'sem título').slice(0, 120)}” sem substituir a decisão profissional.`,
            recent_feedback: formatStructuredWorkoutFeedback(recentCompletions),
            constraints: [
              'Nenhuma mudança pode ser publicada automaticamente.',
              'Não diagnosticar nem inventar dados ausentes.',
              'Sugerir apenas ajustes limitados, perguntas e guardrails.',
              coverage.signals === 'unavailable' ? 'A consulta de sinais falhou; declarar essa incerteza.' : coverage.signals === 'none' ? 'Nenhum relato de dor recente foi encontrado.' : 'Há um relato estruturado recente no contexto.',
              coverage.feedback === 'unavailable' ? 'A consulta de feedback falhou; declarar essa incerteza.' : coverage.feedback === 'none' ? 'Nenhum RPE recente foi encontrado.' : 'Há feedback estruturado recente no contexto.',
              ...(draft.length > 20 ? ['O rascunho excede 20 exercícios; a revisão cobre apenas os 20 primeiros.'] : []),
            ],
            current_workout: buildAssistantWorkoutContext(draft),
          },
        }
        reviewSnapshot.current = snapshot
      }
      const result = await createAssistantService().requestTrainerCopilot({
        workspaceId: target.scope.workspaceId,
        studentId: target.student.userId,
        report: snapshot.report,
        context: snapshot.context,
        idempotencyKey: key,
      })
      if (requestVersion !== reviewRequestVersion.current) return
      if (result.state === 'processing') {
        setReviewPhase('processing')
        return
      }
      setReviewProposal(result.proposal)
      setReviewProposalId(result.proposalId)
      setReviewPhase('complete')
    } catch (cause) {
      if (requestVersion !== reviewRequestVersion.current) return
      setReviewPhase('error')
      setReviewError(cause instanceof Error ? cause.message : 'A revisão não ficou disponível agora.')
    }
  }

  const decideBuilderReview = async (decision: 'accepted' | 'rejected') => {
    if (!reviewProposal || !reviewProposalId || decidingReview) return
    const requestVersion = reviewRequestVersion.current
    setDecidingReview(true)
    setReviewError('')
    try {
      await createAssistantService().decideProposal({
        proposalId: reviewProposalId,
        decision,
        note: decision === 'accepted'
          ? 'Proposta aceita no Copiloto flutuante como edição local; nenhuma publicação automática.'
          : 'Proposta rejeitada no Copiloto flutuante; rascunho mantido sem alterações.',
      })
      if (requestVersion !== reviewRequestVersion.current) return
      if (decision === 'accepted') {
        const revisedDraft = applyAssistantProposalToDraft(draft, reviewProposal)
        setDraft(revisedDraft)
        rememberDraft(title, revisedDraft)
        setExpanded((current) => revisedDraft.some((item) => item.id === current) ? current : revisedDraft[0]?.id ?? '')
        publishKey.current = ''
        setPublished(false)
        notify('Proposta aplicada ao rascunho', 'Revise cada parâmetro; nada foi publicado para o aluno.')
      }
      setReviewDecision(decision)
    } catch (cause) {
      if (requestVersion !== reviewRequestVersion.current) return
      setReviewError(cause instanceof Error ? cause.message : 'Não foi possível registrar sua decisão.')
    } finally {
      if (requestVersion === reviewRequestVersion.current) setDecidingReview(false)
    }
  }

  const reviewCount = reviewDecision
    ? 0
    : reviewProposal
      ? Math.min(9, Math.max(1, reviewProposal.red_flags.length + reviewProposal.questions.length + reviewProposal.workout_changes.length))
      : draft.length > 0 ? 1 : 0
  const reviewButtonLabel = reviewDecision
    ? 'Abrir revisão concluída do Copiloto'
    : `Abrir ${reviewCount} ${reviewCount === 1 ? 'ponto' : 'pontos'} para revisar com o Copiloto`
  const hasSessionDraft = Boolean(workoutSessionDrafts[target.selectedStudentId])

  if (target.phase !== 'ready' || !target.student || !target.scope) return <div className="page enter"><TargetState phase={target.phase} error={target.error} onRetry={() => void target.reload()} /></div>
  if (phase === 'loading') return <div className="page enter"><div className="live-loading"><LoaderCircle className="spin" size={23} /><p>Carregando a última versão publicada...</p></div></div>
  if (phase === 'error') return <div className="page enter"><TargetState phase="error" error={error} onRetry={() => setReloadToken((value) => value + 1)} /></div>

  return <div className="page builder-page live-training-screen enter"><BackButton onClick={() => navigate('copilot')} label="Voltar ao Copiloto" />
    <PageIntro eyebrow={`CONSTRUTOR · ${target.student.displayName.toUpperCase()}`} title="Treino em suas mãos." copy="A publicação cria uma versão imutável. Qualquer atualização futura vira uma nova versão auditável." action={<div className="builder-actions"><Button variant="secondary" disabled={!draft.length} onClick={() => setPreview(draft[0])}><Eye size={16} /> Pré-visualizar</Button><Button disabled={!canPublish || publishing} onClick={() => void publish()}>{publishing ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} {published ? 'Publicar nova versão' : 'Publicar treino'}</Button></div>} />
    <div className="live-target-row"><TargetPicker students={target.students} value={target.selectedStudentId} onChange={target.setSelectedStudentId} label="PRESCREVENDO PARA" disabled={publishing} /><span><strong>{draft.length}</strong><small>EXERCÍCIOS NO RASCUNHO</small></span></div>
    <section className="builder-toolbar"><label><span>NOME DO TREINO</span><input value={title} disabled={publishing} onChange={(event) => { const nextTitle = event.target.value.slice(0, 80); changed(); setTitle(nextTitle); rememberDraft(nextTitle, draft) }} /></label><div><span className="tag blue">{hasSessionDraft ? 'RASCUNHO PRESERVADO' : 'BASE PUBLICADA'}</span><small>{publishing ? 'Publicando o snapshot confirmado; aguarde para editar.' : hasSessionDraft ? 'Continua disponível enquanto esta conta estiver aberta.' : 'Edite para criar um rascunho; nada publica sozinho.'}</small></div></section>
    <div className="exercise-builder-list">{draft.map((exercise, index) => <article className={expanded === exercise.id ? 'builder-exercise open' : 'builder-exercise'} key={exercise.id}><button className="builder-exercise-head" onClick={() => setExpanded(expanded === exercise.id ? '' : exercise.id)} aria-expanded={expanded === exercise.id}><GripVertical size={17} /><span className="exercise-order">{String(index + 1).padStart(2, '0')}</span><span className="exercise-glyph"><Dumbbell size={18} /></span><span><strong>{exercise.name}</strong><small>{exercise.muscle}</small></span>{exercise.suggested && <span className="tag success">PROPOSTA REVISADA</span>}<ChevronDown size={18} /></button>
      {expanded === exercise.id && <div className="builder-fields enter"><div className="field-grid">{([['sets','Séries'],['reps','Repetições'],['load','Carga'],['rest','Descanso'],['tempo','Cadência'],['rir','RIR']] as [keyof Exercise,string][]).map(([key,label]) => <label key={key}><span>{label}</span><input value={String(exercise[key] ?? '')} disabled={publishing} onChange={(event) => updateExercise(exercise.id, key, event.target.value.slice(0, 40))} /></label>)}</div><label className="note-field"><span>Observação visível para o aluno</span><textarea value={exercise.note} disabled={publishing} onChange={(event) => updateExercise(exercise.id, 'note', event.target.value.slice(0, 220))} /></label><div className="exercise-actions"><Button variant="ghost" onClick={() => setPreview(exercise)}><Eye size={15} /> Ver como o aluno vê</Button><span /><button onClick={() => move(index,-1)} disabled={publishing || index === 0} aria-label="Mover para cima"><ArrowUp size={16} /></button><button onClick={() => move(index,1)} disabled={publishing || index === draft.length - 1} aria-label="Mover para baixo"><ArrowDown size={16} /></button><button className="danger-action" disabled={publishing} onClick={() => removeExercise(exercise.id)} aria-label={`Remover ${exercise.name}`}><Trash2 size={16} /></button></div></div>}
    </article>)}</div>
    {!draft.length && <div className="empty-state compact"><Dumbbell size={27} /><h3>Comece a prescrição.</h3><p>Adicione exercícios da biblioteca e defina os parâmetros antes de publicar.</p></div>}
    <button className="add-block" disabled={publishing} onClick={() => setLibraryOpen(true)}><Plus size={19} /><span><strong>Adicionar exercício</strong><small>Biblioteca de movimentos e parâmetros editáveis</small></span></button>
    {!canPublish && <p className="builder-validation" role="status"><AlertCircle size={15} /> Informe o nome e mantenha ao menos um exercício com séries e repetições.</p>}
    {error && <p className="builder-validation" role="alert"><AlertCircle size={15} /> {error}</p>}
    {published && <div className="live-publish-success"><Check size={18} /><span><strong>Versão publicada com sucesso.</strong><small>Edite qualquer campo para criar uma nova intenção e uma nova chave segura.</small></span></div>}
    <aside className="builder-savebar"><span><ShieldCheck size={16} /><strong>{hasSessionDraft ? 'Rascunho preservado nesta sessão' : 'Base carregada para revisão'}</strong><small>{canPublish ? hasSessionDraft ? 'Você pode navegar sem perder estas edições.' : 'Pronto para sua confirmação explícita.' : 'Complete os campos essenciais.'}</small></span><Button disabled={!canPublish || publishing} onClick={() => void publish()}>{publishing ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Publicar para {target.student.displayName.split(/\s+/)[0]}</Button></aside>
    <button className={`floating-copilot live-floating-copilot phase-${reviewPhase}`} disabled={publishing} onClick={() => setCopilotOpen(true)} aria-label={publishing ? 'Copiloto indisponível durante a publicação' : reviewButtonLabel} aria-haspopup="dialog" aria-expanded={copilotOpen}><Sparkles size={22} />{reviewCount > 0 && <b>{reviewCount}</b>}</button>
    {copilotOpen && <Drawer title={reviewDecision ? 'Revisão concluída' : reviewProposal ? `${reviewCount} ${reviewCount === 1 ? 'ponto para pensar' : 'pontos para pensar'}` : 'Segundo olhar no rascunho'} eyebrow="COPILOTO FLUTUANTE · DECISÃO HUMANA" onClose={() => !decidingReview && setCopilotOpen(false)}><BuilderCopilotPanel phase={reviewPhase} proposal={reviewProposal} decision={reviewDecision} error={reviewError} coverage={reviewCoverage} deciding={decidingReview} draftCount={draft.length} onRun={() => void runBuilderReview()} onDecide={(decision) => void decideBuilderReview(decision)} /></Drawer>}
    {libraryOpen && <Drawer title="Biblioteca de exercícios" eyebrow="ADICIONAR AO RASCUNHO" onClose={() => setLibraryOpen(false)}><label className="search-field modal-search"><Search size={17} /><span className="sr-only">Buscar exercício</span><input autoFocus placeholder="Nome ou grupo muscular..." value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} /></label><div className="library-list">{exerciseLibrary.filter((exercise) => `${exercise.name} ${exercise.muscle}`.toLowerCase().includes(libraryQuery.toLowerCase())).map((exercise) => <button key={exercise.id} onClick={() => addExercise(exercise)}><span className="exercise-glyph"><Dumbbell size={17} /></span><span><strong>{exercise.name}</strong><small>{exercise.muscle}</small></span><Plus size={17} /></button>)}</div></Drawer>}
    {preview && <Drawer title={preview.name} eyebrow="VISÃO DO ALUNO" onClose={() => setPreview(null)}><MovementDemo name={preview.name} playing={playing} onToggle={() => setPlaying((value) => !value)} /><div className="exercise-stats">{[['Séries',preview.sets],['Reps',preview.reps],['Carga',preview.load],['Descanso',preview.rest],['Cadência',preview.tempo],['RIR',preview.rir]].map(([label,value]) => <div key={label}><strong>{value}</strong><small>{label}</small></div>)}</div><div className="trainer-note"><Eyebrow>RECADO DO PROFESSOR</Eyebrow><p>{preview.note || 'Sem observação adicional.'}</p></div></Drawer>}
  </div>
}

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: 'text', label: 'Texto curto' }, { value: 'long', label: 'Texto longo' }, { value: 'single', label: 'Escolha única' }, { value: 'multi', label: 'Múltipla' }, { value: 'scale', label: 'Escala 0–10' }, { value: 'yesno', label: 'Sim / não' }, { value: 'number', label: 'Número' },
]

export function LiveTrainerFormsScreen() {
  const { navigate, setFormQuestions, setFormTitle } = usePrototype()
  const target = useTrainerTarget()
  const [assignments, setAssignments] = useState<AnamnesisAssignment[]>([])
  const [submissions, setSubmissions] = useState<AnamnesisSubmission[]>([])
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [error, setError] = useState('')
  const [openSubmission, setOpenSubmission] = useState<AnamnesisSubmission | null>(null)

  const load = useCallback(async () => {
    if (!target.scope || !target.student) return
    setPhase('loading'); setError('')
    try {
      const [assignmentPage, submissionPage] = await Promise.all([
        listAnamnesisAssignments(target.scope, target.student.userId, { limit: 30 }),
        listAnamnesisSubmissions(target.scope, target.student.userId, { limit: 30 }),
      ])
      setAssignments(assignmentPage.items); setSubmissions(submissionPage.items); setPhase('ready')
    } catch (cause) {
      setPhase('error'); setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as anamneses.')
    }
  }, [target.scope, target.student])
  useEffect(() => { void load() }, [load])
  const submissionByAssignment = useMemo(() => new Map(submissions.map((item) => [item.assignmentId, item])), [submissions])
  const openTemplate = (id: string) => {
    setFormQuestions((formTemplateQuestions[id] ?? generalForm).map((question) => ({ ...question, options: question.options ? [...question.options] : undefined })))
    setFormTitle(formTemplates.find((template) => template.id === id)?.name ?? 'Nova anamnese')
    navigate('form-builder')
  }

  if (target.phase !== 'ready' || !target.student || !target.scope) return <div className="page enter"><TargetState phase={target.phase} error={target.error} onRetry={() => void target.reload()} /></div>
  return <div className="page live-training-screen enter"><PageIntro eyebrow="ANAMNESE · DADO COM FINALIDADE" title={<>Pergunte melhor.<br />Prescreva com mais história.</>} copy="Cada envio é imutável, exige vínculo ativo e depende do consentimento vigente do aluno." action={<Button onClick={() => { setFormQuestions([{ id: `q-${Date.now()}`, label: '', type: 'text', required: true }]); setFormTitle('Nova anamnese'); navigate('form-builder') }}><FilePlus2 size={16} /> Criar do zero</Button>} />
    <div className="live-target-row"><TargetPicker students={target.students} value={target.selectedStudentId} onChange={target.setSelectedStudentId} label="ANAMNESES DE" /><span><strong>{assignments.length}</strong><small>ENVIOS CARREGADOS</small></span></div>
    <SectionTitle index="01" title="Modelos prontos" copy="Pontos de partida editáveis; nenhum modelo é enviado automaticamente." /><div className="template-grid">{formTemplates.map((template,index) => <button key={template.id} onClick={() => openTemplate(template.id)}><span>{String(index + 1).padStart(2,'0')}</span><FileCheck2 size={21} /><h3>{template.name}</h3><p>{template.niche}</p><footer>{template.questions} perguntas <ArrowRight size={15} /></footer></button>)}</div>
    <section className="section-block"><SectionTitle index="02" title="Histórico real" copy="Respostas só aparecem enquanto a base de acesso e consentimento permitir." />
      {phase === 'loading' && <div className="live-loading"><LoaderCircle className="spin" size={22} /><p>Carregando envios...</p></div>}
      {phase === 'error' && <div className="empty-state compact"><ShieldCheck size={25} /><h3>O histórico não abriu.</h3><p>{error}</p><Button variant="secondary" onClick={() => void load()}>Tentar novamente</Button></div>}
      {phase === 'ready' && <div className="assignment-list">{assignments.map((assignment) => { const submission = submissionByAssignment.get(assignment.id); return <button key={assignment.id} onClick={() => submission && setOpenSubmission(submission)} disabled={!submission}><span className="person-avatar priority">{initials(target.student!.displayName)}</span><span><strong>{assignment.title}</strong><small>Enviada em {dateTime(assignment.assignedAt)} · {submission ? `respondida em ${dateTime(submission.submittedAt)}` : 'aguardando resposta'}</small></span><span className={`tag ${submission ? 'success' : 'warning'}`}>{submission ? 'Concluída' : 'Pendente'}</span>{submission && <ArrowRight size={16} />}</button> })}{!assignments.length && <div className="empty-state compact"><FileCheck2 size={26} /><h3>Nenhuma anamnese enviada.</h3><p>Escolha um modelo ou crie perguntas específicas para este acompanhamento.</p></div>}</div>}
    </section>
    {openSubmission && <Drawer title={`Respostas de ${target.student.displayName}`} eyebrow={`ANAMNESE · ${dateTime(openSubmission.submittedAt).toUpperCase()}`} onClose={() => setOpenSubmission(null)}><div className="response-list">{assignments.find((item) => item.id === openSubmission.assignmentId)?.questions.map((question,index) => <article key={question.id}><Eyebrow>{String(index + 1).padStart(2,'0')} · {question.type}</Eyebrow><h3>{question.label}</h3><p>{Array.isArray(openSubmission.answers[question.id]) ? (openSubmission.answers[question.id] as string[]).join(', ') : String(openSubmission.answers[question.id] ?? 'Não respondida')}</p></article>)}</div><div className="consent-mini"><ShieldCheck size={18} /><span><strong>Acesso condicionado</strong><small>Vínculo, finalidade e consentimento são verificados pelo servidor.</small></span></div></Drawer>}
  </div>
}

export function LiveFormBuilderScreen() {
  const { navigate, formQuestions, formTitle, setFormQuestions, setFormTitle, notify } = usePrototype()
  const target = useTrainerTarget()
  const [preview, setPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantPhase, setAssistantPhase] = useState<'idle' | 'loading' | 'processing' | 'ready' | 'error'>('idle')
  const [assistantError, setAssistantError] = useState('')
  const [assistantProposal, setAssistantProposal] = useState<AssistantProposal | null>(null)
  const [assistantProposalId, setAssistantProposalId] = useState('')
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([])
  const [decidingSuggestion, setDecidingSuggestion] = useState(false)
  const assignmentKey = useRef('')
  const assistantKey = useRef('')
  const changed = () => { assignmentKey.current = ''; setSent(false); setError('') }
  const update = (id: string, patch: Partial<FormQuestion>) => { changed(); setFormQuestions((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)) }
  const add = (question?: Partial<FormQuestion>) => { changed(); setFormQuestions((items) => [...items, { id: `q-${Date.now()}-${items.length}`, label: question?.label ?? '', type: question?.type ?? 'text', options: question?.options, required: question?.required ?? false }]) }
  const move = (index: number, direction: number) => { changed(); setFormQuestions((items) => { const next = [...items]; const destination = index + direction; if (destination < 0 || destination >= next.length) return items; [next[index], next[destination]] = [next[destination], next[index]]; return next }) }
  const valid = Boolean(formTitle.trim()) && formQuestions.length > 0 && formQuestions.every((question) => question.label.trim() && (!['single','multi'].includes(question.type) || Boolean(question.options?.length && question.options.every((option) => option.trim()))))
  const requestSuggestions = async () => {
    if (!target.scope || !target.student || assistantPhase === 'loading') return
    const key = assistantKey.current || createIdempotencyKey('form-question-copilot')
    assistantKey.current = key
    setAssistantOpen(true); setAssistantPhase('loading'); setAssistantError('')
    try {
      const result = await createAssistantService().requestFormQuestionSuggestions({
        workspaceId: target.scope.workspaceId,
        studentId: target.student.userId,
        title: formTitle.trim() || 'Nova anamnese',
        existingQuestions: formQuestions.map((question) => question.label).filter((label) => label.trim()),
        idempotencyKey: key,
      })
      if (result.state === 'processing') {
        setAssistantPhase('processing')
        return
      }
      setAssistantProposal(result.proposal)
      setAssistantProposalId(result.proposalId)
      setSelectedSuggestions(result.proposal.questions.map((question) => question.id))
      setAssistantPhase('ready')
    } catch (cause) {
      setAssistantPhase('error')
      setAssistantError(cause instanceof Error ? cause.message : 'O Copiloto não conseguiu revisar este formulário agora.')
    }
  }
  const closeSuggestions = () => {
    if (decidingSuggestion) return
    setAssistantOpen(false)
  }
  const decideSuggestions = async (decision: 'accepted' | 'rejected') => {
    if (!assistantProposalId || !assistantProposal || decidingSuggestion) return
    setDecidingSuggestion(true); setAssistantError('')
    try {
      await createAssistantService().decideProposal({
        proposalId: assistantProposalId,
        decision,
        note: decision === 'accepted' ? 'Perguntas selecionadas para revisão no construtor.' : 'Sugestões descartadas no construtor.',
      })
      if (decision === 'accepted') {
        const existing = new Set(formQuestions.map((question) => question.label.trim().toLocaleLowerCase('pt-BR')))
        const mapped: FormQuestion[] = []
        for (const question of assistantProposal.questions) {
          const normalized = question.question.trim().toLocaleLowerCase('pt-BR')
          if (!selectedSuggestions.includes(question.id) || existing.has(normalized) || mapped.length >= Math.max(0, 50 - formQuestions.length)) continue
          existing.add(normalized)
          mapped.push({ id: `ai-${crypto.randomUUID()}`, label: question.question.trim(), type: question.answer_type === 'yes_no' ? 'yesno' : question.answer_type === 'scale_0_10' ? 'scale' : 'text', required: false })
        }
        setFormQuestions((items) => [...items, ...mapped])
        notify('Sugestões adicionadas ao rascunho', `${mapped.length} ${mapped.length === 1 ? 'pergunta foi incluída' : 'perguntas foram incluídas'} para sua edição. Nada foi enviado ao aluno.`)
      } else {
        notify('Sugestões descartadas', 'A decisão foi registrada e nenhuma pergunta foi adicionada.')
      }
      assistantKey.current = ''
      setAssistantOpen(false); setAssistantPhase('idle'); setAssistantProposal(null); setAssistantProposalId(''); setSelectedSuggestions([])
    } catch (cause) {
      setAssistantError(cause instanceof Error ? cause.message : 'Não foi possível registrar sua decisão.')
    } finally { setDecidingSuggestion(false) }
  }
  const send = async () => {
    if (!target.scope || !target.student || !valid || sending) return
    const key = assignmentKey.current || createIdempotencyKey('assign-anamnesis')
    assignmentKey.current = key
    setSending(true); setError('')
    try {
      await assignAnamnesis(target.scope, { studentUserId: target.student.userId, title: formTitle, questions: formQuestions, idempotencyKey: key })
      setSent(true); notify('Anamnese enviada', `${target.student.displayName} recebeu uma atribuição imutável.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a anamnese.')
    } finally { setSending(false) }
  }

  if (target.phase !== 'ready' || !target.student || !target.scope) return <div className="page enter"><TargetState phase={target.phase} error={target.error} onRetry={() => void target.reload()} /></div>
  return <div className="page form-builder-page live-training-screen enter"><BackButton onClick={() => navigate('forms')} label="Voltar para anamneses" /><PageIntro eyebrow={`CONSTRUTOR · ${target.student.displayName.toUpperCase()}`} title="Cada pergunta tem um motivo." copy="Colete somente o necessário. O aluno verá a finalidade e confirmará o consentimento antes de responder." action={<div className="builder-actions"><Button variant="secondary" onClick={() => void requestSuggestions()}><Sparkles size={16} /> Revisar lacunas</Button><Button variant="secondary" onClick={() => setPreview(true)}><Eye size={16} /> Pré-visualizar</Button><Button disabled={!valid || sending} onClick={() => void send()}>{sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Enviar</Button></div>} />
    <section className="form-meta"><label><span>TÍTULO DO FORMULÁRIO</span><input value={formTitle} onChange={(event) => { changed(); setFormTitle(event.target.value.slice(0,90)) }} /></label><div><strong>{formQuestions.length}</strong><span>perguntas</span></div></section>
    <div className="question-builder-list">{formQuestions.map((question,index) => <article key={question.id} className="question-card"><header><GripVertical size={17} /><span>{String(index + 1).padStart(2,'0')}</span><label><span>PERGUNTA</span><input value={question.label} onChange={(event) => update(question.id,{ label:event.target.value.slice(0,180) })} placeholder="Escreva uma pergunta clara..." /></label><div className="question-actions"><button onClick={() => move(index,-1)} disabled={index === 0} aria-label="Mover pergunta para cima"><ArrowUp size={15} /></button><button onClick={() => move(index,1)} disabled={index === formQuestions.length - 1} aria-label="Mover pergunta para baixo"><ArrowDown size={15} /></button><button className="danger-action" onClick={() => { changed(); setFormQuestions((items) => items.filter((item) => item.id !== question.id)) }} aria-label="Remover pergunta"><Trash2 size={15} /></button></div></header><div className="question-types">{questionTypes.map((type) => <button className={question.type === type.value ? 'active' : ''} aria-pressed={question.type === type.value} key={type.value} onClick={() => update(question.id,{ type:type.value, options:['single','multi'].includes(type.value) ? question.options ?? ['Opção 1','Opção 2'] : undefined })}>{type.label}</button>)}</div>{['single','multi'].includes(question.type) && <div className="options-editor">{(question.options ?? []).map((option,optionIndex) => <label key={`${question.id}-${optionIndex}`}><i /><input value={option} onChange={(event) => update(question.id,{ options:question.options?.map((item,i) => i === optionIndex ? event.target.value.slice(0,120) : item) })} /><button onClick={() => update(question.id,{ options:question.options?.filter((_,i) => i !== optionIndex) })} aria-label="Remover opção"><X size={14} /></button></label>)}<button onClick={() => update(question.id,{ options:[...(question.options ?? []),`Opção ${(question.options?.length ?? 0) + 1}`] })}>+ adicionar opção</button></div>}<footer><label className="switch-label"><input type="checkbox" checked={question.required ?? false} onChange={(event) => update(question.id,{ required:event.target.checked })} /><i /><span>Resposta obrigatória</span></label></footer></article>)}</div>
    <button className="add-block" onClick={() => add()}><Plus size={19} /><span><strong>Adicionar pergunta</strong><small>Texto, escolha, escala, sim/não ou número</small></span></button>
    {!valid && <p className="builder-validation"><AlertCircle size={15} /> Informe o título, as perguntas e todas as opções necessárias.</p>}{error && <p className="builder-validation" role="alert"><AlertCircle size={15} /> {error}</p>}
    {sent && <SuccessState title="Anamnese atribuída." copy="Ela já está disponível para o aluno. As perguntas desta versão não poderão ser alteradas." action={<Button onClick={() => navigate('forms')}>Ver histórico <ArrowRight size={16} /></Button>} />}
    {assistantOpen && <Drawer title="Lacunas para o seu olhar" eyebrow="COPILOTO · NADA ENTRA SOZINHO" onClose={closeSuggestions}>{assistantPhase === 'loading' && <div className="live-loading"><LoaderCircle className="spin" size={22} /><p>Revisando somente o título e as perguntas deste rascunho...</p></div>}{assistantPhase === 'processing' && <div className="empty-state compact"><Sparkles size={26} /><h3>A revisão ainda está sendo preparada.</h3><p>Nenhuma pergunta foi adicionada. Use a mesma solicitação para consultar novamente.</p><Button variant="secondary" onClick={() => void requestSuggestions()}>Verificar novamente</Button></div>}{assistantPhase === 'error' && <div className="empty-state compact"><ShieldCheck size={26} /><h3>O Copiloto não abriu agora.</h3><p>{assistantError}</p><Button variant="secondary" onClick={() => void requestSuggestions()}>Tentar novamente</Button></div>}{assistantPhase === 'ready' && assistantProposal && <><p className="modal-lead">{assistantProposal.summary}</p><div className="assistant-question-suggestions">{assistantProposal.questions.map((question) => { const selected = selectedSuggestions.includes(question.id); return <button key={question.id} className={selected ? 'selected' : ''} aria-pressed={selected} onClick={() => setSelectedSuggestions((items) => items.includes(question.id) ? items.filter((id) => id !== question.id) : [...items, question.id])}><i>{selected && <Check size={13} />}</i><span><strong>{question.question}</strong><small>{question.reason}</small></span></button> })}</div>{assistantProposal.uncertainties.length > 0 && <div className="copilot-uncertainties"><Eyebrow>LIMITES DESTA REVISÃO</Eyebrow>{assistantProposal.uncertainties.map((item) => <p key={item}>{item}</p>)}</div>}{assistantError && <p className="builder-validation" role="alert"><AlertCircle size={15} /> {assistantError}</p>}<div className="suggestion-decisions"><Button variant="ghost" disabled={decidingSuggestion} onClick={() => void decideSuggestions('rejected')}>Descartar tudo</Button><Button disabled={decidingSuggestion || selectedSuggestions.length === 0} onClick={() => void decideSuggestions('accepted')}>{decidingSuggestion ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Adicionar {selectedSuggestions.length} ao rascunho</Button></div><p className="anchor-copy">O Copiloto propõe; você seleciona, edita e decide se envia.</p></>}</Drawer>}
    {preview && <Drawer title={formTitle || 'Anamnese sem título'} eyebrow={`COMO ${target.student.displayName.split(/\s+/)[0].toUpperCase()} RESPONDERÁ`} onClose={() => setPreview(false)}><div className="consent-mini"><ShieldCheck size={18} /><span><strong>Consentimento explícito</strong><small>Dado de saúde · finalidade restrita ao acompanhamento.</small></span></div><FormPreview questions={formQuestions} /><Button className="wide" disabled={!valid || sending} onClick={() => void send()}>Confirmar e enviar</Button></Drawer>}
  </div>
}

function FormPreview({ questions }: { questions: FormQuestion[] }) {
  return <div className="form-preview">{questions.map((question,index) => <div key={question.id}><Eyebrow>{String(index + 1).padStart(2,'0')} · {question.type}</Eyebrow><label>{question.label || 'Pergunta sem título'}{question.required && <b> *</b>}</label>{question.type === 'long' ? <textarea disabled placeholder="Resposta longa" /> : question.type === 'scale' ? <div className="scale-preview">{[0,2,4,6,8,10].map((value) => <span key={value}>{value}</span>)}</div> : ['single','multi','yesno'].includes(question.type) ? <div className="choice-preview">{(question.type === 'yesno' ? ['Sim','Não'] : question.options ?? []).map((option) => <span key={option}>{option}</span>)}</div> : <input disabled placeholder={question.type === 'number' ? 'Resposta numérica' : 'Sua resposta'} />}</div>)}</div>
}
