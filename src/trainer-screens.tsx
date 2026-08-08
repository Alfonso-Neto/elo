import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertCircle, ArrowDown, ArrowRight, ArrowUp, CalendarDays, Check, ChevronDown,
  CirclePlus, Clock3, Dumbbell, Eye, FileCheck2, FilePlus2, Filter, GripVertical, HeartPulse,
  MessageCircle, MoreHorizontal, Plus, Search, Send, Sparkles, Trash2, UserRound, Users, X, Zap,
} from 'lucide-react'
import { exerciseLibrary, formTemplateQuestions, formTemplates, generalForm, students } from './data'
import { BackButton, Button, Drawer, Eyebrow, Modal, MovementDemo, PageIntro, Progress, SectionTitle, Segmented, SuccessState } from './components'
import { usePrototype } from './prototype-context'
import { useAuth } from './auth/auth-context'
import { TrainerStudentsEnrollment } from './onboarding/EnrollmentScreens'
import { LiveTrainerDashboard } from './live/LiveTrainerDashboard'
import { LiveTrainerCopilot } from './live/LiveTrainerCopilot'
import { LiveFormBuilderScreen, LiveTrainerFormsScreen, LiveWorkoutBuilderScreen } from './live/LiveTrainerTraining'
import { LiveStudentDetailScreen } from './live/LiveStudentDetail'
import { LiveMessagesScreen, LiveTrainerScheduleScreen } from './live/LiveOperationsScreens'
import type { Exercise, FormQuestion, QuestionType, Session, Student } from './types'

export function TrainerDashboard() {
  const { isDemo } = useAuth()
  return isDemo ? <DemoTrainerDashboard /> : <LiveTrainerDashboard />
}

function DemoTrainerDashboard() {
  const { navigate, painReports, sessions, messages, formSubmitted, workoutSent, workoutFeedback, setSelectedStudentId } = usePrototype()
  const openPain = painReports.filter((report) => report.status === 'open')
  const todaySessions = sessions.filter((session) => session.date === '2026-08-07' && session.status !== 'available')
  const attention = [
    { id: 'pain', icon: HeartPulse, name: 'Marina Costa', detail: `${openPain.length} relatos sobre o joelho · último ${openPain[0]?.createdAt.toLowerCase() ?? 'hoje'}`, type: 'Dor', tone: 'danger', action: () => { setSelectedStudentId('marina'); navigate('copilot') } },
    workoutFeedback
      ? { id: 'feedback', icon: Activity, name: 'Marina Costa', detail: `RPE ${workoutFeedback.rpe}/10 · ${workoutFeedback.mood}${workoutFeedback.comment ? ` · ${workoutFeedback.comment}` : ''}`, type: 'Pós-treino', tone: 'warning', action: () => { setSelectedStudentId('marina'); navigate('student-detail') } }
      : { id: 'feedback', icon: Activity, name: 'Rafael Lima', detail: 'Treino de pernas marcado como muito intenso', type: 'Feedback', tone: 'warning', action: () => { setSelectedStudentId('rafael'); navigate('student-detail') } },
    { id: 'form', icon: FileCheck2, name: formSubmitted ? 'Anamnese respondida' : 'Camila Rocha', detail: formSubmitted ? 'Marina concluiu o formulário enviado' : 'Check-in apontou sono abaixo do habitual', type: formSubmitted ? 'Novo' : 'Contexto', tone: 'blue', action: () => { if (formSubmitted) setSelectedStudentId('marina'); else setSelectedStudentId('camila'); navigate(formSubmitted ? 'forms' : 'student-detail') } },
  ].filter((item) => item.id !== 'pain' || openPain.length > 0)
  return <div className="page enter">
    <section className="hero-grid trainer-hero">
      <div className="hero-copy"><Eyebrow accent>SEXTA, 7 DE AGOSTO</Eyebrow><h2>Bom dia, André.<br /><em>{attention.length} sinais</em> precisam do seu olhar.</h2><p>Os sinais mais importantes da sua base, organizados antes que virem silêncio.</p></div>
      <div className="signal-orbit" aria-hidden="true"><span>{String(attention.length).padStart(2, '0')}</span><small>SINAIS<br />ABERTOS</small><i className="orbit-dot" /></div>
    </section>
    <section className="section-block">
      <SectionTitle index="01" title="Precisam de você" copy="Ordenados por impacto e recência, não por ordem alfabética." action={<button className="text-link" onClick={() => navigate('students')}>Ver todos <ArrowRight size={15} /></button>} />
      <div className="attention-list">{attention.map(({ id, icon: Icon, name, detail, type, tone, action }, index) => <button className="attention-row" key={id} onClick={action}>
        <span className={`status-line ${tone}`} /><span className={`signal-avatar ${tone}`}><Icon size={17} /></span><span className="person"><strong>{name}</strong><small>{detail}</small></span><span className={`tag ${tone}`}>{type}</span><ArrowRight size={18} /><span className="row-number">0{index + 1}</span>
      </button>)}</div>
    </section>
    <section className="lower-grid">
      <article className="surface-card agenda-card"><SectionTitle index="02" title="Hoje" action={<button className="text-link" onClick={() => navigate('schedule')}>Agenda <ArrowRight size={15} /></button>} />
        {todaySessions.map((session, index) => <button className="timeline" key={session.id} onClick={() => navigate('schedule')}><span>{session.time}</span><i className={index === 1 ? 'current-dot' : ''} /><div><strong>{session.student}</strong><small>{session.type} · {session.place}</small></div>{index === 1 && <b>EM 48 MIN</b>}</button>)}
      </article>
      <button className="copilot-card" onClick={() => navigate('copilot')}><span className="copilot-icon"><Sparkles size={23} /></span><Eyebrow accent>COPILOTO · MARINA</Eyebrow><h3>{workoutSent ? 'A decisão já chegou à Marina.' : 'Os sinais pedem uma decisão.'}</h3><p>{workoutSent ? 'O treino revisado está disponível para ela. O histórico preserva o seu raciocínio.' : 'Separei três caminhos com justificativa e risco para você avaliar.'}</p><span className="card-action">{workoutSent ? 'Ver contexto' : 'Pensar prescrição'} <ArrowRight size={16} /></span><span className="card-grid" /></button>
    </section>
    <section className="metric-strip" aria-label="Resumo da operação"><div><strong>28</strong><span>alunos ativos</span><small>+3 neste ciclo</small></div><div><strong>87%</strong><span>adesão média</span><small>+4% em 30 dias</small></div><div><strong>{messages.length}</strong><span>mensagens no caso Marina</span><small>canal profissional</small></div><div><strong>4</strong><span>treinos para revisar</span><small>esta semana</small></div></section>
  </div>
}

export function StudentsScreen() {
  const { isDemo } = useAuth()
  return isDemo ? <DemoStudentsScreen /> : <TrainerStudentsEnrollment />
}

