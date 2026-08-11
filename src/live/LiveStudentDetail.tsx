import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowRight, CalendarDays, CirclePlus, Dumbbell, FileCheck2,
  LoaderCircle, MessageCircle, Salad, ShieldCheck, Sparkles, Waves,
} from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { BackButton, Button, Eyebrow, Modal, PageIntro, Progress, SectionTitle } from '../components'
import { listEnrolledStudents, type EnrolledStudent } from '../onboarding/enrollment-service'
import { useEloApp } from '../app-state'
import { createIdempotencyKey, createSignalService, MAX_SIGNAL_PAGE_SIZE, type PainReportLifecycleSummary } from '../signals'
import {
  createTrainerStudentNote, getLatestWorkoutVersion, listAnamnesisAssignments,
  listAnamnesisSubmissions, listTrainerStudentNotes, listWorkoutCompletions,
  type AnamnesisAssignment, type AnamnesisSubmission, type TrainerStudentNote,
  type TrainingScope, type WorkoutCompletion, type WorkoutVersion,
} from './training'
import {
  createNutritionService, deriveCompletedMealIds, latestHydrationTotal,
  type TrainerNutritionDashboard,
} from './nutrition'
import './live-training.css'
import './live-nutrition.css'
import { LivePainReportDrawer } from './LivePainReportDrawer'

