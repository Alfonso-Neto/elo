import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, HeartPulse, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { Button, Eyebrow, SectionTitle } from '../components'
import { useAuth } from '../auth/auth-context'
import { listEnrolledStudents, type EnrolledStudent } from '../onboarding/enrollment-service'
import { createSignalService, type PainReportLifecycleSummary } from '../signals'
import { useEloApp } from '../app-state'
import { LivePainReportDrawer } from './LivePainReportDrawer'
import './live.css'

export type LiveSignalQueueItem = {
  studentId: string
  studentName: string
  count: number
  latest: PainReportLifecycleSummary
  critical: boolean
}

export function buildLiveSignalQueue(students: EnrolledStudent[], reports: PainReportLifecycleSummary[]): LiveSignalQueueItem[] {
  const names = new Map(students.map((student) => [student.userId, student.displayName]))
  const grouped = new Map<string, LiveSignalQueueItem>()
  for (const report of reports) {
    const existing = grouped.get(report.studentUserId)
    const critical = report.intensity >= 8 || report.redFlags.length > 0
    if (existing) {
      existing.count += 1
      existing.critical ||= critical
      continue
    }
    grouped.set(report.studentUserId, {
      studentId: report.studentUserId,
      studentName: names.get(report.studentUserId) ?? 'Aluno vinculado',
      count: 1,
      latest: report,
      critical,
    })
  }
  return [...grouped.values()].sort((a, b) => Number(b.critical) - Number(a.critical) || Date.parse(b.latest.createdAt) - Date.parse(a.latest.createdAt))
}

function firstName(value: string | undefined, fallback: string) {
  return value?.trim().split(/\s+/)[0] || fallback
}

