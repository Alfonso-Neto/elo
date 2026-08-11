import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, Check, Dumbbell, HeartPulse, Info, LoaderCircle,
  RefreshCw, ShieldCheck, Sparkles, X,
} from 'lucide-react'
import { createAssistantService, type AssistantProposal } from '../assistant/assistant-service'
import { applyAssistantProposalToDraft, formatPainReportForAssistant } from '../assistant/workout-proposal'
import { useAuth } from '../auth/auth-context'
import { Button, Eyebrow, PageIntro, SectionTitle, SuccessState } from '../components'
import { listEnrolledStudents, type EnrolledStudent } from '../onboarding/enrollment-service'
import { useEloApp } from '../app-state'
import { createIdempotencyKey, createSignalService, MAX_SIGNAL_PAGE_SIZE, type PainReportLifecycleSummary } from '../signals'
import { getLatestWorkoutVersion, type TrainingScope, type WorkoutVersion } from './training'
import { LivePainReportDrawer } from './LivePainReportDrawer'
import './live.css'

type LoadPhase = 'loading' | 'ready' | 'error'
type AnalysisPhase = 'idle' | 'loading' | 'processing' | 'complete' | 'error'

const urgencyLabels: Record<AssistantProposal['urgency'], string> = {
  routine: 'ACOMPANHAR',
  soon: 'REVISAR EM BREVE',
  urgent: 'PRIORIDADE',
  emergency: 'INTERROMPER E ENCAMINHAR',
}

const operationLabels: Record<AssistantProposal['workout_changes'][number]['operation'], string> = {
  reduce_load_percent: 'Reduzir carga',
  reduce_volume_percent: 'Reduzir volume',
  replace_exercise: 'Trocar exercício',
  remove_exercise: 'Retirar exercício',
  add_rest_seconds: 'Aumentar descanso',
  cap_rpe: 'Limitar RPE',
  pause_session: 'Pausar sessão',
  request_professional_review: 'Solicitar avaliação profissional',
}

function proposalValue(change: AssistantProposal['workout_changes'][number]) {
  if (change.operation === 'replace_exercise') return change.value_text
  if (change.value_number === null) return null
  if (change.operation === 'reduce_load_percent' || change.operation === 'reduce_volume_percent') return `${change.value_number}%`
  if (change.operation === 'add_rest_seconds') return `+${change.value_number}s`
  if (change.operation === 'cap_rpe') return `RPE ${change.value_number}`
  return String(change.value_number)
}

function studentInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function timestampLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'registro recente' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export function LiveTrainerCopilot() {
  const { membership, profile } = useAuth()
  const { navigate, selectedStudentId, setSelectedStudentId, setWorkout, setWorkoutName, setWorkoutDraftStudentId } = useEloApp()
  const [students, setStudents] = useState<EnrolledStudent[]>([])
  const [reports, setReports] = useState<PainReportLifecycleSummary[]>([])
  const [currentWorkout, setCurrentWorkout] = useState<WorkoutVersion | null>(null)
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [loadError, setLoadError] = useState('')
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>('idle')
  const [analysisError, setAnalysisError] = useState('')
  const [proposal, setProposal] = useState<AssistantProposal | null>(null)
  const [proposalId, setProposalId] = useState('')
  const [decision, setDecision] = useState<'accepted' | 'rejected' | null>(null)
  const [deciding, setDeciding] = useState(false)
  const [selectedReport, setSelectedReport] = useState<PainReportLifecycleSummary | null>(null)
  const analysisKey = useRef('')
  const rosterRequestVersion = useRef(0)
  const selectedStudentIdRef = useRef(selectedStudentId)
  selectedStudentIdRef.current = selectedStudentId

  const selectedStudent = students.find((student) => student.userId === selectedStudentId) ?? null
  const studentReports = useMemo(() => reports.filter((report) => report.studentUserId === selectedStudentId), [reports, selectedStudentId])
  const latestReport = studentReports[0] ?? null

  const scope = useMemo<TrainingScope | null>(() => membership && profile?.accountRole === 'trainer' && membership.membershipRole !== 'student' ? {
    workspaceId: membership.workspaceId,
    userId: profile.id,
    role: 'trainer',
  } : null, [membership, profile])
  const scopeIdentity = scope ? `${scope.workspaceId}:${scope.userId}` : ''
  const activeScopeIdentityRef = useRef(scopeIdentity)
  activeScopeIdentityRef.current = scopeIdentity
  const [loadedScopeIdentity, setLoadedScopeIdentity] = useState('')

  const loadRoster = useCallback(async () => {
    const requestVersion = ++rosterRequestVersion.current
    const requestScopeIdentity = scopeIdentity
    setStudents([])
    setReports([])
    setSelectedReport(null)
    setLoadedScopeIdentity('')
    setPhase('loading')
    setLoadError('')
    if (!scope || !requestScopeIdentity) return
    try {
      const [nextStudents, reportPage] = await Promise.all([
        listEnrolledStudents(),
        createSignalService().listTrainerPainReports(scope.workspaceId, { unresolvedOnly: true, limit: MAX_SIGNAL_PAGE_SIZE }),
      ])
      if (requestVersion !== rosterRequestVersion.current || requestScopeIdentity !== activeScopeIdentityRef.current) return
      setStudents(nextStudents)
      setReports(reportPage.items)
      const preferred = selectedStudentIdRef.current
      const nextId = nextStudents.some((student) => student.userId === preferred) ? preferred : nextStudents[0]?.userId ?? ''
      if (nextId !== preferred) setSelectedStudentId(nextId)
      setLoadedScopeIdentity(requestScopeIdentity)
      setPhase('ready')
    } catch (error) {
      if (requestVersion !== rosterRequestVersion.current || requestScopeIdentity !== activeScopeIdentityRef.current) return
      setPhase('error')
      setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os contextos vinculados.')
    }
  }, [scope, scopeIdentity, setSelectedStudentId])

  useEffect(() => {
    void loadRoster()
    return () => { rosterRequestVersion.current += 1 }
  }, [loadRoster])
  useEffect(() => {
    if (!scope || !selectedStudentId || !students.some((student) => student.userId === selectedStudentId)) {
      setCurrentWorkout(null)
      return
    }
    let active = true
    void getLatestWorkoutVersion(scope, selectedStudentId)
      .then((workout) => { if (active) setCurrentWorkout(workout) })
      .catch(() => { if (active) setCurrentWorkout(null) })
    return () => { active = false }
  }, [scope, selectedStudentId, students])
  useEffect(() => {
    setAnalysisPhase('idle')
    setAnalysisError('')
    setProposal(null)
    setProposalId('')
    setDecision(null)
    setSelectedReport(null)
    analysisKey.current = ''
  }, [selectedStudentId, latestReport?.id, currentWorkout?.id])

  const runAnalysis = async () => {
    if (!scope || !selectedStudent || !latestReport || analysisPhase === 'loading') return
    const key = analysisKey.current || createIdempotencyKey('trainer-copilot')
    analysisKey.current = key
    setAnalysisPhase('loading')
    setAnalysisError('')
    try {
      const result = await createAssistantService().requestTrainerCopilot({
        workspaceId: scope.workspaceId,
        studentId: selectedStudent.userId,
        report: formatPainReportForAssistant(latestReport),
        context: {
          ...(currentWorkout ? {
            current_workout: currentWorkout.exercises.slice(0, 20).map((exercise) => ({
              exercise: exercise.name,
              sets: Math.min(20, Math.max(1, Number(exercise.sets) || 1)),
              reps: exercise.reps,
              ...(exercise.load.trim() ? { load: exercise.load } : {}),
            })),
          } : {}),
          constraints: latestReport.redFlags.map((flag) => `Sinal estruturado: ${flag}`).slice(0, 8),
        },
        idempotencyKey: key,
      })
      if (result.state === 'processing') {
        setAnalysisPhase('processing')
        return
      }
      setProposal(result.proposal)
      setProposalId(result.proposalId)
      setAnalysisPhase('complete')
    } catch (error) {
      setAnalysisPhase('error')
      setAnalysisError(error instanceof Error ? error.message : 'O copiloto não está disponível agora.')
    }
  }

  const decide = async (nextDecision: 'accepted' | 'rejected') => {
    if (!proposal || !proposalId || !selectedStudent || deciding) return
    const decisionStudentId = selectedStudent.userId
    setDeciding(true)
    setAnalysisError('')
    try {
      await createAssistantService().decideProposal({
        proposalId,
        decision: nextDecision,
        note: nextDecision === 'accepted' ? 'Proposta aceita como ponto de partida editável; nenhuma publicação automática.' : 'Proposta rejeitada pelo professor após revisão.',
      })
      if (nextDecision === 'accepted' && currentWorkout) {
        setWorkout(applyAssistantProposalToDraft(currentWorkout.exercises, proposal))
        setWorkoutName(`${currentWorkout.title} · revisão`)
        setWorkoutDraftStudentId(decisionStudentId)
      }
      setDecision(nextDecision)
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Não foi possível registrar sua decisão.')
    } finally {
      setDeciding(false)
    }
  }

  if (!scope) return <div className="page enter"><div className="empty-state"><ShieldCheck size={30} /><h3>Copiloto profissional indisponível.</h3><p>Entre com uma conta de professor vinculada para abrir contextos de saúde protegidos.</p></div></div>
  if (phase === 'error') return <div className="page enter"><div className="empty-state"><ShieldCheck size={30} /><h3>O copiloto não abriu o contexto.</h3><p>{loadError}</p><Button variant="secondary" onClick={() => void loadRoster()}>Tentar novamente</Button></div></div>
  if (phase === 'loading' || loadedScopeIdentity !== scopeIdentity) return <div className="page enter"><div className="live-loading"><LoaderCircle className="spin" size={24} /><p>Carregando alunos e sinais...</p></div></div>
  if (!students.length) return <div className="page enter"><PageIntro eyebrow="COPILOTO · REVISÃO HUMANA" title="Primeiro, crie um elo." copy="Convide um aluno para que sinais consentidos possam entrar no fluxo de decisão." /><div className="empty-state"><HeartPulse size={29} /><h3>Nenhum aluno vinculado.</h3><p>O copiloto não trabalha com pessoas ou dados fictícios na conta autenticada.</p><Button onClick={() => navigate('students')}>Convidar aluno <ArrowRight size={16} /></Button></div></div>

  return <div className="page copilot-page live-copilot enter">
    <PageIntro eyebrow={`CONTEXTO DO ALUNO · ${selectedStudent?.displayName.toUpperCase() ?? 'ALUNO'}`} title={<>Você prescreve.<br />Eu organizo os sinais.</>} copy="O copiloto propõe perguntas e mudanças limitadas. Você aceita, rejeita, edita e publica em etapas separadas." action={<label className="live-student-select"><span className="person-avatar priority">{studentInitials(selectedStudent?.displayName ?? 'Aluno')}</span><span><small>CONTEXTO ATIVO</small><select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>{students.map((student) => <option value={student.userId} key={student.userId}>{student.displayName}</option>)}</select></span></label>} />

    <section className="flow-section"><SectionTitle index="01" title="Sinal de origem" copy="Somente dados estruturados do workspace; a IA não recebe identificadores visíveis nem inventa o que falta." action={<button type="button" className="text-link" onClick={() => void loadRoster()}><RefreshCw size={15} /> Atualizar</button>} />
      {latestReport ? <article className={`live-signal-source ${latestReport.intensity >= 8 || latestReport.redFlags.length ? 'danger' : ''}`}><span><HeartPulse size={20} /></span><div><Eyebrow>RELATO DO ALUNO · {timestampLabel(latestReport.createdAt)}</Eyebrow><h3>{latestReport.region} · {latestReport.movement}</h3><p>{latestReport.side} · {latestReport.timing} · intensidade {latestReport.intensity}/10</p></div><div className="live-signal-actions"><b>{latestReport.status === 'acknowledged' ? 'EM ACOMPANHAMENTO' : latestReport.redFlags.length ? `${latestReport.redFlags.length} ALERTA${latestReport.redFlags.length > 1 ? 'S' : ''}` : 'SEM ALERTA MARCADO'}</b><Button variant="ghost" onClick={() => setSelectedReport(latestReport)}>Revisar relato</Button></div></article> : <div className="empty-state compact"><Activity size={25} /><h3>Nenhum relato para analisar.</h3><p>O copiloto só é iniciado quando existe um sinal estruturado e consentido.</p></div>}
    </section>

    <section className="flow-section"><SectionTitle index="02" title="Contexto de prescrição" copy={currentWorkout ? `Versão ${currentWorkout.versionNumber} · ${currentWorkout.exercises.length} exercícios · publicada em ${timestampLabel(currentWorkout.publishedAt)}` : 'Nenhum treino publicado para este aluno.'} />
      {currentWorkout && <div className="live-current-workout">{currentWorkout.exercises.slice(0, 6).map((exercise, index) => <article key={exercise.id}><span>{String(index + 1).padStart(2, '0')}</span><Dumbbell size={16} /><div><strong>{exercise.name}</strong><small>{exercise.sets} × {exercise.reps} · {exercise.load || 'carga livre'}</small></div></article>)}</div>}
      {analysisPhase === 'idle' && <Button disabled={!latestReport} onClick={() => void runAnalysis()}><Sparkles size={16} /> Organizar caminhos com o copiloto</Button>}
      {(analysisPhase === 'loading' || analysisPhase === 'processing') && <div className="live-ai-progress" aria-live="polite"><LoaderCircle className={analysisPhase === 'loading' ? 'spin' : ''} size={21} /><span><strong>{analysisPhase === 'loading' ? 'Analisando dentro dos limites...' : 'A análise ainda está em processamento.'}</strong><small>O sinal original permanece intacto e nenhuma prescrição é alterada.</small></span>{analysisPhase === 'processing' && <Button variant="secondary" onClick={() => void runAnalysis()}>Verificar novamente</Button>}</div>}
      {analysisPhase === 'error' && <div className="live-ai-error" role="status"><Info size={18} /><span><strong>O copiloto não respondeu agora.</strong><small>{analysisError}</small></span><Button variant="secondary" onClick={() => void runAnalysis()}>Tentar novamente</Button></div>}
    </section>

    {proposal && <section className={`flow-section live-proposal urgency-${proposal.urgency}`}><SectionTitle index="03" title="Proposta para o seu julgamento" copy="Raciocínio, incertezas e limites ficam visíveis antes da decisão." action={<span className={`tag ${proposal.urgency === 'urgent' || proposal.urgency === 'emergency' ? 'danger' : 'warning'}`}>{urgencyLabels[proposal.urgency]}</span>} />
      <article className="proposal-summary"><Sparkles size={20} /><div><Eyebrow>RESUMO</Eyebrow><h3>{proposal.summary}</h3></div></article>
      {proposal.red_flags.length > 0 && <div className="proposal-alerts">{proposal.red_flags.map((flag) => <article key={flag.code}><AlertTriangle size={18} /><div><strong>{flag.label}</strong><p>{flag.evidence}</p><small>{flag.recommended_action}</small></div></article>)}</div>}
      <div className="proposal-evidence"><section><Eyebrow>POR QUE ESTE CAMINHO</Eyebrow>{proposal.rationale.map((reason, index) => <p key={`${index}-${reason}`}><span>{index + 1}</span>{reason}</p>)}</section><section><Eyebrow>O QUE AINDA NÃO SABEMOS</Eyebrow>{proposal.uncertainties.length ? proposal.uncertainties.map((uncertainty) => <p key={uncertainty}><span>?</span>{uncertainty}</p>) : <p><span><Check size={11} /></span>Nenhuma incerteza adicional declarada.</p>}</section></div>
      {proposal.questions.length > 0 && <div className="proposal-questions"><Eyebrow>PERGUNTAS ANTES DE PRESCREVER</Eyebrow>{proposal.questions.map((question) => <article key={question.id}><span>?</span><div><strong>{question.question}</strong><small>{question.reason}</small></div></article>)}</div>}
      <div className="proposal-changes"><Eyebrow>MUDANÇAS LIMITADAS · AINDA NÃO APLICADAS</Eyebrow>{proposal.workout_changes.length ? proposal.workout_changes.map((change, index) => <article key={`${change.operation}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{operationLabels[change.operation]}{change.target ? ` · ${change.target}` : ''}</strong><small>{proposalValue(change) ?? 'Sem valor automático'} · {change.guardrail}{change.duration_sessions ? ` · ${change.duration_sessions} sessões` : ''}</small></div></article>) : <p className="mini-empty">A proposta não contém alteração de treino.</p>}</div>
      <div className="proposal-disclaimer"><Info size={17} /><p>{proposal.disclaimer}</p></div>
      {analysisError && <p className="builder-validation" role="alert"><AlertTriangle size={15} /> {analysisError}</p>}
      {!decision ? <footer className="proposal-decision"><div><strong>Seu último olhar</strong><small>Aceitar cria apenas um rascunho editável. Publicar exige uma confirmação posterior.</small></div><Button variant="secondary" disabled={deciding} onClick={() => void decide('rejected')}><X size={16} /> Rejeitar proposta</Button><Button disabled={deciding} onClick={() => void decide('accepted')}><Check size={16} /> Aceitar como rascunho</Button></footer> : <SuccessState title={decision === 'accepted' ? 'Decisão registrada; rascunho preparado.' : 'Proposta rejeitada e registrada.'} copy={decision === 'accepted' ? (currentWorkout ? 'Revise cada parâmetro no editor. Nada foi publicado para o aluno.' : 'A decisão foi auditada. Publique um treino-base antes de aplicar mudanças.') : 'Nenhuma alteração foi aplicada ao treino.'} action={decision === 'accepted' && currentWorkout ? <Button onClick={() => navigate('builder')}>Abrir editor detalhado <ArrowRight size={16} /></Button> : <Button variant="secondary" onClick={() => navigate('dashboard')}>Voltar à visão geral</Button>} />}
    </section>}
    {selectedReport && selectedStudent && <LivePainReportDrawer report={selectedReport} studentName={selectedStudent.displayName} onClose={() => setSelectedReport(null)} onChanged={async () => { await loadRoster(); setSelectedReport(null) }} />}
  </div>
}