type Phase = 'loading' | 'ready' | 'error'

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function time(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'registro recente' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export function LiveStudentDetailScreen() {
  const { membership, profile } = useAuth()
  const { navigate, selectedStudentId, setSelectedStudentId, notify } = useEloApp()
  const [students, setStudents] = useState<EnrolledStudent[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [reports, setReports] = useState<PainReportLifecycleSummary[]>([])
  const [workout, setWorkout] = useState<WorkoutVersion | null>(null)
  const [completions, setCompletions] = useState<WorkoutCompletion[]>([])
  const [assignments, setAssignments] = useState<AnamnesisAssignment[]>([])
  const [submissions, setSubmissions] = useState<AnamnesisSubmission[]>([])
  const [notes, setNotes] = useState<TrainerStudentNote[]>([])
  const [nutrition, setNutrition] = useState<TrainerNutritionDashboard | null>(null)
  const [nutritionUnavailable, setNutritionUnavailable] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteError, setNoteError] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [selectedReport, setSelectedReport] = useState<PainReportLifecycleSummary | null>(null)
  const [loadedTargetIdentity, setLoadedTargetIdentity] = useState('')
  const noteKey = useRef('')
  const selectedStudentRef = useRef(selectedStudentId)
  const rosterRequestVersion = useRef(0)
  const detailRequestVersion = useRef(0)
  const noteRequestVersion = useRef(0)
  selectedStudentRef.current = selectedStudentId
  const scope = useMemo<TrainingScope | null>(() => (
    membership && profile?.accountRole === 'trainer' && membership.membershipRole !== 'student'
      ? { workspaceId: membership.workspaceId, userId: profile.id, role: 'trainer' }
      : null
  ), [membership?.membershipRole, membership?.workspaceId, profile?.accountRole, profile?.id])
  const student = students.find((item) => item.userId === selectedStudentId) ?? null
  const scopeIdentity = scope ? `${scope.workspaceId}:${scope.userId}` : ''
  const targetIdentity = scope && student ? `${scope.workspaceId}:${scope.userId}:${student.userId}` : ''
  const activeScopeIdentityRef = useRef(scopeIdentity)
  const activeTargetIdentityRef = useRef(targetIdentity)
  activeScopeIdentityRef.current = scopeIdentity
  activeTargetIdentityRef.current = targetIdentity

  const clearStudentContext = useCallback(() => {
    setReports([])
    setWorkout(null)
    setCompletions([])
    setAssignments([])
    setSubmissions([])
    setNotes([])
    setNutrition(null)
    setNutritionUnavailable(false)
    setSelectedReport(null)
    setLoadedTargetIdentity('')
  }, [])

  const loadRoster = useCallback(async () => {
    const requestVersion = ++rosterRequestVersion.current
    const requestScopeIdentity = scope ? `${scope.workspaceId}:${scope.userId}` : ''
    detailRequestVersion.current += 1
    setStudents([])
    clearStudentContext()
    setPhase('loading')
    setError('')
    if (!scope) return
    try {
      const next = await listEnrolledStudents()
      if (requestVersion !== rosterRequestVersion.current || requestScopeIdentity !== activeScopeIdentityRef.current) return
      const preferred = selectedStudentRef.current
      const resolved = next.some((item) => item.userId === preferred) ? preferred : next[0]?.userId ?? ''
      setStudents(next)
      if (resolved !== preferred) setSelectedStudentId(resolved)
      if (!next.length) setPhase('ready')
    } catch (cause) {
      if (requestVersion !== rosterRequestVersion.current || requestScopeIdentity !== activeScopeIdentityRef.current) return
      setPhase('error')
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os alunos.')
    }
  }, [clearStudentContext, scope, setSelectedStudentId])
  useEffect(() => {
    void loadRoster()
    return () => { rosterRequestVersion.current += 1 }
  }, [loadRoster])

  const loadStudent = useCallback(async () => {
    const requestVersion = ++detailRequestVersion.current
    clearStudentContext()
    setError('')
    if (!scope || !student) return
    const scopeSnapshot = { ...scope }
    const studentUserId = student.userId
    const requestTargetIdentity = `${scopeSnapshot.workspaceId}:${scopeSnapshot.userId}:${studentUserId}`
    setPhase('loading')
    try {
      const [core, nutritionResult] = await Promise.all([
        Promise.all([
          createSignalService().listTrainerPainReports(scopeSnapshot.workspaceId, {
            studentUserId,
            unresolvedOnly: false,
            limit: MAX_SIGNAL_PAGE_SIZE,
          }),
          getLatestWorkoutVersion(scopeSnapshot, studentUserId),
          listWorkoutCompletions(scopeSnapshot, studentUserId, { limit: 30 }),
          listAnamnesisAssignments(scopeSnapshot, studentUserId, { limit: 30 }),
          listAnamnesisSubmissions(scopeSnapshot, studentUserId, { limit: 30 }),
          listTrainerStudentNotes(scopeSnapshot, studentUserId, { limit: 30 }),
        ]),
        createNutritionService().loadTrainerStudentDashboard(studentUserId)
          .then((value) => ({ value, unavailable: false }))
          .catch(() => ({ value: null, unavailable: true })),
      ])
      if (requestVersion !== detailRequestVersion.current || requestTargetIdentity !== activeTargetIdentityRef.current) return
      const [reportPage, latestWorkout, completionPage, assignmentPage, submissionPage, notePage] = core
      setReports(reportPage.items)
      setWorkout(latestWorkout); setCompletions(completionPage.items); setAssignments(assignmentPage.items); setSubmissions(submissionPage.items); setNotes(notePage.items)
      setNutrition(nutritionResult.value); setNutritionUnavailable(nutritionResult.unavailable)
      setLoadedTargetIdentity(requestTargetIdentity)
      setPhase('ready')
    } catch (cause) {
      if (requestVersion !== detailRequestVersion.current || requestTargetIdentity !== activeTargetIdentityRef.current) return
      setPhase('error')
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar este acompanhamento.')
    }
  }, [clearStudentContext, scope, student])
  useEffect(() => {
    void loadStudent()
    return () => { detailRequestVersion.current += 1 }
  }, [loadStudent])

  useEffect(() => {
    noteRequestVersion.current += 1
    noteKey.current = ''
    setNoteOpen(false)
    setNoteDraft('')
    setNoteError('')
    setSavingNote(false)
    return () => { noteRequestVersion.current += 1 }
  }, [targetIdentity])

  const saveNote = async () => {
    if (!scope || !student || !noteDraft.trim() || savingNote) return
    const requestVersion = ++noteRequestVersion.current
    const scopeSnapshot = { ...scope }
    const studentUserId = student.userId
    const studentName = student.displayName
    const draftSnapshot = noteDraft
    const requestTargetIdentity = `${scopeSnapshot.workspaceId}:${scopeSnapshot.userId}:${studentUserId}`
    const key = noteKey.current || createIdempotencyKey('trainer-note')
    noteKey.current = key
    setSavingNote(true); setNoteError('')
    try {
      await createTrainerStudentNote(scopeSnapshot, { studentUserId, note: draftSnapshot, idempotencyKey: key })
      if (requestVersion !== noteRequestVersion.current || requestTargetIdentity !== activeTargetIdentityRef.current) return
      setNoteDraft(''); setNoteOpen(false); noteKey.current = ''
      notify('Observação registrada', `A nota de ${studentName} ficou vinculada ao consentimento vigente e ao histórico profissional.`)
      await loadStudent()
    } catch (cause) {
      if (requestVersion !== noteRequestVersion.current || requestTargetIdentity !== activeTargetIdentityRef.current) return
      setNoteError(cause instanceof Error ? cause.message : 'Não foi possível registrar a nota.')
    } finally {
      if (requestVersion === noteRequestVersion.current && requestTargetIdentity === activeTargetIdentityRef.current) setSavingNote(false)
    }
  }

  if (!scope) return <div className="page enter"><div className="empty-state"><ShieldCheck size={29} /><h3>Acesso profissional indisponível.</h3><p>Entre novamente com uma conta de professor vinculada para abrir este acompanhamento.</p></div></div>
  if (phase === 'error') return <div className="page enter"><div className="empty-state"><ShieldCheck size={29} /><h3>O acompanhamento não abriu.</h3><p>{error}</p><Button variant="secondary" onClick={() => void (student ? loadStudent() : loadRoster())}>Tentar novamente</Button></div></div>
  if (phase === 'loading' || (student && loadedTargetIdentity !== targetIdentity)) return <div className="page enter"><div className="live-loading"><LoaderCircle className="spin" size={24} /><p>Montando a linha de contexto...</p></div></div>
  if (!student) return <div className="page enter"><BackButton onClick={() => navigate('students')} label="Voltar para alunos" /><div className="empty-state"><ShieldCheck size={29} /><h3>Nenhum aluno vinculado.</h3><p>Crie um convite para começar o acompanhamento.</p><Button onClick={() => navigate('students')}>Gerenciar vínculos</Button></div></div>

  const submissionIds = new Set(submissions.map((item) => item.assignmentId))
  const completedNutritionMeals = deriveCompletedMealIds(nutrition?.mealEvents ?? [])
  const hydrationMl = latestHydrationTotal(nutrition?.hydrationEvents ?? [])
  return <div className="page live-training-screen live-student-detail enter"><BackButton onClick={() => navigate('students')} label="Voltar para alunos" />
    <PageIntro eyebrow="ALUNO VINCULADO · CONTEXTO" title={student.displayName} copy={`Vínculo ativo em ${membership?.workspaceName}. Os dados exibidos vêm somente dos registros autorizados deste acompanhamento.`} action={<div className="profile-actions"><Button variant="secondary" onClick={() => navigate('messages')}><MessageCircle size={16} /> Conversar</Button><Button onClick={() => navigate('copilot')}><Sparkles size={16} /> Abrir Copiloto</Button></div>} />
    <section className="profile-metrics"><div><small>RELATOS RECENTES</small><strong>{reports.length}</strong><span>consentidos no workspace</span></div><div><small>CONCLUSÕES</small><strong>{completions.length}</strong><span>registros carregados</span></div><div><small>ANAMNESES</small><strong>{submissions.length}/{assignments.length}</strong><span>respondidas / enviadas</span></div><div><small>PLANO ATUAL</small><strong>{workout ? `V${workout.versionNumber}` : '—'}</strong><span>{workout?.title ?? 'sem publicação'}</span></div></section>
    <div className="profile-grid"><section><SectionTitle index="01" title="Linha de sinais" copy="Dados com origem, estado e horário preservados." /><div className="history-list">{reports.map((report) => <article key={report.id}><span className={`history-dot ${report.status === 'resolved' ? 'info' : report.intensity >= 8 || report.redFlags.length ? 'open' : 'info'}`} /><div><strong>{report.region} · intensidade {report.intensity}/10</strong><p>{report.movement} · {report.timing}{report.redFlags.length ? ` · ${report.redFlags.length} alerta(s)` : ''}</p><small>Relato estruturado · {time(report.createdAt)}</small></div><span className={`tag ${report.status === 'resolved' ? 'success' : report.status === 'acknowledged' ? 'blue' : 'warning'}`}>{report.status === 'resolved' ? 'Resolvido' : report.status === 'acknowledged' ? 'Em acompanhamento' : 'Aberto'}</span><Button variant="ghost" onClick={() => setSelectedReport(report)}>Abrir</Button></article>)}{completions.map((completion) => <article key={completion.id}><span className="history-dot info" /><div><strong>Treino concluído · RPE {completion.rpe}/10</strong><p>{completion.mood}{completion.comment ? ` · ${completion.comment}` : ''}</p><small>Feedback do aluno · {time(completion.completedAt)}</small></div><span className="tag blue">Feedback</span></article>)}{notes.map((note) => <article key={note.id}><span className="history-dot info" /><div><strong>Observação profissional privada</strong><p>{note.note}</p><small>Professor · {time(note.createdAt)}</small></div><span className="tag blue">Nota</span></article>)}{!reports.length && !completions.length && !notes.length && <div className="mini-empty">Nenhum sinal ou feedback disponível com o acesso vigente.</div>}</div></section>
      <aside className="profile-side"><SectionTitle index="02" title="Plano e ações" /><div className="current-plan"><Dumbbell size={22} /><Eyebrow>{workout ? `VERSÃO ${workout.versionNumber} · ${time(workout.publishedAt)}` : 'SEM TREINO PUBLICADO'}</Eyebrow><h3>{workout?.title ?? 'Primeira prescrição'}</h3><p>{workout ? `${workout.exercises.length} exercícios. Alterações futuras criam uma nova versão.` : 'Abra o editor para preparar e publicar a primeira versão.'}</p><Button variant="secondary" onClick={() => navigate('builder')}>Abrir editor <ArrowRight size={16} /></Button></div>
        <section className="trainer-nutrition-card" aria-label="Plano nutricional em modo leitura"><header><span><Salad size={18} /></span><div><Eyebrow>NUTRIÇÃO · SOMENTE LEITURA</Eyebrow><strong>{nutritionUnavailable ? 'Consulta indisponível' : nutrition?.plan ? `Versão ${nutrition.plan.versionNumber}` : 'Sem plano disponível'}</strong></div></header>{nutritionUnavailable ? <p>Não foi possível verificar o acesso nutricional agora. Nenhum dado foi presumido.</p> : nutrition?.plan ? <><h3>{nutrition.plan.title}</h3><p>{nutrition.plan.nutritionistName} · {nutrition.plan.nutritionistCrn}</p><div className="trainer-nutrition-stats"><span><strong>{completedNutritionMeals.size}/{nutrition.plan.meals.length}</strong><small>refeições hoje</small></span><span><Waves size={15} /><strong>{hydrationMl} ml</strong><small>água registrada</small></span></div><Progress value={(completedNutritionMeals.size / nutrition.plan.meals.length) * 100} label="Refeições registradas hoje" /><small className="trainer-nutrition-boundary">Visível apenas com consentimento atual. O professor não prescreve nem altera este plano.</small></> : <p>Nenhum plano foi liberado pelas regras de consentimento e vínculo atuais. Isso também pode significar que a integração parceira ainda não enviou uma versão.</p>}</section>
        <div className="quick-stack"><button type="button" onClick={() => navigate('forms')}><FileCheck2 size={17} /><span><strong>Anamneses</strong><small>{assignments.filter((item) => !submissionIds.has(item.id)).length} pendentes</small></span><ArrowRight size={16} /></button><button type="button" onClick={() => navigate('schedule')}><CalendarDays size={17} /><span><strong>Agendar sessão</strong><small>Abrir agenda compartilhada</small></span><ArrowRight size={16} /></button><button type="button" onClick={() => setNoteOpen(true)}><CirclePlus size={17} /><span><strong>Adicionar observação</strong><small>Exige consentimento de saúde vigente</small></span><ArrowRight size={16} /></button></div></aside>
    </div>
    <section className="section-block"><SectionTitle index="03" title="Anamneses enviadas" /><div className="assignment-list">{assignments.map((assignment) => <button type="button" key={assignment.id} disabled><span className="person-avatar priority">{initials(student.displayName)}</span><span><strong>{assignment.title}</strong><small>{time(assignment.assignedAt)}</small></span><span className={`tag ${submissionIds.has(assignment.id) ? 'success' : 'warning'}`}>{submissionIds.has(assignment.id) ? 'Concluída' : 'Pendente'}</span></button>)}{!assignments.length && <p className="mini-empty">Nenhuma anamnese enviada.</p>}</div></section>
    {selectedReport && <LivePainReportDrawer report={selectedReport} studentName={student.displayName} onClose={() => setSelectedReport(null)} onChanged={async () => { await loadStudent(); setSelectedReport(null) }} onOpenCopilot={() => navigate('copilot')} />}
    {noteOpen && <Modal title={`Observação sobre ${student.displayName}`} eyebrow="NOTA PROFISSIONAL · DADO SENSÍVEL" onClose={() => !savingNote && setNoteOpen(false)} size="small"><div className="form-stack"><p className="modal-lead">Registre somente o necessário para o acompanhamento. O servidor exige consentimento vigente e restringe a leitura à equipe autorizada.</p><label><span>Observação</span><textarea autoFocus disabled={savingNote} value={noteDraft} onChange={(event) => { if (savingNote) return; noteKey.current = ''; setNoteError(''); setNoteDraft(event.target.value.slice(0,2000)) }} placeholder="Contexto útil para o próximo atendimento..." /></label>{noteError && <p className="form-error" role="alert">{noteError}</p>}<Button className="wide" disabled={!noteDraft.trim() || savingNote} onClick={() => void saveNote()}>{savingNote ? <LoaderCircle className="spin" size={16} /> : <Activity size={16} />} Registrar no histórico</Button></div></Modal>}
  </div>
}