function DemoStudentsScreen() {
  const { navigate, selectedStudentId, setSelectedStudentId, painReports } = usePrototype()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const statusFor = (student: Student) => student.id === 'marina' && !painReports.some((report) => report.studentId === 'marina' && report.status === 'open') ? 'steady' : student.status
  const filtered = students.filter((student) => (filter === 'all' || statusFor(student) === filter) && student.name.toLowerCase().includes(search.toLowerCase()))
  const openStudent = (student: Student) => { setSelectedStudentId(student.id); navigate('student-detail') }
  return <div className="page enter"><PageIntro eyebrow="SUA BASE · 28 ATIVOS" title={<>Atenção antes<br />de administração.</>} copy="A ordem revela quem precisa de contexto agora. Busque, filtre e abra o histórico sem perder o fio." />
    <div className="toolbar"><label className="search-field"><Search size={17} /><span className="sr-only">Buscar aluno</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome..." /></label><Segmented label="Filtrar alunos" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Todos' }, { value: 'priority', label: 'Prioridade' }, { value: 'feedback', label: 'Feedback' }, { value: 'steady', label: 'Em dia' }]} /></div>
    <div className="student-table"><div className="table-head"><span>Aluno</span><span>Objetivo</span><span>Adesão</span><span>Status</span><span /></div>{filtered.map((student) => <button className="student-row" key={student.id} onClick={() => openStudent(student)}>
      <span className="student-identity"><i className={`person-avatar ${statusFor(student)}`}>{student.initials}</i><span><strong>{student.name}</strong><small>{student.id === 'marina' && statusFor(student) === 'steady' ? 'Sinais revisados · treino atualizado' : student.summary}</small></span></span><span>{student.goal}</span><span className="adherence"><Progress value={student.adherence} label={`Adesão de ${student.name}`} /><small>{student.adherence}%</small></span><span className={`tag ${statusFor(student) === 'priority' ? 'danger' : statusFor(student) === 'feedback' ? 'warning' : 'success'}`}>{statusFor(student) === 'priority' ? `${painReports.filter((item) => item.studentId === student.id && item.status === 'open').length} sinais` : statusFor(student) === 'feedback' ? 'Feedback' : 'Em dia'}</span><ArrowRight size={17} />
    </button>)}</div>
    {!filtered.length && <div className="empty-state"><Search size={28} /><h3>Nenhum aluno encontrado</h3><p>Tente outro nome ou retire o filtro atual.</p><Button variant="secondary" onClick={() => { setSearch(''); setFilter('all') }}>Limpar busca</Button></div>}
    <p className="table-caption">Aluno selecionado no contexto: <strong>{students.find((student) => student.id === selectedStudentId)?.name}</strong></p>
  </div>
}

export function StudentDetailScreen() {
  const { isDemo } = useAuth()
  return isDemo ? <DemoStudentDetailScreen /> : <LiveStudentDetailScreen />
}

function DemoStudentDetailScreen() {
  const { navigate, selectedStudentId, painReports, sessions, workoutFeedback, studentNotes, addStudentNote, notify } = usePrototype()
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const student = students.find((item) => item.id === selectedStudentId) ?? students[0]
  const reports = painReports.filter((item) => item.studentId === student.id)
  const notes = studentNotes.filter((item) => item.studentId === student.id)
  const openMarinaFeature = (page: 'copilot' | 'builder' | 'forms') => student.id === 'marina'
    ? navigate(page)
    : notify('Fluxo detalhado disponível para Marina', 'Neste cenário de validação, prescrição e anamnese completas estão conectadas ao caso principal de Marina.')
  return <div className="page enter"><BackButton onClick={() => navigate('students')} label="Voltar para alunos" />
    <section className="student-profile-head"><span className={`profile-avatar ${student.status}`}>{student.initials}</span><div><Eyebrow>ALUNO · {student.since.toUpperCase()} COM VOCÊ</Eyebrow><h2>{student.name}</h2><p>{student.age} anos · {student.goal} · sequência de {student.streak} dias</p></div><div className="profile-actions"><Button variant="secondary" onClick={() => navigate('messages')}><MessageCircle size={16} /> Conversar</Button><Button onClick={() => openMarinaFeature('copilot')}><Sparkles size={16} /> Abrir Copiloto</Button></div></section>
    <section className="profile-metrics"><div><small>ADESÃO · 30 DIAS</small><strong>{student.adherence}%</strong><Progress value={student.adherence} label="Adesão" /></div><div><small>RPE MÉDIO</small><strong>{student.id === 'marina' ? '8,7' : '7,4'}</strong><span>últimos 4 treinos</span></div><div><small>PRÓXIMA SESSÃO</small><strong>{sessions.find((session) => session.student === student.name)?.time ?? 'A definir'}</strong><span>{sessions.find((session) => session.student === student.name)?.date ?? 'sem reserva'}</span></div><div><small>SINAIS ABERTOS</small><strong>{reports.filter((report) => report.status === 'open').length}</strong><span>exigem revisão</span></div></section>
    <div className="profile-grid"><section><SectionTitle index="01" title="Linha de sinais" copy="Fonte, recência e resposta preservadas." /><div className="history-list">{reports.map((report) => <article key={report.id}><span className={`history-dot ${report.status}`} /><div><strong>{report.location} · intensidade {report.intensity}/10</strong><p>{report.moment}</p><small>Assistente da aluna · {report.createdAt}</small></div><span className={`tag ${report.status === 'open' ? 'danger' : 'success'}`}>{report.status === 'open' ? 'Aberto' : 'Revisado'}</span></article>)}{student.id === 'marina' && workoutFeedback && <article><span className="history-dot info" /><div><strong>Feedback pós-treino · RPE {workoutFeedback.rpe}/10</strong><p>{workoutFeedback.mood}{workoutFeedback.comment ? ` · ${workoutFeedback.comment}` : ' · sem comentário adicional'}</p><small>Aluna · {workoutFeedback.createdAt}</small></div><span className="tag blue">Feedback</span></article>}{notes.map((note) => <article key={note.id}><span className="history-dot info" /><div><strong>Observação privada</strong><p>{note.text}</p><small>Treinador · {note.createdAt}</small></div><span className="tag blue">Nota</span></article>)}{!reports.length && !notes.length && !(student.id === 'marina' && workoutFeedback) && <div className="mini-empty">Nenhum sinal registrado neste cenário.</div>}{!workoutFeedback && student.id === 'marina' && <article><span className="history-dot info" /><div><strong>Treino de inferiores concluído</strong><p>RPE 9/10 · “pesado na parte final”</p><small>Pós-treino · há 4 dias</small></div><span className="tag blue">Feedback</span></article>}</div></section>
      <aside className="profile-side"><SectionTitle index="02" title="Plano atual" /><div className="current-plan"><Dumbbell size={22} /><Eyebrow>ATIVO DESDE 02 AGO</Eyebrow><h3>{student.id === 'marina' ? 'Treino A · Inferiores' : `Plano de ${student.goal}`}</h3><p>{student.id === 'marina' ? '4 exercícios · Hipertrofia · revisão aberta por sinal de joelho.' : 'Resumo demonstrativo. O editor completo deste protótipo está conectado ao caso Marina.'}</p><Button variant="secondary" onClick={() => openMarinaFeature('builder')}>Abrir editor <ArrowRight size={16} /></Button></div><div className="quick-stack"><button onClick={() => openMarinaFeature('forms')}><FilePlus2 size={17} /><span><strong>Enviar anamnese</strong><small>Escolher modelo ou criar</small></span><ArrowRight size={16} /></button><button onClick={() => navigate('schedule')}><CalendarDays size={17} /><span><strong>Agendar sessão</strong><small>Ver horários livres</small></span><ArrowRight size={16} /></button><button onClick={() => setNoteOpen(true)}><CirclePlus size={17} /><span><strong>Adicionar observação</strong><small>Nota privada do treinador</small></span><ArrowRight size={16} /></button></div></aside>
    </div>
    {noteOpen && <Modal title={`Observação sobre ${student.name}`} eyebrow="NOTA PRIVADA DO TREINADOR" onClose={() => setNoteOpen(false)} size="small"><div className="form-stack"><label><span>Observação</span><textarea autoFocus value={noteDraft} onChange={(event) => setNoteDraft(event.target.value.slice(0, 500))} placeholder="Registre contexto útil para o próximo atendimento..." /></label><Button className="wide" disabled={!noteDraft.trim()} onClick={() => { addStudentNote(student.id, noteDraft); setNoteDraft(''); setNoteOpen(false) }}>Salvar no histórico</Button></div></Modal>}
  </div>
}

