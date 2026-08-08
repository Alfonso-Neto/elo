import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowRight, CalendarDays, CirclePlus, Dumbbell, FileCheck2, HeartPulse,
  LoaderCircle, MessageCircle, ShieldCheck, Sparkles,
} from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { BackButton, Button, Drawer, Eyebrow, Modal, PageIntro, SectionTitle } from '../components'
import { listEnrolledStudents, type EnrolledStudent } from '../onboarding/enrollment-service'
import { usePrototype } from '../prototype-context'
import { createIdempotencyKey, createSignalService, type PainReportSummary } from '../signals'
import {
  createTrainerStudentNote, getLatestWorkoutVersion, listAnamnesisAssignments,
  listAnamnesisSubmissions, listTrainerStudentNotes, listWorkoutCompletions,
  type AnamnesisAssignment, type AnamnesisSubmission, type TrainerStudentNote,
  type TrainingScope, type WorkoutCompletion, type WorkoutVersion,
} from './training'
import './live-training.css'

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
  const { navigate, selectedStudentId, setSelectedStudentId, notify } = usePrototype()
  const [students, setStudents] = useState<EnrolledStudent[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [reports, setReports] = useState<PainReportSummary[]>([])
  const [workout, setWorkout] = useState<WorkoutVersion | null>(null)
  const [completions, setCompletions] = useState<WorkoutCompletion[]>([])
  const [assignments, setAssignments] = useState<AnamnesisAssignment[]>([])
  const [submissions, setSubmissions] = useState<AnamnesisSubmission[]>([])
  const [notes, setNotes] = useState<TrainerStudentNote[]>([])
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteError, setNoteError] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const noteKey = useRef('')
  const scope = useMemo<TrainingScope | null>(() => membership && profile ? { workspaceId: membership.workspaceId, userId: profile.id, role: 'trainer' } : null, [membership, profile])
  const student = students.find((item) => item.userId === selectedStudentId) ?? null

  const loadRoster = useCallback(async () => {
    setPhase('loading'); setError('')
    try {
      const next = await listEnrolledStudents()
      setStudents(next)
      if (!next.some((item) => item.userId === selectedStudentId)) setSelectedStudentId(next[0]?.userId ?? '')
      if (!next.length) setPhase('ready')
    } catch (cause) {
      setPhase('error'); setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os alunos.')
    }
  }, [selectedStudentId, setSelectedStudentId])
  useEffect(() => { void loadRoster() }, [loadRoster])

  const loadStudent = useCallback(async () => {
    if (!scope || !student) return
    setPhase('loading'); setError('')
    try {
      const [reportPage, latestWorkout, completionPage, assignmentPage, submissionPage, notePage] = await Promise.all([
        createSignalService().listWorkspaceReports(scope.workspaceId, { limit: 100 }),
        getLatestWorkoutVersion(scope, student.userId),
        listWorkoutCompletions(scope, student.userId, { limit: 30 }),
        listAnamnesisAssignments(scope, student.userId, { limit: 30 }),
        listAnamnesisSubmissions(scope, student.userId, { limit: 30 }),
        listTrainerStudentNotes(scope, student.userId, { limit: 30 }),
      ])
      setReports(reportPage.items.filter((item) => item.studentUserId === student.userId))
      setWorkout(latestWorkout); setCompletions(completionPage.items); setAssignments(assignmentPage.items); setSubmissions(submissionPage.items); setNotes(notePage.items)
      setPhase('ready')
    } catch (cause) {
      setPhase('error'); setError(cause instanceof Error ? cause.message : 'Não foi possível carregar este acompanhamento.')
    }
  }, [scope, student])
  useEffect(() => { void loadStudent() }, [loadStudent])

  const saveNote = async () => {
    if (!scope || !student || !noteDraft.trim() || savingNote) return
    const key = noteKey.current || createIdempotencyKey('trainer-note')
    noteKey.current = key
    setSavingNote(true); setNoteError('')
    try {
      await createTrainerStudentNote(scope, { studentUserId: student.userId, note: noteDraft, idempotencyKey: key })
      setNoteDraft(''); setNoteOpen(false); noteKey.current = ''
      notify('Observação registrada', 'A nota ficou vinculada ao consentimento vigente e ao histórico profissional.')
      await loadStudent()
    } catch (cause) {
      setNoteError(cause instanceof Error ? cause.message : 'Não foi possível registrar a nota.')
    } finally { setSavingNote(false) }
  }

  if (phase === 'loading') return <div className="page enter"><div className="live-loading"><LoaderCircle className="spin" size={24} /><p>Montando a linha de contexto...</p></div></div>
  if (phase === 'error') return <div className="page enter"><div className="empty-state"><ShieldCheck size={29} /><h3>O acompanhamento não abriu.</h3><p>{error}</p><Button variant="secondary" onClick={() => void (student ? loadStudent() : loadRoster())}>Tentar novamente</Button></div></div>
  if (!student) return <div className="page enter"><BackButton onClick={() => navigate('students')} label="Voltar para alunos" /><div className="empty-state"><ShieldCheck size={29} /><h3>Nenhum aluno vinculado.</h3><p>Crie um convite para começar um acompanhamento real.</p><Button onClick={() => navigate('students')}>Gerenciar vínculos</Button></div></div>

  const submissionIds = new Set(submissions.map((item) => item.assignmentId))
  return <div className="page live-training-screen live-student-detail enter"><BackButton onClick={() => navigate('students')} label="Voltar para alunos" />
    <PageIntro eyebrow="ALUNO VINCULADO · CONTEXTO REAL" title={student.displayName} copy={`Vínculo ativo em ${membership?.workspaceName}. Nenhum dado demonstrativo aparece nesta conta.`} action={<div className="profile-actions"><Button variant="secondary" onClick={() => navigate('messages')}><MessageCircle size={16} /> Conversar</Button><Button onClick={() => navigate('copilot')}><Sparkles size={16} /> Abrir Copiloto</Button></div>} />
    <section className="profile-metrics"><div><small>RELATOS RECENTES</small><strong>{reports.length}</strong><span>consentidos no workspace</span></div><div><small>CONCLUSÕES</small><strong>{completions.length}</strong><span>registros carregados</span></div><div><small>ANAMNESES</small><strong>{submissions.length}/{assignments.length}</strong><span>respondidas / enviadas</span></div><div><small>PLANO ATUAL</small><strong>{workout ? `V${workout.versionNumber}` : '—'}</strong><span>{workout?.title ?? 'sem publicação'}</span></div></section>
    <div className="profile-grid"><section><SectionTitle index="01" title="Linha de sinais" copy="Dados reais, com origem e horário preservados." /><div className="history-list">{reports.map((report) => <article key={report.id}><span className={`history-dot ${report.intensity >= 8 || report.redFlags.length ? 'open' : 'info'}`} /><div><strong>{report.region} · intensidade {report.intensity}/10</strong><p>{report.movement} · {report.timing}{report.redFlags.length ? ` · ${report.redFlags.length} alerta(s)` : ''}</p><small>Relato estruturado · {time(report.createdAt)}</small></div><Button variant="ghost" onClick={() => navigate('copilot')}>Revisar</Button></article>)}{completions.map((completion) => <article key={completion.id}><span className="history-dot info" /><div><strong>Treino concluído · RPE {completion.rpe}/10</strong><p>{completion.mood}{completion.comment ? ` · ${completion.comment}` : ''}</p><small>Feedback do aluno · {time(completion.completedAt)}</small></div><span className="tag blue">Feedback</span></article>)}{notes.map((note) => <article key={note.id}><span className="history-dot info" /><div><strong>Observação profissional privada</strong><p>{note.note}</p><small>Professor · {time(note.createdAt)}</small></div><span className="tag blue">Nota</span></article>)}{!reports.length && !completions.length && !notes.length && <div className="mini-empty">Nenhum sinal ou feedback disponível com o acesso vigente.</div>}</div></section>
      <aside className="profile-side"><SectionTitle index="02" title="Plano e ações" /><div className="current-plan"><Dumbbell size={22} /><Eyebrow>{workout ? `VERSÃO ${workout.versionNumber} · ${time(workout.publishedAt)}` : 'SEM TREINO PUBLICADO'}</Eyebrow><h3>{workout?.title ?? 'Primeira prescrição'}</h3><p>{workout ? `${workout.exercises.length} exercícios. Alterações futuras criam uma nova versão.` : 'Abra o editor para preparar e publicar a primeira versão.'}</p><Button variant="secondary" onClick={() => navigate('builder')}>Abrir editor <ArrowRight size={16} /></Button></div><div className="quick-stack"><button onClick={() => navigate('forms')}><FileCheck2 size={17} /><span><strong>Anamneses</strong><small>{assignments.filter((item) => !submissionIds.has(item.id)).length} pendentes</small></span><ArrowRight size={16} /></button><button onClick={() => navigate('schedule')}><CalendarDays size={17} /><span><strong>Agendar sessão</strong><small>Abrir agenda compartilhada</small></span><ArrowRight size={16} /></button><button onClick={() => setNoteOpen(true)}><CirclePlus size={17} /><span><strong>Adicionar observação</strong><small>Exige consentimento de saúde vigente</small></span><ArrowRight size={16} /></button></div></aside>
    </div>
    <section className="section-block"><SectionTitle index="03" title="Anamneses enviadas" /><div className="assignment-list">{assignments.map((assignment) => <button key={assignment.id} disabled><span className="person-avatar priority">{initials(student.displayName)}</span><span><strong>{assignment.title}</strong><small>{time(assignment.assignedAt)}</small></span><span className={`tag ${submissionIds.has(assignment.id) ? 'success' : 'warning'}`}>{submissionIds.has(assignment.id) ? 'Concluída' : 'Pendente'}</span></button>)}{!assignments.length && <p className="mini-empty">Nenhuma anamnese enviada.</p>}</div></section>
    {noteOpen && <Modal title={`Observação sobre ${student.displayName}`} eyebrow="NOTA PROFISSIONAL · DADO SENSÍVEL" onClose={() => !savingNote && setNoteOpen(false)} size="small"><div className="form-stack"><p className="modal-lead">Registre somente o necessário para o acompanhamento. O servidor exige consentimento vigente e restringe a leitura à equipe autorizada.</p><label><span>Observação</span><textarea autoFocus value={noteDraft} onChange={(event) => { noteKey.current = ''; setNoteError(''); setNoteDraft(event.target.value.slice(0,2000)) }} placeholder="Contexto útil para o próximo atendimento..." /></label>{noteError && <p className="form-error" role="alert">{noteError}</p>}<Button className="wide" disabled={!noteDraft.trim() || savingNote} onClick={() => void saveNote()}>{savingNote ? <LoaderCircle className="spin" size={16} /> : <Activity size={16} />} Registrar no histórico</Button></div></Modal>}
  </div>
}