function dateLabel(date: Date) {
  const value = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function timeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'registro recente'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

type LoadPhase = 'loading' | 'ready' | 'error'

export function LiveTrainerDashboard() {
  const { profile, membership } = useAuth()
  const { navigate, setSelectedStudentId } = useEloApp()
  const [students, setStudents] = useState<EnrolledStudent[]>([])
  const [reports, setReports] = useState<PainReportLifecycleSummary[]>([])
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [loadedScopeIdentity, setLoadedScopeIdentity] = useState('')
  const [error, setError] = useState('')
  const [selectedReport, setSelectedReport] = useState<PainReportLifecycleSummary | null>(null)
  const scope = membership && profile?.accountRole === 'trainer' && membership.membershipRole !== 'student'
    ? { workspaceId: membership.workspaceId, userId: profile.id }
    : null
  const scopeIdentity = scope ? `${scope.workspaceId}:${scope.userId}` : ''
  const activeScopeIdentityRef = useRef(scopeIdentity)
  const loadRequestVersion = useRef(0)
  activeScopeIdentityRef.current = scopeIdentity

  const load = useCallback(async () => {
    const requestVersion = ++loadRequestVersion.current
    const requestScopeIdentity = scopeIdentity
    setStudents([])
    setReports([])
    setSelectedReport(null)
    setLoadedScopeIdentity('')
    setPhase('loading')
    setError('')
    if (!scope || !requestScopeIdentity) return
    try {
      const [nextStudents, reportPage] = await Promise.all([
        listEnrolledStudents(),
        createSignalService().listTrainerPainReports(scope.workspaceId, { unresolvedOnly: true, limit: 40 }),
      ])
      if (requestVersion !== loadRequestVersion.current || requestScopeIdentity !== activeScopeIdentityRef.current) return
      setStudents(nextStudents)
      setReports(reportPage.items)
      setLoadedScopeIdentity(requestScopeIdentity)
      setPhase('ready')
    } catch (cause) {
      if (requestVersion !== loadRequestVersion.current || requestScopeIdentity !== activeScopeIdentityRef.current) return
      setPhase('error')
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o contexto deste espaço.')
    }
  }, [scopeIdentity])

  useEffect(() => {
    void load()
    return () => { loadRequestVersion.current += 1 }
  }, [load])
  const queue = useMemo(() => buildLiveSignalQueue(students, reports), [reports, students])
  const criticalCount = queue.filter((item) => item.critical).length
  const openStudent = (studentId: string) => {
    setSelectedStudentId(studentId)
    navigate('copilot')
  }

  if (!scope) return <div className="page enter"><div className="empty-state"><ShieldCheck size={29} /><h3>Visão profissional indisponível.</h3><p>Entre com uma conta de professor vinculada para abrir os sinais deste espaço.</p></div></div>
  if (phase === 'error') return <div className="page enter"><div className="empty-state compact"><ShieldCheck size={27} /><h3>O contexto não abriu agora</h3><p>{error}</p><Button variant="secondary" onClick={() => void load()}>Tentar novamente</Button></div></div>
  if (phase === 'loading' || loadedScopeIdentity !== scopeIdentity) return <div className="page enter"><div className="live-loading"><LoaderCircle className="spin" size={23} /><p>Organizando os sinais deste espaço...</p></div></div>

  return <div className="page enter live-dashboard">
    <section className="hero-grid trainer-hero">
      <div className="hero-copy"><Eyebrow accent>{dateLabel(new Date()).toUpperCase()}</Eyebrow><h2>Bom dia, {firstName(profile?.displayName, 'professor')}.<br /><em>{queue.length} {queue.length === 1 ? 'contexto' : 'contextos'}</em> para o seu olhar.</h2><p>Sinais atuais dos alunos vinculados a {membership?.workspaceName}, organizados para revisão profissional.</p></div>
      <div className="signal-orbit" aria-hidden="true"><span>{String(queue.length).padStart(2, '0')}</span><small>SINAIS<br />RECENTES</small><i className="orbit-dot" /></div>
    </section>

    <section className="section-block" aria-live="polite">
      <SectionTitle index="01" title="Precisam de você" copy="Alertas estruturados primeiro; depois intensidade e recência." action={<button type="button" className="text-link" onClick={() => void load()}><RefreshCw size={15} /> Atualizar</button>} />
      {queue.length === 0 && <div className="empty-state"><HeartPulse size={29} /><h3>Nenhum relato de dor recebido.</h3><p>Quando um aluno vinculado concluir o relato com consentimento, o sinal aparecerá aqui.</p><Button variant="secondary" onClick={() => navigate('students')}><Users size={16} /> Ver alunos vinculados</Button></div>}
      {queue.length > 0 && <div className="attention-list">{queue.map((item, index) => <button type="button" className="attention-row" key={item.studentId} onClick={() => setSelectedReport(item.latest)}>
        <span className={`status-line ${item.critical ? 'danger' : 'warning'}`} /><span className={`signal-avatar ${item.critical ? 'danger' : 'warning'}`}><HeartPulse size={17} /></span><span className="person"><strong>{item.studentName}</strong><small>{item.latest.region} · {item.latest.movement} · intensidade {item.latest.intensity}/10 · {timeLabel(item.latest.createdAt)}</small></span><span className={`tag ${item.critical ? 'danger' : item.latest.status === 'acknowledged' ? 'success' : 'warning'}`}>{item.critical ? 'Alerta' : item.latest.status === 'acknowledged' ? 'Em acompanhamento' : `${item.count} ${item.count === 1 ? 'relato' : 'relatos'}`}</span><ArrowRight size={18} /><span className="row-number">{String(index + 1).padStart(2, '0')}</span>
      </button>)}</div>}
    </section>

    <section className="lower-grid live-lower-grid">
      <article className="surface-card live-operation-card"><SectionTitle index="02" title="Operação do dia" /><div><span><Users size={18} /><strong>{students.length}</strong><small>alunos ativos</small></span><span><HeartPulse size={18} /><strong>{reports.length}</strong><small>relatos em aberto</small></span><span><ShieldCheck size={18} /><strong>{criticalCount}</strong><small>com alerta</small></span></div><Button variant="secondary" onClick={() => navigate('students')}>Gerenciar vínculos <ArrowRight size={15} /></Button></article>
      <button type="button" className="copilot-card" onClick={() => queue[0] ? openStudent(queue[0].studentId) : navigate('students')}><span className="copilot-icon"><Sparkles size={23} /></span><Eyebrow accent>COPILOTO · REVISÃO HUMANA</Eyebrow><h3>{queue[0] ? `Abrir o contexto de ${queue[0].studentName}.` : 'Pronto para o primeiro contexto.'}</h3><p>{queue[0] ? 'O copiloto propõe caminhos; você avalia, ajusta e confirma. Nada é publicado sozinho.' : 'Convide um aluno para começar o loop de dados com vínculo seguro.'}</p><span className="card-action">{queue[0] ? 'Revisar sinal' : 'Convidar aluno'} <ArrowRight size={16} /></span><span className="card-grid" /></button>
    </section>
    {selectedReport && <LivePainReportDrawer report={selectedReport} studentName={students.find((student) => student.userId === selectedReport.studentUserId)?.displayName ?? 'Aluno vinculado'} onClose={() => setSelectedReport(null)} onChanged={async () => { await load(); setSelectedReport(null) }} onOpenCopilot={() => openStudent(selectedReport.studentUserId)} />}
  </div>
}