const copilotOptions = [
  { title: 'Manter o padrão, ajustar a dose', why: 'Preserva a habilidade com menos carga e amplitude controlada.', risk: 'Pode manter irritação se o padrão motor for o gatilho.', label: 'CONTINUIDADE' },
  { title: 'Trocar o estímulo por agora', why: 'Reduz complexidade do movimento sem pausar o trabalho de pernas.', risk: 'Menor transferência para o padrão de agachar.', label: 'ADAPTAÇÃO' },
  { title: 'Preparar antes de progredir', why: 'Prioriza mobilidade e estabilidade antes do bloco principal.', risk: 'Volume principal menor nesta sessão.', label: 'PREPARAÇÃO' },
]

export function CopilotScreen() {
  const { isDemo } = useAuth()
  return isDemo ? <DemoCopilotScreen /> : <LiveTrainerCopilot />
}

function DemoCopilotScreen() {
  const { navigate, painReports, workout, workoutName, setWorkout, sendWorkout } = usePrototype()
  const [choice, setChoice] = useState<number | null>(null)
  const [volume, setVolume] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [sent, setSent] = useState(false)
  const reports = painReports.filter((report) => report.studentId === 'marina')
  const copilotDraft = useMemo(() => {
    let next = workout.map((exercise) => ({ ...exercise }))
    if (choice === 0) next = next.map((exercise, index) => index === 0 ? { ...exercise, load: '60 kg', rest: '120s', note: 'Use amplitude confortável e interrompa se a dor reaparecer.', suggested: true } : exercise)
    if (choice === 1) next = next.map((exercise, index) => index === 0 ? { ...exerciseLibrary[2], id: 'copilot-abducao', note: 'Alternativa temporária ao padrão que provocou desconforto.', suggested: true } : exercise)
    if (choice === 2 && !next.some((exercise) => exercise.id === 'mobilidade')) next = [{ ...exerciseLibrary[0] }, ...next]
    if (volume === 'reduce') next = next.map((exercise) => ({ ...exercise, sets: String(Math.max(1, (Number(exercise.sets) || 2) - 1)), suggested: true }))
    return next
  }, [choice, volume, workout])
  return <div className="page copilot-page enter"><PageIntro eyebrow="CONTEXTO ATIVO · MARINA COSTA" title={<>Você prescreve.<br />Eu organizo os sinais.</>} copy="Nada muda sem a sua confirmação. Cada caminho mostra motivo e contrapartida." action={<div className="student-select"><span className="person-avatar priority">MC</span><span><small>PRESCREVENDO PARA</small><strong>Marina Costa</strong></span><Check size={17} /></div>} />
    <section className="flow-section"><SectionTitle index="01" title="Sinais das últimas 2 semanas" copy="O dado vem com origem e frequência para você julgar o contexto." /><div className="signal-cards"><article><span className="signal-icon danger"><Activity /></span><Eyebrow>DOR · ASSISTENTE</Eyebrow><h4>Joelho direito no agachamento</h4><footer><b>{reports.length}×</b> em 14 dias <span>último: {reports[0]?.createdAt.toLowerCase()}</span></footer></article><article><span className="signal-icon warning"><Zap /></span><Eyebrow>ESFORÇO · PÓS-TREINO</Eyebrow><h4>Perna marcada como “muito puxado”</h4><footer><b>9/10</b> RPE médio <span>4 registros</span></footer></article><article><span className="signal-icon blue"><CalendarDays /></span><Eyebrow>FREQUÊNCIA · AGENDA</Eyebrow><h4>Duas sessões não concluídas</h4><footer><b>−2</b> esta semana <span>padrão novo</span></footer></article></div></section>
    <section className="flow-section"><SectionTitle index="02" title="Como você quer conduzir o membro inferior?" copy="Você poderá editar todos os detalhes antes de enviar." /><div className="option-grid">{copilotOptions.map((option, index) => <button key={option.title} className={choice === index ? 'option selected' : 'option'} onClick={() => { setChoice(index); setVolume(null); setSent(false) }} aria-pressed={choice === index}><span className="option-top"><small>{option.label}</small><i>{choice === index && <Check size={14} />}</i></span><h4>{option.title}</h4><dl><div><dt>POR QUÊ</dt><dd>{option.why}</dd></div><div><dt>ATENÇÃO</dt><dd>{option.risk}</dd></div></dl></button>)}</div></section>
    {choice !== null && <section className="flow-section enter"><SectionTitle index="03" title="E sobre a queda de frequência?" copy="Uma volta mais curta pode reduzir sobrecarga; o histórico não decide por você." /><div className="binary-options"><button className={volume === 'reduce' ? 'selected' : ''} onClick={() => { setVolume('reduce'); setSent(false) }} aria-pressed={volume === 'reduce'}><span><strong>Reduzir o volume nesta semana</strong><small>Uma série a menos por exercício · retomada gradual</small></span><Check size={17} /></button><button className={volume === 'keep' ? 'selected' : ''} onClick={() => { setVolume('keep'); setSent(false) }} aria-pressed={volume === 'keep'}><span><strong>Manter o volume planejado</strong><small>Você conhece a resposta dela ao estímulo</small></span><Check size={17} /></button></div></section>}
    {volume && <section className="flow-section draft-section enter"><SectionTitle index="04" title="Rascunho para sua revisão" copy={`${copilotOptions[choice!].label.toLowerCase()} · ${volume === 'reduce' ? 'volume reduzido' : 'volume mantido'} · ${copilotDraft.length} exercícios`} action={<span className="tag blue">RASCUNHO</span>} /><div className="draft-list">{copilotDraft.map((exercise, index) => <article key={exercise.id}><span>{String(index + 1).padStart(2, '0')}</span><Dumbbell size={18} /><div><strong>{exercise.name}</strong><small>{exercise.note}</small></div><b>{exercise.sets} × {exercise.reps}</b>{exercise.suggested && <span className="tag success">AJUSTADO</span>}</article>)}</div><footer className="draft-footer"><p><Sparkles size={16} /> Eu junto os sinais e sugiro caminhos. <strong>A prescrição é sua.</strong></p><div><Button variant="secondary" onClick={() => { setWorkout(copilotDraft); navigate('builder') }}>Abrir editor detalhado</Button><Button onClick={() => setConfirm(true)}><Send size={16} /> Revisar e enviar</Button></div></footer></section>}
    {confirm && <Modal title={sent ? 'Prescrição enviada' : 'Seu último olhar'} eyebrow="CONFIRMAÇÃO EXPLÍCITA" onClose={() => setConfirm(false)} size="small">{sent ? <SuccessState title="A decisão chegou à Marina" copy="O treino publicado corresponde exatamente ao rascunho revisado acima." action={<Button onClick={() => setConfirm(false)}>Continuar</Button>} /> : <><p className="modal-lead">Você escolheu “{copilotOptions[choice!].title}” com {volume === 'reduce' ? 'volume reduzido' : 'volume mantido'}. Quer publicar estes {copilotDraft.length} exercícios?</p><div className="review-note"><Activity size={18} /><span><strong>Contexto preservado</strong><small>RPE 9/10 · {reports.length} relatos recentes</small></span></div><Button className="wide" onClick={() => { setWorkout(copilotDraft); sendWorkout(copilotDraft, workoutName); setSent(true) }}>Sim, confirmar e enviar</Button><Button variant="ghost" className="wide" onClick={() => { setWorkout(copilotDraft); setConfirm(false); navigate('builder') }}>Voltar e ajustar</Button><p className="anchor-copy">Eu só te lembro e te faço pensar. Quem decide é você.</p></>}</Modal>}
  </div>
}

