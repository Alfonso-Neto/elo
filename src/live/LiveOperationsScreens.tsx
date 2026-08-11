import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, CalendarCheck, CalendarDays, Check, Clock3, LoaderCircle,
  MessageCircle, MoreHorizontal, Plus, RefreshCw, Search, Send, ShieldCheck,
  Trash2, UserRound, X,
} from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { Button, Eyebrow, Modal, PageIntro, SectionTitle } from '../components'
import { listEnrolledStudents, type EnrolledStudent } from '../onboarding/enrollment-service'
import { useEloApp } from '../app-state'
import { createIdempotencyKey } from '../signals'
import {
  createOperationsService,
  type ScheduleMode,
  type ScheduleSession,
  type ScheduleSlot,
  type ThreadMessage,
} from './operations'
import './live-operations.css'

type Phase = 'loading' | 'ready' | 'error'

const modeLabels: Record<ScheduleMode, string> = {
  in_person: 'Presencial',
  online: 'Online',
  group: 'Grupo',
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'EL'
}

function dateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function timeLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function dateLabel(value: string, compact = false) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', compact
    ? { weekday: 'short', day: '2-digit' }
    : { weekday: 'long', day: '2-digit', month: 'long' }).format(date).replace('.', '')
}

function dateTimeLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'registro recente' : new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short',
  }).format(date)
}

function defaultStartValue() {
  const date = new Date(Date.now() + (24 * 60 * 60 * 1000))
  date.setMinutes(0, 0, 0)
  const hours = String(Math.max(8, date.getHours())).padStart(2, '0')
  return `${dateKey(date)}T${hours}:00`
}

function upcomingDateKeys(slots: ScheduleSlot[]) {
  const keys = new Set<string>()
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + offset)
    keys.add(dateKey(date))
  }
  for (const slot of slots) {
    if (Date.parse(slot.startAt) >= start.getTime()) keys.add(dateKey(slot.startAt))
  }
  return [...keys].filter(Boolean).sort()
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback
}

function mergeMessages(current: ThreadMessage[], incoming: ThreadMessage[]) {
  const merged = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) merged.set(message.id, message)
  return [...merged.values()].sort((a, b) => b.sequence - a.sequence)
}

