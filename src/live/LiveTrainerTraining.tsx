import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, ArrowDown, ArrowRight, ArrowUp, Check, ChevronDown, Dumbbell, Eye,
  FileCheck2, FilePlus2, GripVertical, LoaderCircle, Plus, Search, Send, ShieldCheck,
  Sparkles, Trash2, X,
} from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { createAssistantService, type AssistantProposal } from '../assistant/assistant-service'
import { BackButton, Button, Drawer, Eyebrow, MovementDemo, PageIntro, SectionTitle, SuccessState } from '../components'
import { exerciseLibrary, formTemplateQuestions, formTemplates, generalForm } from '../data'
import { listEnrolledStudents, type EnrolledStudent } from '../onboarding/enrollment-service'
import { usePrototype } from '../prototype-context'
import { createIdempotencyKey } from '../signals'
import type { Exercise, FormQuestion, QuestionType } from '../types'
import {
  assignAnamnesis, getLatestWorkoutVersion, listAnamnesisAssignments, listAnamnesisSubmissions,
  publishWorkoutVersion, type AnamnesisAssignment, type AnamnesisSubmission, type TrainingScope,
} from './training'
import './live-training.css'

type LoadPhase = 'loading' | 'ready' | 'error'

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function dateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'registro recente' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function useTrainerTarget() {
  const { membership, profile } = useAuth()
  const { selectedStudentId, setSelectedStudentId } = usePrototype()
  const [students, setStudents] = useState<EnrolledStudent[]>([])
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [error, setError] = useState('')
  const scope = useMemo<TrainingScope | null>(() => membership && profile ? { workspaceId: membership.workspaceId, userId: profile.id, role: 'trainer' } : null, [membership, profile])

  const load = useCallback(async () => {
    setPhase('loading')
    setError('')
    try {
      const next = await listEnrolledStudents()
      setStudents(next)
      if (!next.some((student) => student.userId === selectedStudentId)) setSelectedStudentId(next[0]?.userId ?? '')
      setPhase('ready')
    } catch (cause) {
      setPhase('error')
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os alunos vinculados.')
    }
  }, [selectedStudentId, setSelectedStudentId])
  useEffect(() => { void load() }, [load])
  return { students, student: students.find((item) => item.userId === selectedStudentId) ?? null, selectedStudentId, setSelectedStudentId, scope, phase, error, reload: load }
}

function TargetState({ phase, error, onRetry }: { phase: LoadPhase; error: string; onRetry: () => void }) {
  if (phase === 'loading') return <div className="live-loading"><LoaderCircle className="spin" size={23} /><p>Carregando o contexto real...</p></div>
  if (phase === 'error') return <div className="empty-state"><ShieldCheck size={29} /><h3>O contexto não abriu agora.</h3><p>{error}</p><Button variant="secondary" onClick={onRetry}>Tentar novamente</Button></div>
  return <div className="empty-state"><FileCheck2 size={29} /><h3>Nenhum aluno vinculado.</h3><p>Convide um aluno antes de prescrever ou enviar uma anamnese.</p></div>
}

function TargetPicker({ students, value, onChange, label }: { students: EnrolledStudent[]; value: string; onChange: (value: string) => void; label: string }) {
  const student = students.find((item) => item.userId === value)
  return <label className="training-target-picker"><span className="person-avatar priority">{initials(student?.displayName ?? 'Aluno')}</span><span><small>{label}</small><select value={value} onChange={(event) => onChange(event.target.value)}>{students.map((item) => <option value={item.userId} key={item.userId}>{item.displayName}</option>)}</select></span></label>
}