export function WorkoutBuilderScreen() {
  const { isDemo } = useAuth()
  return isDemo ? <DemoWorkoutBuilderScreen /> : <LiveWorkoutBuilderScreen />
}

function DemoWorkoutBuilderScreen() {
  const { navigate, workout, workoutName, setWorkout, setWorkoutName, sendWorkout, workoutSent, notify } = usePrototype()
  const [expanded, setExpanded] = useState(workout[0]?.id ?? '')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryQuery, setLibraryQuery] = useState('')
  const [preview, setPreview] = useState<Exercise | null>(null)
  const [playing, setPlaying] = useState(true)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [nudges, setNudges] = useState(['mobilidade', 'proporcao'])
  const canPublish = Boolean(workoutName.trim()) && workout.length > 0 && workout.every((exercise) => exercise.name.trim() && exercise.sets.trim() && exercise.reps.trim())
  const updateExercise = (id: string, key: keyof Exercise, value: string) => setWorkout((items) => items.map((item) => item.id === id ? { ...item, [key]: value } : item))
  const move = (index: number, direction: number) => setWorkout((items) => { const next = [...items]; const target = index + direction; if (target < 0 || target >= next.length) return items; [next[index], next[target]] = [next[target], next[index]]; return next })
  const addExercise = (exercise: Exercise) => { if (workout.some((item) => item.id === exercise.id)) { notify('Exercício já está no treino', 'Você pode editar os parâmetros diretamente na lista.'); return }; setWorkout((items) => [...items, { ...exercise }]); setExpanded(exercise.id); setLibraryOpen(false); notify('Exercício adicionado', `${exercise.name} entrou no final do treino.`) }
  const acceptMobility = () => { addExercise(exerciseLibrary[0]); setNudges((items) => items.filter((item) => item !== 'mobilidade')) }
  return <div className="page builder-page enter"><BackButton onClick={() => navigate('copilot')} label="Voltar ao Copiloto" />
    <PageIntro eyebrow="CONSTRUTOR · MARINA COSTA" title="Treino em suas mãos." copy="Edite o detalhe técnico e confira exatamente como a aluna verá." action={<div className="builder-actions"><Button variant="secondary" disabled={!workout.length} onClick={() => setPreview(workout[0])}><Eye size={16} /> Pré-visualizar</Button><Button disabled={!canPublish} onClick={() => sendWorkout()}><Send size={16} /> {workoutSent ? 'Enviar atualização' : 'Enviar treino'}</Button></div>} />
    <section className="builder-toolbar"><label><span>NOME DO TREINO</span><input value={workoutName} onChange={(event) => setWorkoutName(event.target.value.slice(0, 80))} /></label><div><span className="tag success">HIPERTROFIA</span><span className="tag danger">ATENÇÃO · JOELHO</span><small>{workout.length} exercícios · {workout.reduce((sum, item) => sum + (Number(item.sets) || 0), 0)} séries</small></div></section>
    <div className="exercise-builder-list">{workout.map((exercise, index) => <article className={expanded === exercise.id ? 'builder-exercise open' : 'builder-exercise'} key={exercise.id}>
      <button className="builder-exercise-head" onClick={() => setExpanded(expanded === exercise.id ? '' : exercise.id)} aria-expanded={expanded === exercise.id}><GripVertical size={17} /><span className="exercise-order">{String(index + 1).padStart(2, '0')}</span><span className="exercise-glyph"><Dumbbell size={18} /></span><span><strong>{exercise.name}</strong><small>{exercise.muscle}</small></span>{exercise.suggested && <span className="tag success">CONFIRMADO POR VOCÊ</span>}<ChevronDown size={18} /></button>
      {expanded === exercise.id && <div className="builder-fields enter"><div className="field-grid">{([['sets','Séries'],['reps','Repetições'],['load','Carga'],['rest','Descanso'],['tempo','Cadência'],['rir','RIR']] as [keyof Exercise,string][]).map(([key, label]) => <label key={key}><span>{label}</span><input value={String(exercise[key] ?? '')} onChange={(event) => updateExercise(exercise.id, key, event.target.value.slice(0, 20))} /></label>)}</div><label className="note-field"><span>Observação visível para a aluna</span><textarea value={exercise.note} onChange={(event) => updateExercise(exercise.id, 'note', event.target.value.slice(0, 220))} /></label><div className="exercise-actions"><Button variant="ghost" onClick={() => setPreview(exercise)}><Eye size={15} /> Ver como a aluna vê</Button><span /><button onClick={() => move(index, -1)} disabled={index === 0} aria-label="Mover exercício para cima"><ArrowUp size={16} /></button><button onClick={() => move(index, 1)} disabled={index === workout.length - 1} aria-label="Mover exercício para baixo"><ArrowDown size={16} /></button><button className="danger-action" onClick={() => setWorkout((items) => items.filter((item) => item.id !== exercise.id))} aria-label={`Remover ${exercise.name}`}><Trash2 size={16} /></button></div></div>}
    </article>)}</div>
    <button className="add-block" onClick={() => setLibraryOpen(true)}><Plus size={19} /><span><strong>Adicionar exercício</strong><small>Buscar na biblioteca por nome ou grupo muscular</small></span></button>
    {!canPublish && <p className="builder-validation" role="status"><AlertCircle size={15} /> Dê um nome ao treino e mantenha ao menos um exercício com séries e repetições preenchidas.</p>}
    <aside className="builder-savebar"><span><Check size={16} /><strong>Rascunho salvo neste dispositivo</strong><small>{canPublish ? 'Pronto para publicar quando você decidir.' : 'Complete os campos essenciais antes de publicar.'}</small></span><Button disabled={!canPublish} onClick={() => sendWorkout()}><Send size={16} /> {workoutSent ? 'Enviar atualização para Marina' : 'Enviar para Marina'}</Button></aside>
    <button className="floating-copilot" onClick={() => setCopilotOpen(true)} aria-label={`Abrir ${nudges.length} lembretes do Copiloto`}><Sparkles size={22} />{nudges.length > 0 && <b>{nudges.length}</b>}</button>
    {libraryOpen && <Modal title="Biblioteca de exercícios" eyebrow="ADICIONAR AO TREINO" onClose={() => setLibraryOpen(false)} size="medium"><label className="search-field modal-search"><Search size={17} /><span className="sr-only">Buscar na biblioteca</span><input placeholder="Buscar exercício ou músculo..." value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} autoFocus /></label><div className="library-list">{exerciseLibrary.filter((exercise) => `${exercise.name} ${exercise.muscle}`.toLowerCase().includes(libraryQuery.toLowerCase())).map((exercise) => <button key={exercise.id} onClick={() => addExercise(exercise)}><span className="exercise-glyph"><Dumbbell size={17} /></span><span><strong>{exercise.name}</strong><small>{exercise.muscle}</small></span><Plus size={17} /></button>)}</div></Modal>}
    {preview && <Drawer title={preview.name} eyebrow="VISÃO DA ALUNA" onClose={() => setPreview(null)}><MovementDemo name={preview.name} playing={playing} onToggle={() => setPlaying(!playing)} /><div className="exercise-stats">{[['Séries',preview.sets],['Reps',preview.reps],['Carga',preview.load],['Descanso',preview.rest],['Cadência',preview.tempo],['RIR',preview.rir]].map(([label,value]) => <div key={label}><strong>{value}</strong><small>{label}</small></div>)}</div><div className="trainer-note"><Eyebrow>RECADO DO SEU PROFESSOR</Eyebrow><p>{preview.note}</p></div><Button className="wide" onClick={() => setPreview(null)}>Fechar prévia</Button></Drawer>}
    {copilotOpen && <Drawer title={nudges.length ? `${nudges.length} pontos para pensar` : 'Contexto resolvido'} eyebrow="COPILOTO FLUTUANTE" onClose={() => setCopilotOpen(false)}>{nudges.length === 0 ? <SuccessState title="Tudo revisado por você" copy="Eu só te lembrei e fiz perguntas. As decisões continuam sendo suas." /> : <div className="nudge-list">{nudges.includes('mobilidade') && <article><span className="nudge-type"><AlertCircle size={15} /> CONTEXTO</span><h3>Mobilidade ficou fora do aquecimento. Foi proposital?</h3><p>Marina relatou dor 3× ao descer no agachamento.</p><div><Button onClick={acceptMobility}>Adicionar mobilidade</Button><Button variant="ghost" onClick={() => setNudges((items) => items.filter((item) => item !== 'mobilidade'))}>Foi proposital</Button></div></article>}{nudges.includes('proporcao') && <article><span className="nudge-type"><Activity size={15} /> PROPORÇÃO</span><h3>Há mais volume de quadríceps do que posterior.</h3><p>Quer confirmar a proporção para esta sessão de retorno?</p><div><Button variant="secondary" onClick={() => { addExercise(exerciseLibrary[1]); setNudges((items) => items.filter((item) => item !== 'proporcao')) }}>Adicionar posterior</Button><Button variant="ghost" onClick={() => setNudges((items) => items.filter((item) => item !== 'proporcao'))}>Manter assim</Button></div></article>}</div>}<p className="anchor-copy">Nada é alterado sem a sua ação.</p></Drawer>}
  </div>
}

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: 'text', label: 'Texto curto' }, { value: 'long', label: 'Texto longo' }, { value: 'single', label: 'Escolha única' }, { value: 'multi', label: 'Múltipla' }, { value: 'scale', label: 'Escala 0–10' }, { value: 'yesno', label: 'Sim / não' }, { value: 'number', label: 'Número' },
]