export function LiveTrainerScheduleScreen() {
  const { notify } = useEloApp()
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [sessions, setSessions] = useState<ScheduleSession[]>([])
  const [students, setStudents] = useState<EnrolledStudent[]>([])
  const [day, setDay] = useState(dateKey(new Date()))
  const [createOpen, setCreateOpen] = useState(false)
  const [startAt, setStartAt] = useState(defaultStartValue)
  const [duration, setDuration] = useState(60)
  const [mode, setMode] = useState<ScheduleMode>('in_person')
  const [place, setPlace] = useState('Studio principal')
  const [capacity, setCapacity] = useState(1)
  const [busy, setBusy] = useState('')
  const actionKeys = useRef(new Map<string, string>())
  const createKey = useRef('')
  const actionInFlight = useRef(false)
  const actionRequestVersion = useRef(0)
  const loadRequestVersion = useRef(0)

  const load = useCallback(async (quiet = false) => {
    const requestVersion = ++loadRequestVersion.current
    if (!quiet) setPhase('loading')
    setError('')
    try {
      const service = createOperationsService()
      const [slotPage, sessionPage, roster] = await Promise.all([
        service.listScheduleSlots({ limit: 50 }),
        service.listScheduleSessions({ limit: 50 }),
        listEnrolledStudents(),
      ])
      if (requestVersion !== loadRequestVersion.current) return
      setSlots(slotPage.items)
      setSessions(sessionPage.items)
      setStudents(roster)
      setPhase('ready')
    } catch (cause) {
      if (requestVersion !== loadRequestVersion.current) return
      setError(errorMessage(cause, 'Não foi possível carregar a agenda compartilhada.'))
      setPhase('error')
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => () => {
    loadRequestVersion.current += 1
    actionRequestVersion.current += 1
    actionInFlight.current = false
  }, [])
  const days = useMemo(() => upcomingDateKeys(slots), [slots])
  const studentNames = useMemo(() => new Map(students.map((student) => [student.userId, student.displayName])), [students])
  const daySlots = slots.filter((slot) => slot.state !== 'cancelled' && dateKey(slot.startAt) === day)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))

  const keyFor = (intent: string) => {
    const existing = actionKeys.current.get(intent)
    if (existing) return existing
    const created = createIdempotencyKey('schedule-action')
    actionKeys.current.set(intent, created)
    return created
  }

  const finishAction = async (intent: string, successTitle: string, successCopy: string) => {
    actionKeys.current.delete(intent)
    setActionError('')
    notify(successTitle, successCopy)
    await load(true)
  }

  const respond = async (session: ScheduleSession, decision: 'confirmed' | 'declined') => {
    const intent = `${decision}-session-${session.id}`
    if (actionInFlight.current) return
    actionInFlight.current = true
    const requestVersion = ++actionRequestVersion.current
    setBusy(intent); setActionError('')
    try {
      await createOperationsService().respondScheduleSession({
        sessionId: session.id,
        decision,
        idempotencyKey: keyFor(intent),
      })
      if (requestVersion !== actionRequestVersion.current) return
      await finishAction(intent, decision === 'confirmed' ? 'Sessão confirmada' : 'Solicitação recusada', decision === 'confirmed'
        ? 'A confirmação já está disponível na agenda do aluno.'
        : 'O horário continua disponível de acordo com a capacidade do slot.')
    } catch (cause) {
      if (requestVersion !== actionRequestVersion.current) return
      setActionError(errorMessage(cause, 'Não foi possível atualizar esta solicitação.'))
    } finally {
      if (requestVersion === actionRequestVersion.current) {
        actionInFlight.current = false
        setBusy('')
      }
    }
  }

  const cancelSession = async (session: ScheduleSession) => {
    const intent = `cancel-session-${session.id}`
    if (actionInFlight.current) return
    actionInFlight.current = true
    const requestVersion = ++actionRequestVersion.current
    setBusy(intent); setActionError('')
    try {
      await createOperationsService().cancelScheduleSession({ sessionId: session.id, idempotencyKey: keyFor(intent) })
      if (requestVersion !== actionRequestVersion.current) return
      await finishAction(intent, 'Sessão cancelada', 'O cancelamento foi refletido nas duas agendas.')
    } catch (cause) {
      if (requestVersion !== actionRequestVersion.current) return
      setActionError(errorMessage(cause, 'Não foi possível cancelar esta sessão.'))
    } finally {
      if (requestVersion === actionRequestVersion.current) {
        actionInFlight.current = false
        setBusy('')
      }
    }
  }

  const cancelSlot = async (slot: ScheduleSlot) => {
    const intent = `cancel-slot-${slot.id}`
    if (actionInFlight.current) return
    actionInFlight.current = true
    const requestVersion = ++actionRequestVersion.current
    setBusy(intent); setActionError('')
    try {
      await createOperationsService().cancelScheduleSlot({ slotId: slot.id, idempotencyKey: keyFor(intent) })
      if (requestVersion !== actionRequestVersion.current) return
      await finishAction(intent, 'Horário removido', 'O slot e suas reservas ativas foram cancelados com registro de auditoria.')
    } catch (cause) {
      if (requestVersion !== actionRequestVersion.current) return
      setActionError(errorMessage(cause, 'Não foi possível remover este horário.'))
    } finally {
      if (requestVersion === actionRequestVersion.current) {
        actionInFlight.current = false
        setBusy('')
      }
    }
  }

  const createSlot = async () => {
    if (actionInFlight.current) return
    actionInFlight.current = true
    const requestVersion = ++actionRequestVersion.current
    setBusy('create-slot'); setActionError('')
    try {
      const start = new Date(startAt)
      const idempotencyKey = createKey.current || createIdempotencyKey('create-schedule-slot')
      createKey.current = idempotencyKey
      await createOperationsService().createScheduleSlot({
        idempotencyKey,
        startAt: start.toISOString(),
        durationMinutes: duration,
        mode,
        place,
        capacity,
      })
      if (requestVersion !== actionRequestVersion.current) return
      createKey.current = ''
      setCreateOpen(false)
      setDay(dateKey(start))
      notify('Horário publicado', 'Alunos vinculados já podem solicitar este horário.')
      await load(true)
    } catch (cause) {
      if (requestVersion !== actionRequestVersion.current) return
      setActionError(errorMessage(cause, 'Não foi possível publicar este horário.'))
    } finally {
      if (requestVersion === actionRequestVersion.current) {
        actionInFlight.current = false
        setBusy('')
      }
    }
  }

  if (phase === 'loading') return <OperationsLoading copy="Carregando horários e solicitações..." />
  if (phase === 'error') return <OperationsError copy={error} onRetry={() => void load()} />

  return <div className="page enter live-operations-page">
    <PageIntro eyebrow="AGENDA · SEU ESPAÇO" title={<>Espaço para acompanhar.<br />Tempo para cuidar.</>} copy="Horários, solicitações e confirmações sincronizados entre professor e aluno." action={<Button onClick={() => { setActionError(''); setCreateOpen(true) }}><Plus size={16} /> Abrir horário</Button>} />
    <div className="live-date-strip" aria-label="Filtrar agenda por dia">{days.map((value) => <button type="button" key={value} className={day === value ? 'active' : ''} onClick={() => setDay(value)}><small>{dateLabel(value, true).split(' ')[0]}</small><strong>{value.slice(-2)}</strong><i>{slots.filter((slot) => slot.state !== 'cancelled' && dateKey(slot.startAt) === value).length}</i></button>)}</div>
    <section className="section-block"><SectionTitle index="01" title={dateLabel(day)} copy={`${daySlots.length} ${daySlots.length === 1 ? 'horário publicado' : 'horários publicados'}`} action={<button type="button" className="text-link" onClick={() => void load()}><RefreshCw size={15} /> Atualizar</button>} />
      {actionError && <p className="operations-error" role="alert">{actionError}</p>}
      <div className="live-slot-list">{daySlots.map((slot) => {
        const slotSessions = sessions.filter((session) => session.slotId === slot.id && session.state !== 'cancelled' && session.state !== 'declined')
        const confirmed = slotSessions.filter((session) => session.state === 'confirmed').length
        return <article className={`live-slot-card ${slot.state}`} key={slot.id}>
          <header><time>{timeLabel(slot.startAt)}</time><div><Eyebrow>{modeLabels[slot.mode]} · {slot.durationMinutes} MIN</Eyebrow><h3>{slot.place}</h3><p>{confirmed}/{slot.capacity} confirmadas · {slotSessions.filter((session) => session.state === 'requested').length} aguardando decisão</p></div><span className={`tag ${slot.state === 'full' ? 'warning' : 'success'}`}>{slot.state === 'full' ? 'Lotado' : 'Aberto'}</span><button type="button" className="slot-delete" disabled={Boolean(busy)} onClick={() => void cancelSlot(slot)} aria-label={`Remover horário das ${timeLabel(slot.startAt)}`}>{busy === `cancel-slot-${slot.id}` ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}</button></header>
          {slotSessions.length > 0 ? <div className="live-session-list">{slotSessions.map((session) => <div key={session.id}><span className="person-avatar">{initials(studentNames.get(session.studentUserId) ?? 'Aluno')}</span><span><strong>{studentNames.get(session.studentUserId) ?? 'Aluno vinculado'}</strong><small>{session.state === 'requested' ? 'Solicitação aguardando seu olhar' : 'Sessão confirmada'} · {dateTimeLabel(session.requestedAt)}</small></span><div>{session.state === 'requested' ? <><Button disabled={Boolean(busy)} onClick={() => void respond(session, 'confirmed')}>{busy === `confirmed-session-${session.id}` ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Aprovar</Button><Button variant="ghost" disabled={Boolean(busy)} onClick={() => void respond(session, 'declined')}><X size={15} /> Recusar</Button></> : <button type="button" disabled={Boolean(busy)} onClick={() => void cancelSession(session)} aria-label="Cancelar sessão confirmada">{busy === `cancel-session-${session.id}` ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}</button>}</div></div>)}</div> : <div className="slot-empty"><UserRound size={17} /><span><strong>Aguardando solicitações</strong><small>O horário já aparece para os alunos vinculados.</small></span></div>}
        </article>
      })}</div>
      {!daySlots.length && <div className="empty-state compact"><CalendarDays size={28} /><h3>Dia aberto.</h3><p>Publique um horário para que alunos vinculados possam solicitar.</p><Button variant="secondary" onClick={() => setCreateOpen(true)}>Abrir horário</Button></div>}
    </section>
    {createOpen && <Modal title="Abrir horário" eyebrow="AGENDA COMPARTILHADA" onClose={() => !busy && setCreateOpen(false)} size="small"><div className="form-stack"><p className="modal-lead">O aluno solicita este slot; você confirma antes de virar sessão.</p><label><span>Início</span><input type="datetime-local" value={startAt} onChange={(event) => { createKey.current = ''; setStartAt(event.target.value) }} /></label><div className="split-fields"><label><span>Duração</span><select value={duration} onChange={(event) => { createKey.current = ''; setDuration(Number(event.target.value)) }}><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option><option value={90}>90 min</option></select></label><label><span>Capacidade</span><input type="number" min={1} max={50} value={capacity} onChange={(event) => { createKey.current = ''; setCapacity(Number(event.target.value)) }} /></label></div><label><span>Formato</span><select value={mode} onChange={(event) => { createKey.current = ''; setMode(event.target.value as ScheduleMode) }}><option value="in_person">Presencial</option><option value="online">Online</option><option value="group">Grupo</option></select></label><label><span>Local ou link</span><input maxLength={160} value={place} onChange={(event) => { createKey.current = ''; setPlace(event.target.value) }} /></label>{actionError && <p className="operations-error" role="alert">{actionError}</p>}<Button className="wide" disabled={busy === 'create-slot'} onClick={() => void createSlot()}>{busy === 'create-slot' ? <LoaderCircle className="spin" size={16} /> : <Clock3 size={16} />} Publicar disponibilidade</Button></div></Modal>}
  </div>
}

export function LiveStudentScheduleScreen() {
  const { membership } = useAuth()
  const { notify } = useEloApp()
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [sessions, setSessions] = useState<ScheduleSession[]>([])
  const [day, setDay] = useState('all')
  const [busy, setBusy] = useState('')
  const keys = useRef(new Map<string, string>())
  const actionInFlight = useRef(false)
  const actionRequestVersion = useRef(0)
  const loadRequestVersion = useRef(0)

  const load = useCallback(async (quiet = false) => {
    const requestVersion = ++loadRequestVersion.current
    if (!quiet) setPhase('loading')
    setError('')
    try {
      const service = createOperationsService()
      const [slotPage, sessionPage] = await Promise.all([
        service.listScheduleSlots({ limit: 50 }),
        service.listScheduleSessions({ limit: 50 }),
      ])
      if (requestVersion !== loadRequestVersion.current) return
      setSlots(slotPage.items)
      setSessions(sessionPage.items)
      setPhase('ready')
    } catch (cause) {
      if (requestVersion !== loadRequestVersion.current) return
      setError(errorMessage(cause, 'Não foi possível carregar sua agenda.'))
      setPhase('error')
    }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => () => {
    loadRequestVersion.current += 1
    actionRequestVersion.current += 1
    actionInFlight.current = false
  }, [])
  const days = useMemo(() => upcomingDateKeys(slots), [slots])
  const upcoming = slots.filter((slot) => slot.state !== 'cancelled' && Date.parse(slot.startAt) > Date.now())
    .filter((slot) => day === 'all' || dateKey(slot.startAt) === day)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))

  const keyFor = (intent: string) => {
    const stored = keys.current.get(intent)
    if (stored) return stored
    const created = createIdempotencyKey('schedule-action')
    keys.current.set(intent, created)
    return created
  }

  const request = async (slot: ScheduleSlot) => {
    const intent = `request-slot-${slot.id}`
    if (actionInFlight.current) return
    actionInFlight.current = true
    const requestVersion = ++actionRequestVersion.current
    setBusy(intent); setActionError('')
    try {
      await createOperationsService().requestScheduleSlot({ slotId: slot.id, idempotencyKey: keyFor(intent) })
      if (requestVersion !== actionRequestVersion.current) return
      keys.current.delete(intent)
      notify('Solicitação enviada', 'Seu professor precisa confirmar antes que o horário fique reservado.')
      await load(true)
    } catch (cause) {
      if (requestVersion !== actionRequestVersion.current) return
      setActionError(errorMessage(cause, 'Não foi possível solicitar este horário.'))
    } finally {
      if (requestVersion === actionRequestVersion.current) {
        actionInFlight.current = false
        setBusy('')
      }
    }
  }

  const cancel = async (session: ScheduleSession) => {
    const intent = `cancel-own-session-${session.id}`
    if (actionInFlight.current) return
    actionInFlight.current = true
    const requestVersion = ++actionRequestVersion.current
    setBusy(intent); setActionError('')
    try {
      await createOperationsService().cancelOwnScheduleSession({ sessionId: session.id, idempotencyKey: keyFor(intent) })
      if (requestVersion !== actionRequestVersion.current) return
      keys.current.delete(intent)
      notify('Solicitação cancelada', 'A alteração já está visível para o seu professor.')
      await load(true)
    } catch (cause) {
      if (requestVersion !== actionRequestVersion.current) return
      setActionError(errorMessage(cause, 'Não foi possível cancelar esta sessão.'))
    } finally {
      if (requestVersion === actionRequestVersion.current) {
        actionInFlight.current = false
        setBusy('')
      }
    }
  }

  if (phase === 'loading') return <OperationsLoading copy="Sincronizando sua agenda..." />
  if (phase === 'error') return <OperationsError copy={error} onRetry={() => void load()} />

  return <div className="page enter live-operations-page"><PageIntro eyebrow="SUA AGENDA · ELO" title="Treino marcado, mente livre." copy={`Veja horários publicados em ${membership?.workspaceName ?? 'seu espaço'} e acompanhe cada confirmação.`} action={<button type="button" className="text-link" onClick={() => void load()}><RefreshCw size={15} /> Atualizar</button>} />
    <div className="date-pills live-date-pills"><button type="button" className={day === 'all' ? 'active' : ''} onClick={() => setDay('all')}>Todos</button>{days.map((value) => <button type="button" className={day === value ? 'active' : ''} onClick={() => setDay(value)} key={value}>{dateLabel(value, true)}</button>)}</div>
    {actionError && <p className="operations-error" role="alert">{actionError}</p>}
    <div className="student-schedule-list live-student-schedule">{upcoming.map((slot) => {
      const latest = sessions.filter((session) => session.slotId === slot.id).sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))[0]
      const active = latest?.state === 'requested' || latest?.state === 'confirmed' ? latest : null
      return <article className={active?.state ?? slot.state} key={slot.id}><div className="date-tile"><strong>{dateKey(slot.startAt).slice(-2)}</strong><small>{new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(slot.startAt)).replace('.', '').toUpperCase()}</small></div><div><Eyebrow>{timeLabel(slot.startAt)} · {modeLabels[slot.mode]} · {slot.durationMinutes} MIN</Eyebrow><h3>{active?.state === 'confirmed' ? 'Sessão confirmada' : active?.state === 'requested' ? 'Aguardando confirmação' : slot.state === 'full' ? 'Horário lotado' : 'Horário disponível'}</h3><p>{slot.place} · capacidade {slot.capacity}</p></div>{active ? <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void cancel(active)}>{busy === `cancel-own-session-${active.id}` ? <LoaderCircle className="spin" size={15} /> : <X size={15} />} {active.state === 'confirmed' ? 'Cancelar sessão' : 'Cancelar pedido'}</Button> : slot.state === 'open' ? <Button disabled={Boolean(busy)} onClick={() => void request(slot)}>{busy === `request-slot-${slot.id}` ? <LoaderCircle className="spin" size={15} /> : <CalendarCheck size={15} />} Solicitar</Button> : <span className="tag warning">Sem vagas</span>}</article>
    })}</div>
    {!upcoming.length && <div className="empty-state"><CalendarDays size={28} /><h3>Nenhum horário neste filtro.</h3><p>Novas disponibilidades aparecem aqui assim que seu professor publicar.</p><Button variant="secondary" onClick={() => setDay('all')}>Ver todos</Button></div>}
  </div>
}