export function LiveWorkoutBuilderScreen() {
  const { navigate, workout: stagedWorkout, workoutName: stagedName, workoutDraftStudentId, setWorkoutDraftStudentId, notify } = usePrototype()
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
  const [reloadToken, setReloadToken] = useState(0)
  const publishKey = useRef('')

  useEffect(() => {
    if (!target.scope || !target.selectedStudentId || !target.student) return
    let active = true
    setPhase('loading')
    setError('')
    setPublished(false)
    publishKey.current = ''
    if (workoutDraftStudentId === target.selectedStudentId && stagedWorkout.length) {
      setDraft(stagedWorkout.map((item) => ({ ...item })))
      setTitle(stagedName)
      setExpanded(stagedWorkout[0]?.id ?? '')
      setWorkoutDraftStudentId('')
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
  }, [stagedName, stagedWorkout, target.scope, target.selectedStudentId, target.student, workoutDraftStudentId, setWorkoutDraftStudentId, reloadToken])

  const changed = () => { publishKey.current = ''; setPublished(false); setError('') }
  const updateExercise = (id: string, key: keyof Exercise, value: string) => { changed(); setDraft((items) => items.map((item) => item.id === id ? { ...item, [key]: value } : item)) }
  const move = (index: number, direction: number) => { changed(); setDraft((items) => { const next = [...items]; const destination = index + direction; if (destination < 0 || destination >= next.length) return items; [next[index], next[destination]] = [next[destination], next[index]]; return next }) }
  const addExercise = (exercise: Exercise) => {
    if (draft.some((item) => item.id === exercise.id)) { notify('Exercício já incluído', 'Edite os parâmetros diretamente na prescrição.'); return }
    changed(); setDraft((items) => [...items, { ...exercise }]); setExpanded(exercise.id); setLibraryOpen(false)
  }
  const canPublish = Boolean(title.trim()) && draft.length > 0 && draft.every((exercise) => exercise.name.trim() && exercise.sets.trim() && exercise.reps.trim())
  const publish = async () => {
    if (!target.scope || !target.student || !canPublish || publishing) return
    const key = publishKey.current || createIdempotencyKey('publish-workout')
    publishKey.current = key
    setPublishing(true)
    setError('')
    try {
      await publishWorkoutVersion(target.scope, { studentUserId: target.student.userId, title, exercises: draft, idempotencyKey: key })
      setPublished(true)
      notify('Treino publicado', `${target.student.displayName} recebeu uma nova versão imutável.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível publicar o treino agora.')
    } finally {
      setPublishing(false)
    }
  }

  if (target.phase !== 'ready' || !target.student || !target.scope) return <div className="page enter"><TargetState phase={target.phase} error={target.error} onRetry={() => void target.reload()} /></div>
  if (phase === 'loading') return <div className="page enter"><div className="live-loading"><LoaderCircle className="spin" size={23} /><p>Carregando a última versão publicada...</p></div></div>
  if (phase === 'error') return <div className="page enter"><TargetState phase="error" error={error} onRetry={() => setReloadToken((value) => value + 1)} /></div>

  return <div className="page builder-page live-training-screen enter"><BackButton onClick={() => navigate('copilot')} label="Voltar ao Copiloto" />
    <PageIntro eyebrow={`CONSTRUTOR · ${target.student.displayName.toUpperCase()}`} title="Treino em suas mãos." copy="A publicação cria uma versão imutável. Qualquer atualização futura vira uma nova versão auditável." action={<div className="builder-actions"><Button variant="secondary" disabled={!draft.length} onClick={() => setPreview(draft[0])}><Eye size={16} /> Pré-visualizar</Button><Button disabled={!canPublish || publishing} onClick={() => void publish()}>{publishing ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} {published ? 'Publicar nova versão' : 'Publicar treino'}</Button></div>} />
    <div className="live-target-row"><TargetPicker students={target.students} value={target.selectedStudentId} onChange={target.setSelectedStudentId} label="PRESCREVENDO PARA" /><span><strong>{draft.length}</strong><small>EXERCÍCIOS NO RASCUNHO</small></span></div>
    <section className="builder-toolbar"><label><span>NOME DO TREINO</span><input value={title} onChange={(event) => { changed(); setTitle(event.target.value.slice(0, 80)) }} /></label><div><span className="tag blue">RASCUNHO EM MEMÓRIA</span><small>Nada é salvo até você publicar.</small></div></section>
    <div className="exercise-builder-list">{draft.map((exercise, index) => <article className={expanded === exercise.id ? 'builder-exercise open' : 'builder-exercise'} key={exercise.id}><button className="builder-exercise-head" onClick={() => setExpanded(expanded === exercise.id ? '' : exercise.id)} aria-expanded={expanded === exercise.id}><GripVertical size={17} /><span className="exercise-order">{String(index + 1).padStart(2, '0')}</span><span className="exercise-glyph"><Dumbbell size={18} /></span><span><strong>{exercise.name}</strong><small>{exercise.muscle}</small></span>{exercise.suggested && <span className="tag success">PROPOSTA REVISADA</span>}<ChevronDown size={18} /></button>
      {expanded === exercise.id && <div className="builder-fields enter"><div className="field-grid">{([['sets','Séries'],['reps','Repetições'],['load','Carga'],['rest','Descanso'],['tempo','Cadência'],['rir','RIR']] as [keyof Exercise,string][]).map(([key,label]) => <label key={key}><span>{label}</span><input value={String(exercise[key] ?? '')} onChange={(event) => updateExercise(exercise.id, key, event.target.value.slice(0, 40))} /></label>)}</div><label className="note-field"><span>Observação visível para o aluno</span><textarea value={exercise.note} onChange={(event) => updateExercise(exercise.id, 'note', event.target.value.slice(0, 220))} /></label><div className="exercise-actions"><Button variant="ghost" onClick={() => setPreview(exercise)}><Eye size={15} /> Ver como o aluno vê</Button><span /><button onClick={() => move(index,-1)} disabled={index === 0} aria-label="Mover para cima"><ArrowUp size={16} /></button><button onClick={() => move(index,1)} disabled={index === draft.length - 1} aria-label="Mover para baixo"><ArrowDown size={16} /></button><button className="danger-action" onClick={() => { changed(); setDraft((items) => items.filter((item) => item.id !== exercise.id)) }} aria-label={`Remover ${exercise.name}`}><Trash2 size={16} /></button></div></div>}
    </article>)}</div>
    {!draft.length && <div className="empty-state compact"><Dumbbell size={27} /><h3>Comece a prescrição.</h3><p>Adicione exercícios da biblioteca e defina os parâmetros antes de publicar.</p></div>}
    <button className="add-block" onClick={() => setLibraryOpen(true)}><Plus size={19} /><span><strong>Adicionar exercício</strong><small>Biblioteca de movimentos e parâmetros editáveis</small></span></button>
    {!canPublish && <p className="builder-validation" role="status"><AlertCircle size={15} /> Informe o nome e mantenha ao menos um exercício com séries e repetições.</p>}
    {error && <p className="builder-validation" role="alert"><AlertCircle size={15} /> {error}</p>}
    {published && <div className="live-publish-success"><Check size={18} /><span><strong>Versão publicada com sucesso.</strong><small>Edite qualquer campo para criar uma nova intenção e uma nova chave segura.</small></span></div>}
    <aside className="builder-savebar"><span><ShieldCheck size={16} /><strong>Rascunho somente nesta sessão</strong><small>{canPublish ? 'Pronto para sua confirmação explícita.' : 'Complete os campos essenciais.'}</small></span><Button disabled={!canPublish || publishing} onClick={() => void publish()}>{publishing ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Publicar para {target.student.displayName.split(/\s+/)[0]}</Button></aside>
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