export function FormsScreen() {
  const { isDemo } = useAuth()
  return isDemo ? <DemoFormsScreen /> : <LiveTrainerFormsScreen />
}

function DemoFormsScreen() {
  const { navigate, setFormQuestions, setFormTitle, publishedFormQuestions, publishedFormTitle, formSubmitted, formAnswers, notify } = usePrototype()
  const [responseOpen, setResponseOpen] = useState(false)
  const openTemplate = (id: string) => { setFormQuestions((formTemplateQuestions[id] ?? generalForm).map((question) => ({ ...question, options: question.options ? [...question.options] : undefined }))); setFormTitle(formTemplates.find((template) => template.id === id)?.name ?? 'Nova anamnese'); navigate('form-builder') }
  return <div className="page enter"><PageIntro eyebrow="ANAMNESE · DADOS COM CONTEXTO" title={<>Pergunte melhor.<br />Prescreva com mais história.</>} copy="Comece com um modelo e adapte ao seu nicho. Dados de saúde exigem consentimento e intenção clara." action={<Button onClick={() => { setFormQuestions([{ id: `q-${Date.now()}`, label: '', type: 'text', required: true }]); setFormTitle('Nova anamnese'); navigate('form-builder') }}><FilePlus2 size={16} /> Criar do zero</Button>} />
    <SectionTitle index="01" title="Modelos prontos" copy="Oito pontos de partida, todos editáveis antes do envio." /><div className="template-grid">{formTemplates.map((template, index) => <button key={template.id} onClick={() => openTemplate(template.id)}><span>{String(index + 1).padStart(2, '0')}</span><FileCheck2 size={21} /><h3>{template.name}</h3><p>{template.niche}</p><footer>{template.questions} perguntas <ArrowRight size={15} /></footer></button>)}</div>
    <section className="section-block"><SectionTitle index="02" title="Enviadas recentemente" /><div className="assignment-list"><button onClick={() => formSubmitted ? setResponseOpen(true) : notify('Aguardando Marina', 'A anamnese continua disponível na experiência da aluna.')}><span className="person-avatar priority">MC</span><span><strong>Marina Costa</strong><small>{publishedFormTitle} · {formSubmitted ? 'respondida agora' : 'aguardando resposta'}</small></span><span className={`tag ${formSubmitted ? 'success' : 'warning'}`}>{formSubmitted ? 'Concluída' : 'Pendente'}</span><ArrowRight size={16} /></button><button onClick={() => notify('Aguardando Lucas', 'Você será avisado assim que o formulário for concluído.')}><span className="person-avatar steady">LM</span><span><strong>Lucas Mendes</strong><small>Corrida / endurance · enviada ontem</small></span><span className="tag warning">Pendente</span><ArrowRight size={16} /></button></div></section>
    {responseOpen && <Drawer title="Respostas de Marina" eyebrow="ANAMNESE CONCLUÍDA · AGORA" onClose={() => setResponseOpen(false)}><div className="response-list">{publishedFormQuestions.map((question, index) => <article key={question.id}><Eyebrow>{String(index + 1).padStart(2, '0')} · {question.type}</Eyebrow><h3>{question.label}</h3><p>{Array.isArray(formAnswers[question.id]) ? (formAnswers[question.id] as string[]).join(', ') : formAnswers[question.id] || 'Não respondida'}</p></article>)}</div><div className="consent-mini"><FileCheck2 size={18} /><span><strong>Consentimento registrado</strong><small>Uso restrito ao acompanhamento · protótipo local.</small></span></div><Button className="wide" onClick={() => { setResponseOpen(false); navigate('student-detail') }}>Abrir perfil da aluna</Button></Drawer>}
  </div>
}