export function LiveMessagesScreen() {
  const { profile, membership } = useAuth()
  const { messageSessionDrafts, selectedStudentId, setMessageSessionDrafts, setSelectedStudentId, notify } = useEloApp()
  const isTrainer = profile?.accountRole === 'trainer'
  const [students, setStudents] = useState<EnrolledStudent[]>([])
  const [activeId, setActiveId] = useState(isTrainer ? '' : profile?.id ?? '')
  const [rosterReady, setRosterReady] = useState(!isTrainer)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [sendError, setSendError] = useState('')
  const selectedStudentRef = useRef(selectedStudentId)
  const rosterRequest = useRef(0)
  const threadRequestVersion = useRef(0)
  const threadSubjectVersion = useRef(0)
  const olderRequestVersion = useRef(0)
  const sendRequestVersion = useRef(0)

  useEffect(() => { selectedStudentRef.current = selectedStudentId }, [selectedStudentId])

  const loadRoster = useCallback(async () => {
    if (!isTrainer) return
    const request = ++rosterRequest.current
    setRosterReady(false)
    setPhase('loading')
    setError('')
    try {
      const roster = await listEnrolledStudents()
      if (request !== rosterRequest.current) return
      setStudents(roster)
      const preferred = selectedStudentRef.current
      const resolved = roster.some((student) => student.userId === preferred) ? preferred : roster[0]?.userId ?? ''
      setActiveId(resolved)
      setSelectedStudentId(resolved)
      setRosterReady(true)
    } catch (cause) {
      if (request !== rosterRequest.current) return
      setError(errorMessage(cause, 'Não foi possível carregar suas conversas.'))
      setPhase('error')
    }
  }, [isTrainer, setSelectedStudentId])

  useEffect(() => {
    void loadRoster()
    return () => { rosterRequest.current += 1 }
  }, [loadRoster])

  const loadThread = useCallback(async (quiet = false) => {
    const requestVersion = ++threadRequestVersion.current
    if (isTrainer && !rosterReady) return
    if (isTrainer && !activeId) {
      setMessages([]); setNextOffset(null); setPhase('ready'); return
    }
    if (!quiet) {
      olderRequestVersion.current += 1
      setLoadingOlder(false)
      setPhase('loading')
      setError('')
    }
    try {
      const page = await createOperationsService().listThreadMessages({
        studentUserId: isTrainer ? activeId : undefined,
        limit: 50,
      })
      if (requestVersion !== threadRequestVersion.current) return
      setMessages((current) => quiet ? mergeMessages(current, page.items) : page.items)
      setNextOffset((current) => {
        if (!quiet) return page.nextOffset
        if (current === null) return page.nextOffset
        if (page.nextOffset === null) return current
        return Math.max(current, page.nextOffset)
      })
      setThreadError('')
      setPhase('ready')
    } catch (cause) {
      if (requestVersion !== threadRequestVersion.current) return
      const message = errorMessage(cause, 'Não foi possível abrir esta conversa.')
      if (quiet) {
        setThreadError(message)
        return
      }
      setError(message)
      setPhase('error')
    }
  }, [activeId, isTrainer, rosterReady])

  useEffect(() => {
    void loadThread()
    return () => { threadRequestVersion.current += 1 }
  }, [loadThread])
  useEffect(() => {
    if (phase !== 'ready') return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadThread(true)
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [loadThread, phase])
  useEffect(() => () => {
    threadSubjectVersion.current += 1
    olderRequestVersion.current += 1
    sendRequestVersion.current += 1
  }, [])

  const selectConversation = (id: string) => {
    if (sending || id === activeId) return
    threadRequestVersion.current += 1
    threadSubjectVersion.current += 1
    olderRequestVersion.current += 1
    sendRequestVersion.current += 1
    setActiveId(id); setSelectedStudentId(id); setMessages([]); setNextOffset(null); setLoadingOlder(false); setThreadError(''); setSendError('')
  }
  const activeStudent = students.find((student) => student.userId === activeId) ?? null
  const conversations = students.filter((student) => student.displayName.toLowerCase().includes(search.trim().toLowerCase()))
  const shownMessages = [...messages].reverse()
  const draftOwnerId = isTrainer ? activeId : profile?.id ?? ''
  const draftEntry = messageSessionDrafts[draftOwnerId]
  const draft = draftEntry?.body ?? ''

  const loadOlder = async () => {
    if (nextOffset === null || loadingOlder) return
    const subjectVersion = threadSubjectVersion.current
    const olderVersion = ++olderRequestVersion.current
    const studentUserId = isTrainer ? activeId : undefined
    const offset = nextOffset
    setLoadingOlder(true)
    setThreadError('')
    try {
      const page = await createOperationsService().listThreadMessages({
        studentUserId,
        limit: 50,
        offset,
      })
      if (subjectVersion !== threadSubjectVersion.current || olderVersion !== olderRequestVersion.current) return
      setMessages((current) => mergeMessages(current, page.items))
      setNextOffset(page.nextOffset)
    } catch (cause) {
      if (subjectVersion !== threadSubjectVersion.current || olderVersion !== olderRequestVersion.current) return
      setThreadError(errorMessage(cause, 'Não foi possível carregar as mensagens anteriores.'))
    } finally {
      if (subjectVersion === threadSubjectVersion.current && olderVersion === olderRequestVersion.current) setLoadingOlder(false)
    }
  }

  const send = async () => {
    const body = draft.trim().replace(/\s+/g, ' ')
    if (!body || !draftOwnerId || sending || (isTrainer && !activeId)) return
    const requestVersion = ++sendRequestVersion.current
    const studentUserId = activeId
    const draftSnapshot = draft
    const recipientName = isTrainer ? activeStudent?.displayName ?? 'aluno vinculado' : membership?.trainerName ?? 'seu professor'
    const idempotencyKey = draftEntry?.idempotencyKey || createIdempotencyKey('thread-message')
    setMessageSessionDrafts((current) => {
      const currentDraft = current[draftOwnerId]
      if (!currentDraft || currentDraft.body !== draftSnapshot) return current
      return { ...current, [draftOwnerId]: { body: currentDraft.body, idempotencyKey } }
    })
    setSending(true); setSendError('')
    try {
      const service = createOperationsService()
      const created = isTrainer
        ? await service.sendTrainerThreadMessage({ studentUserId, body, idempotencyKey })
        : await service.sendStudentThreadMessage({ body, idempotencyKey })
      setMessageSessionDrafts((current) => {
        const currentDraft = current[draftOwnerId]
        if (!currentDraft || currentDraft.body !== draftSnapshot || currentDraft.idempotencyKey !== idempotencyKey) return current
        const next = { ...current }
        delete next[draftOwnerId]
        return next
      })
      if (requestVersion !== sendRequestVersion.current) {
        notify('Mensagem enviada', `A mensagem para ${recipientName} foi confirmada; qualquer rascunho mais novo foi preservado.`)
        return
      }
      setMessages((current) => mergeMessages(current, [created]))
    } catch (cause) {
      const message = errorMessage(cause, 'Não foi possível enviar esta mensagem.')
      if (requestVersion !== sendRequestVersion.current) {
        notify('Mensagem não enviada', `${recipientName}: ${message}`)
        return
      }
      setSendError(message)
    } finally {
      if (requestVersion === sendRequestVersion.current) setSending(false)
    }
  }

  if (phase === 'loading') return <OperationsLoading copy="Abrindo o canal profissional..." />
  if (phase === 'error') return <OperationsError copy={error} onRetry={() => void (isTrainer && !rosterReady ? loadRoster() : loadThread())} />
  if (isTrainer && students.length === 0) return <div className="page centered-page enter"><div className="empty-state"><MessageCircle size={28} /><h3>Nenhuma conversa ainda.</h3><p>Convide um aluno para abrir um canal profissional privado.</p></div></div>

  const counterpartName = isTrainer ? activeStudent?.displayName ?? 'Aluno vinculado' : membership?.trainerName ?? 'Seu professor'
  return <div className="page message-page enter live-operations-page">
    <PageIntro eyebrow="CONVERSAS · CANAL PROFISSIONAL" title="O contexto fica junto." copy={isTrainer ? 'Mensagens ligadas ao vínculo de cada aluno.' : `Sua conversa privada com ${counterpartName}, dentro do acompanhamento.`} action={<button type="button" className="text-link" disabled={sending} onClick={() => void loadThread()}><RefreshCw size={15} /> Atualizar</button>} />
    <section className={`messenger ${isTrainer ? '' : 'student-thread-only'}`}>
      {isTrainer && <aside className="conversation-list">
        <label className="search-field"><Search size={16} /><span className="sr-only">Buscar conversa</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversa" /></label>
        {conversations.map((student) => <button type="button" disabled={sending} className={student.userId === activeId ? 'active' : ''} key={student.userId} onClick={() => selectConversation(student.userId)}><span className="person-avatar">{initials(student.displayName)}</span><span><strong>{student.displayName}</strong><small>{student.userId === activeId ? messages[0]?.body ?? 'Canal aberto' : 'Abrir conversa'}</small></span></button>)}
      </aside>}
      {isTrainer && <label className="mobile-conversation-picker"><span>Conversa</span><select value={activeId} disabled={sending} onChange={(event) => selectConversation(event.target.value)}>{students.map((student) => <option value={student.userId} key={student.userId}>{student.displayName}</option>)}</select></label>}
      <div className="thread">
        <header><span className="person-avatar">{initials(counterpartName)}</span><div><strong>{counterpartName}</strong><small><i /> vínculo ativo e privado</small></div><button type="button" aria-label="Informações da conversa" onClick={() => notify('Canal profissional', 'As mensagens ficam vinculadas ao workspace e só podem ser lidas pelas pessoas autorizadas.')}><MoreHorizontal /></button></header>
        <div className="message-history" aria-live="polite">
          {nextOffset !== null && <button type="button" className="load-older" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? <><LoaderCircle className="spin" size={14} /> Carregando...</> : 'Carregar anteriores'}</button>}
          {shownMessages.map((message) => <div className={message.senderUserId === profile?.id ? 'message mine' : 'message'} key={message.id}><p>{message.body}</p><time>{dateTimeLabel(message.createdAt)}</time></div>)}
          {!shownMessages.length && <div className="thread-empty"><MessageCircle size={24} /><strong>O canal está aberto.</strong><small>Envie a primeira mensagem necessária para o acompanhamento.</small></div>}
        </div>
        {threadError && <p className="operations-error thread-error" role="alert">{threadError}</p>}
        {sendError && <p className="operations-error thread-error" role="alert">{sendError}</p>}
        <form className="message-composer" onSubmit={(event) => { event.preventDefault(); void send() }}>
          <label><span className="sr-only">Mensagem</span><textarea maxLength={1000} value={draft} disabled={sending} onChange={(event) => {
            if (sending || !draftOwnerId) return
            const body = event.target.value.replace(/[\r\n]+/g, ' ')
            setSendError('')
            setMessageSessionDrafts((current) => {
              const next = { ...current }
              if (!body) delete next[draftOwnerId]
              else next[draftOwnerId] = { body, idempotencyKey: '' }
              return next
            })
          }} placeholder={`Escreva para ${counterpartName.split(/\s+/)[0]}...`} rows={1} /></label>
          <button type="submit" disabled={!draft.trim() || sending} aria-label="Enviar mensagem">{sending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</button>
        </form>
      </div>
    </section>
  </div>
}

export function LiveStudentAbsenceFlow({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { membership } = useAuth()
  const { notify } = useEloApp()
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [session, setSession] = useState<ScheduleSession | null>(null)
  const [slot, setSlot] = useState<ScheduleSlot | null>(null)
  const [saving, setSaving] = useState(false)
  const key = useRef('')

  const load = useCallback(async () => {
    setPhase('loading'); setError('')
    try {
      const service = createOperationsService()
      const [slotPage, sessionPage] = await Promise.all([
        service.listScheduleSlots({ limit: 50 }),
        service.listScheduleSessions({ limit: 50 }),
      ])
      const slotMap = new Map(slotPage.items.map((item) => [item.id, item]))
      const next = sessionPage.items.filter((item) => item.state === 'confirmed' || item.state === 'requested')
        .map((item) => ({ session: item, slot: slotMap.get(item.slotId) }))
        .filter((item): item is { session: ScheduleSession; slot: ScheduleSlot } => item.slot !== undefined && Date.parse(item.slot.startAt) > Date.now())
        .sort((a, b) => Date.parse(a.slot.startAt) - Date.parse(b.slot.startAt))[0]
      setSession(next?.session ?? null); setSlot(next?.slot ?? null); setPhase('ready')
    } catch (cause) {
      setError(errorMessage(cause, 'Não foi possível localizar sua próxima sessão.'))
      setPhase('error')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const cancel = async () => {
    if (!session || saving) return
    setSaving(true); setError('')
    try {
      const idempotencyKey = key.current || createIdempotencyKey('absence-cancel-session')
      key.current = idempotencyKey
      await createOperationsService().cancelOwnScheduleSession({ sessionId: session.id, idempotencyKey })
      key.current = ''
      notify('Seu professor foi avisado', 'A sessão foi cancelada na agenda compartilhada; escolha outro horário quando puder.')
      onDone()
    } catch (cause) {
      setError(errorMessage(cause, 'Não foi possível cancelar sua sessão.'))
    } finally { setSaving(false) }
  }

  if (phase === 'loading') return <section className="assistant-flow"><div className="live-loading"><LoaderCircle className="spin" size={22} /><p>Localizando sua próxima sessão...</p></div></section>
  return <section className="assistant-flow"><button type="button" className="back-button" onClick={onBack}><ArrowRight size={15} style={{ transform: 'rotate(180deg)' }} /> Voltar</button><div className="absence-card"><CalendarDays size={29} /><Eyebrow>SEM CULPA · COM CONTEXTO</Eyebrow>{phase === 'error' ? <><h3>A agenda não abriu agora.</h3><p>{error}</p><div><Button onClick={() => void load()}>Tentar novamente</Button><Button variant="ghost" onClick={onBack}>Voltar</Button></div></> : session && slot ? <><h3>Cancelar sua próxima sessão?</h3><p>{dateTimeLabel(slot.startAt)} · {modeLabels[slot.mode]} · {slot.place}. O cancelamento fica visível para {membership?.trainerName ?? 'seu professor'} e libera a capacidade do horário.</p>{error && <p className="operations-error" role="alert">{error}</p>}<div><Button disabled={saving} onClick={() => void cancel()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Avisar e cancelar</Button><Button variant="ghost" onClick={onBack}>Manter sessão</Button></div></> : <><h3>Nenhuma sessão ativa para cancelar.</h3><p>Você não tem pedido aguardando confirmação nem sessão futura reservada.</p><div><Button onClick={onDone}>Ver agenda</Button><Button variant="ghost" onClick={onBack}>Voltar</Button></div></>}</div></section>
}

function OperationsLoading({ copy }: { copy: string }) {
  return <div className="page enter"><div className="live-loading"><LoaderCircle className="spin" size={24} /><p>{copy}</p></div></div>
}

function OperationsError({ copy, onRetry }: { copy: string; onRetry: () => void }) {
  return <div className="page enter"><div className="empty-state"><ShieldCheck size={29} /><h3>Este contexto não abriu agora.</h3><p>{copy}</p><Button variant="secondary" onClick={onRetry}>Tentar novamente</Button></div></div>
}