export function FormBuilderScreen() {
  const { isDemo } = useAuth()
  return isDemo ? <DemoFormBuilderScreen /> : <LiveFormBuilderScreen />
}

function DemoFormBuilderScreen() {
  const { navigate, formQuestions, formTitle: title, setFormTitle: setTitle, setFormQuestions, sendForm, notify, switchRole } = usePrototype()
  const [preview, setPreview] = useState(false)
  const update = (id: string, patch: Partial<FormQuestion>) => setFormQuestions((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
  const add = (question?: Partial<FormQuestion>) => setFormQuestions((items) => [...items, { id: `q-${Date.now()}`, label: question?.label ?? '', type: question?.type ?? 'text', options: question?.options, required: question?.required ?? false }])
  const move = (index: number, direction: number) => setFormQuestions((items) => { const next = [...items]; const target = index + direction; if (target < 0 || target >= next.length) return items; [next[index], next[target]] = [next[target], next[index]]; return next })
  const send = () => {
    if (!formQuestions.length || formQuestions.some((question) => !question.label.trim())) { notify('Revise as perguntas sem título', 'Inclua ao menos uma pergunta e deixe claro o que será coletado.'); return false }
    if (formQuestions.some((question) => ['single', 'multi'].includes(question.type) && (!question.options?.length || question.options.some((option) => !option.trim())))) { notify('Revise as opções de resposta', 'Perguntas de escolha precisam ter opções preenchidas.'); return false }
    sendForm()
    return true
  }
  return <div className="page form-builder-page enter"><BackButton onClick={() => navigate('forms')} label="Voltar para anamneses" /><PageIntro eyebrow="CONSTRUTOR DINÂMICO" title="Cada pergunta tem um motivo." copy="Use apenas os dados necessários para acompanhar a aluna." action={<div className="builder-actions"><Button variant="secondary" onClick={() => setPreview(true)}><Eye size={16} /> Pré-visualizar</Button><Button onClick={() => { if (send()) navigate('forms') }}><Send size={16} /> Enviar para Marina</Button></div>} />
    <section className="form-meta"><label><span>TÍTULO DO FORMULÁRIO</span><input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 90))} /></label><div><strong>{formQuestions.length}</strong><span>perguntas</span></div></section>
    <div className="question-builder-list">{formQuestions.map((question, index) => <article key={question.id} className="question-card"><header><GripVertical size={17} /><span>{String(index + 1).padStart(2, '0')}</span><label><span>PERGUNTA</span><input value={question.label} onChange={(event) => update(question.id, { label: event.target.value.slice(0, 180) })} placeholder="Escreva uma pergunta clara..." /></label><div className="question-actions"><button onClick={() => move(index, -1)} disabled={index === 0} aria-label="Mover pergunta para cima"><ArrowUp size={15} /></button><button onClick={() => move(index, 1)} disabled={index === formQuestions.length - 1} aria-label="Mover pergunta para baixo"><ArrowDown size={15} /></button><button className="danger-action" onClick={() => setFormQuestions((items) => items.filter((item) => item.id !== question.id))} aria-label="Remover pergunta"><Trash2 size={15} /></button></div></header><div className="question-types">{questionTypes.map((type) => <button className={question.type === type.value ? 'active' : ''} aria-pressed={question.type === type.value} key={type.value} onClick={() => update(question.id, { type: type.value, options: ['single','multi'].includes(type.value) ? question.options ?? ['Opção 1', 'Opção 2'] : undefined })}>{type.label}</button>)}</div>{['single','multi'].includes(question.type) && <div className="options-editor">{(question.options ?? []).map((option, optionIndex) => <label key={optionIndex}><i /><input value={option} onChange={(event) => update(question.id, { options: question.options?.map((item, i) => i === optionIndex ? event.target.value : item) })} /><button onClick={() => update(question.id, { options: question.options?.filter((_, i) => i !== optionIndex) })} aria-label="Remover opção"><X size={14} /></button></label>)}<button onClick={() => update(question.id, { options: [...(question.options ?? []), `Opção ${(question.options?.length ?? 0) + 1}`] })}>+ adicionar opção</button></div>}<footer><label className="switch-label"><input type="checkbox" checked={question.required ?? false} onChange={(event) => update(question.id, { required: event.target.checked })} /><i /><span>Resposta obrigatória</span></label></footer></article>)}</div>
    <button className="add-block" onClick={() => add()}><Plus size={19} /><span><strong>Adicionar pergunta</strong><small>Texto, escolha, escala, sim/não ou número</small></span></button>
    <section className="suggestion-bar"><span><Sparkles size={18} /><strong>Perguntas que costumam faltar</strong><small>Sugestões só entram quando você confirma.</small></span>{[{ label: 'Sono', question: 'Quantas horas você dorme por noite?', type: 'number' as QuestionType },{ label: 'Lesões', question: 'Você tem ou já teve alguma lesão? Descreva.', type: 'long' as QuestionType },{ label: 'Disponibilidade', question: 'Quantos dias por semana você consegue treinar?', type: 'number' as QuestionType }].map((suggestion) => <button key={suggestion.label} onClick={() => add({ label: suggestion.question, type: suggestion.type })}>+ {suggestion.label}</button>)}</section>
    {preview && <Drawer title={title} eyebrow="COMO MARINA RESPONDERÁ" onClose={() => setPreview(false)}><div className="consent-mini"><FileCheck2 size={18} /><span><strong>Consentimento explícito</strong><small>Dados sensíveis de saúde · uso restrito ao acompanhamento.</small></span></div><FormPreview questions={formQuestions} /><Button className="wide" onClick={() => { if (!send()) return; setPreview(false); switchRole('student'); navigate('student-form') }}>Enviar e testar como aluna</Button></Drawer>}
  </div>
}

function FormPreview({ questions }: { questions: FormQuestion[] }) {
  return <div className="form-preview">{questions.map((question, index) => <div key={question.id}><Eyebrow>{String(index + 1).padStart(2, '0')} · {question.type}</Eyebrow><label>{question.label || 'Pergunta sem título'}{question.required && <b> *</b>}</label>{question.type === 'long' ? <textarea disabled placeholder="Resposta longa" /> : question.type === 'scale' ? <div className="scale-preview">{[0,2,4,6,8,10].map((value) => <span key={value}>{value}</span>)}</div> : ['single','multi','yesno'].includes(question.type) ? <div className="choice-preview">{(question.type === 'yesno' ? ['Sim','Não'] : question.options ?? []).map((option) => <span key={option}>{option}</span>)}</div> : <input disabled placeholder={question.type === 'number' ? 'Resposta numérica' : 'Sua resposta'} />}</div>)}</div>
}

const scheduleDays = [
  { key: '2026-08-07', weekday: 'SEX', day: '07' }, { key: '2026-08-08', weekday: 'SÁB', day: '08' }, { key: '2026-08-09', weekday: 'DOM', day: '09' }, { key: '2026-08-10', weekday: 'SEG', day: '10' }, { key: '2026-08-11', weekday: 'TER', day: '11' },
]

export function ScheduleScreen() {
  const { isDemo } = useAuth()
  return isDemo ? <DemoScheduleScreen /> : <LiveTrainerScheduleScreen />
}

function DemoScheduleScreen() {
  const { sessions, setSessions, notify } = usePrototype()
  const [day, setDay] = useState('2026-08-07')
  const [createOpen, setCreateOpen] = useState(false)
  const [newSession, setNewSession] = useState<Partial<Session>>({ date: day, time: '16:00', student: 'Marina Costa', type: 'Presencial', place: 'Studio 01', status: 'confirmed' })
  const daySessions = sessions.filter((session) => session.date === day).sort((a, b) => a.time.localeCompare(b.time))
  const create = () => {
    if (!newSession.date || !scheduleDays.some((item) => item.key === newSession.date) || !newSession.time || !newSession.student || !newSession.place?.trim()) { notify('Revise os dados da sessão', 'Preencha aluno, data entre 7 e 11 de agosto, horário e local.'); return }
    if (sessions.some((session) => session.date === newSession.date && session.time === newSession.time)) { notify('Conflito de horário', 'Já existe uma sessão ou disponibilidade nesse horário. Escolha outro momento.'); return }
    setSessions((items) => [...items, { id: `session-${Date.now()}`, date: newSession.date ?? day, time: newSession.time ?? '16:00', student: newSession.student ?? 'Marina Costa', type: newSession.type ?? 'Presencial', place: newSession.place ?? 'Studio 01', status: 'confirmed' }])
    setCreateOpen(false); notify('Sessão adicionada', `${newSession.student} recebeu a atualização na agenda.`)
  }
  return <div className="page enter"><PageIntro eyebrow="AGENDA · 7–11 DE AGOSTO" title={<>Espaço para acompanhar.<br />Tempo para cuidar.</>} copy="Sessões, grupos e disponibilidade em uma linha do tempo compartilhada." action={<Button onClick={() => { setNewSession((value) => ({ ...value, date: day })); setCreateOpen(true) }}><Plus size={16} /> Nova sessão</Button>} />
    <div className="week-switcher">{scheduleDays.map((item) => <button key={item.key} className={day === item.key ? 'active' : ''} onClick={() => setDay(item.key)}><small>{item.weekday}</small><strong>{item.day}</strong><i>{sessions.filter((session) => session.date === item.key).length}</i></button>)}</div>
    <section className="schedule-layout"><div><SectionTitle index="01" title={`${scheduleDays.find((item) => item.key === day)?.weekday}, ${scheduleDays.find((item) => item.key === day)?.day} de agosto`} copy={`${daySessions.length} itens na agenda`} /><div className="day-schedule">{daySessions.map((session) => <article key={session.id} className={session.status}><time>{session.time}</time><i /><div><Eyebrow>{session.type} · {session.status === 'available' ? 'DISPONÍVEL' : session.status === 'pending' ? 'SOLICITAÇÃO' : session.status === 'reschedule' ? 'REORGANIZAR' : 'CONFIRMADA'}</Eyebrow><h3>{session.student}</h3><p>{session.place}</p></div><div className="schedule-actions">{session.status === 'available' ? <Button variant="secondary" onClick={() => { setSessions((items) => items.filter((item) => item.id !== session.id)); notify('Disponibilidade removida', 'O horário não aparece mais para os alunos.') }}>Remover slot</Button> : session.status === 'pending' ? <><Button onClick={() => { setSessions((items) => items.map((item) => item.id === session.id ? { ...item, status: 'confirmed' } : item)); notify('Horário confirmado', `${session.student} recebeu a confirmação.`) }}><Check size={15} /> Aprovar</Button><Button variant="ghost" onClick={() => { setSessions((items) => items.map((item) => item.id === session.id ? { ...item, student: 'Horário livre', status: 'available' } : item)); notify('Solicitação recusada', 'O horário voltou a ficar disponível.') }}>Recusar</Button></> : session.status === 'reschedule' ? <><Button onClick={() => { setSessions((items) => items.map((item) => item.id === session.id ? { ...item, student: 'Horário livre', status: 'available' } : item)); notify('Ausência registrada', 'O horário foi liberado e Marina pode solicitar outro slot.') }}>Liberar horário</Button><Button variant="ghost" onClick={() => { setSessions((items) => items.map((item) => item.id === session.id ? { ...item, status: 'confirmed' } : item)); notify('Sessão mantida', 'Marina recebeu a confirmação de que o horário continua reservado.') }}>Manter sessão</Button></> : <button onClick={() => { setSessions((items) => items.filter((item) => item.id !== session.id)); notify('Sessão cancelada', 'A alteração foi refletida nas duas agendas.') }} aria-label={`Cancelar sessão com ${session.student}`}><Trash2 size={16} /></button>}</div></article>)}{!daySessions.length && <div className="empty-state compact"><CalendarDays size={27} /><h3>Dia aberto</h3><p>Crie uma sessão ou ofereça um horário aos alunos.</p></div>}</div></div>
      <aside className="availability-card"><Eyebrow>DISPONIBILIDADE</Eyebrow><h3>Abra um horário para agendamento.</h3><p>O aluno solicita; você confirma antes de virar sessão.</p><Button variant="secondary" onClick={() => { if (sessions.some((session) => session.date === day && session.time === '17:30')) { notify('17:30 já está ocupado', 'Remova ou altere o item existente antes de publicar outro slot.'); return }; setSessions((items) => [...items, { id: `free-${Date.now()}`, date: day, time: '17:30', student: 'Horário livre', type: 'Online', place: 'Disponível para agendamento', status: 'available' }]); notify('Horário publicado', '17:30 já está visível na agenda do aluno.') }}><Clock3 size={16} /> Abrir 17:30</Button><div className="agenda-legend"><span><i className="confirmed" />Confirmada</span><span><i className="available" />Disponível</span><span><i className="pending" />Solicitação / reorganização</span></div></aside>
    </section>
    {createOpen && <Modal title="Nova sessão" eyebrow="AGENDA COMPARTILHADA" onClose={() => setCreateOpen(false)} size="small"><div className="form-stack"><label><span>Aluno</span><select value={newSession.student} onChange={(event) => setNewSession((value) => ({ ...value, student: event.target.value }))}>{students.map((student) => <option key={student.id}>{student.name}</option>)}</select></label><div className="split-fields"><label><span>Data</span><input type="date" min="2026-08-07" max="2026-08-11" value={newSession.date} onChange={(event) => setNewSession((value) => ({ ...value, date: event.target.value }))} /></label><label><span>Horário</span><input type="time" value={newSession.time} onChange={(event) => setNewSession((value) => ({ ...value, time: event.target.value }))} /></label></div><label><span>Formato</span><select value={newSession.type} onChange={(event) => setNewSession((value) => ({ ...value, type: event.target.value as Session['type'] }))}><option>Presencial</option><option>Online</option><option>Grupo</option></select></label><label><span>Local ou link</span><input value={newSession.place} onChange={(event) => setNewSession((value) => ({ ...value, place: event.target.value }))} /></label><Button className="wide" onClick={create}>Adicionar à agenda</Button></div></Modal>}
  </div>
}

export function MessagesScreen() {
  const { isDemo } = useAuth()
  return isDemo ? <DemoMessagesScreen /> : <LiveMessagesScreen />
}

function DemoMessagesScreen() {
  const { role, messages, addMessage, selectedStudentId, setSelectedStudentId, notify } = usePrototype()
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState(role === 'trainer' ? selectedStudentId : 'marina')
  const [otherMessages, setOtherMessages] = useState<Record<string, { id: string; sender: 'trainer' | 'student'; text: string; time: string }[]>>(() => {
    try {
      const stored = localStorage.getItem('elo-other-messages')
      if (stored) return JSON.parse(stored)
    } catch { /* start with the demonstration threads */ }
    return {
      rafael: [{ id: 'r1', sender: 'student', text: 'O treino foi intenso, mas consegui concluir todas as séries.', time: '08:42' }],
      bianca: [{ id: 'b1', sender: 'trainer', text: 'Ótima consistência esta semana, Bianca. Como está se sentindo?', time: 'Ontem' }],
      lucas: [{ id: 'l1', sender: 'student', text: 'Fechei os 5 km sem desconforto. Podemos subir o volume?', time: 'Ontem' }],
      camila: [{ id: 'c1', sender: 'student', text: 'Dormi melhor hoje. Vou fazer a sessão no fim da tarde.', time: '07:54' }],
    }
  })
  useEffect(() => { localStorage.setItem('elo-other-messages', JSON.stringify(otherMessages)) }, [otherMessages])
  useEffect(() => { if (role === 'student') setActiveId('marina') }, [role])
  const activeStudent = students.find((student) => student.id === activeId) ?? students[0]
  const shownMessages = activeId === 'marina' ? messages : otherMessages[activeId] ?? []
  const selectConversation = (id: string) => { setActiveId(id); setSelectedStudentId(id) }
  const send = () => {
    if (!draft.trim()) return
    if (activeId === 'marina') addMessage(role, draft)
    else setOtherMessages((items) => ({ ...items, [activeId]: [...(items[activeId] ?? []), { id: `local-${Date.now()}`, sender: role, text: draft.trim().slice(0, 600), time: 'Agora' }] }))
    setDraft('')
  }
  const conversations = students.filter((student) => student.name.toLowerCase().includes(search.toLowerCase()))
  return <div className="page message-page enter"><PageIntro eyebrow="CONVERSAS · CANAL PROFISSIONAL" title="O contexto fica junto." copy={role === 'trainer' ? 'Mensagens ligadas ao histórico de cada acompanhamento.' : 'Sua conversa privada com André, sem misturar o acompanhamento com outros canais.'} />
    <section className={`messenger ${role === 'student' ? 'student-thread-only' : ''}`}>{role === 'trainer' && <aside className="conversation-list"><label className="search-field"><Search size={16} /><span className="sr-only">Buscar conversa</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversa" /></label>{conversations.map((student, index) => <button className={student.id === activeId ? 'active' : ''} key={student.id} onClick={() => selectConversation(student.id)}><span className={`person-avatar ${student.status}`}>{student.initials}</span><span><strong>{student.name}</strong><small>{student.id === 'marina' ? messages.at(-1)?.text : otherMessages[student.id]?.at(-1)?.text ?? student.summary}</small></span>{index < 2 && <i>{index + 1}</i>}</button>)}</aside>}
      {role === 'trainer' && <label className="mobile-conversation-picker"><span>Conversa</span><select value={activeId} onChange={(event) => selectConversation(event.target.value)}>{students.map((student) => <option value={student.id} key={student.id}>{student.name}</option>)}</select></label>}
      <div className="thread"><header><span className={`person-avatar ${role === 'student' ? 'steady' : activeStudent.status}`}>{role === 'student' ? 'AL' : activeStudent.initials}</span><div><strong>{role === 'student' ? 'André Lima' : activeStudent.name}</strong><small><i /> acompanhamento ativo</small></div><button aria-label="Informações da conversa" onClick={() => notify('Canal profissional', 'A conversa fica vinculada ao acompanhamento e separada do WhatsApp pessoal.')}><MoreHorizontal /></button></header><div className="message-history" aria-live="polite">{shownMessages.map((message) => <div className={message.sender === role ? 'message mine' : 'message'} key={message.id}><p>{message.text}</p><time>{message.time}</time></div>)}</div><form className="message-composer" onSubmit={(event) => { event.preventDefault(); send() }}><label><span className="sr-only">Mensagem</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Escreva para ${role === 'student' ? 'André' : activeStudent.name.split(' ')[0]}...`} rows={1} /></label><button type="submit" disabled={!draft.trim()} aria-label="Enviar mensagem"><Send size={18} /></button></form></div>
    </section>
  </div>
}
