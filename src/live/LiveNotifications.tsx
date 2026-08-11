import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  Bell, CalendarClock, CheckCheck, Dumbbell, FileCheck2, HeartPulse, LoaderCircle,
  MessageCircle, RefreshCw, Salad, ShieldCheck,
} from 'lucide-react'
import { Button, Drawer } from '../components'
import { useEloApp } from '../app-state'
import {
  createNotificationService,
  type NotificationItem,
  type NotificationKind,
} from './notifications'
import './live-notifications.css'

type Phase = 'loading' | 'ready' | 'error'

const kindIcons: Record<NotificationKind, ComponentType<{ size?: number }>> = {
  pain_report: HeartPulse,
  schedule_request: CalendarClock,
  anamnesis_submission: FileCheck2,
  workout_completion: Dumbbell,
  message: MessageCircle,
  workout: Dumbbell,
  anamnesis: FileCheck2,
  schedule: CalendarClock,
  nutrition: Salad,
  pain_update: HeartPulse,
}

function occurredLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Atualização recente'
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000))
  if (elapsedMinutes < 1) return 'Agora'
  if (elapsedMinutes < 60) return `Há ${elapsedMinutes} min`
  if (elapsedMinutes < 24 * 60) return `Há ${Math.floor(elapsedMinutes / 60)} h`
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date).replace('.', '')
}

export function LiveNotificationsButton() {
  const { navigate, notify, setSelectedStudentId } = useEloApp()
  const service = useMemo(() => createNotificationService(), [])
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [markingAll, setMarkingAll] = useState(false)
  const loadVersion = useRef(0)
  const unread = items.filter((item) => !item.isRead)

  const load = useCallback(async (showLoading = true) => {
    const version = ++loadVersion.current
    if (showLoading) setPhase('loading')
    setError('')
    try {
      const next = await service.listNotifications(20)
      if (version !== loadVersion.current) return
      setItems(next)
      setPhase('ready')
    } catch (cause) {
      if (version !== loadVersion.current) return
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as atualizações agora.')
      setPhase('error')
    }
  }, [service])

  useEffect(() => {
    void load(false)
    return () => { loadVersion.current += 1 }
  }, [load])

  const openDrawer = () => {
    setOpen(true)
    void load(items.length === 0)
  }

  const openItem = (item: NotificationItem) => {
    if (!item.isRead) {
      loadVersion.current += 1
      setItems((current) => current.map((candidate) => candidate.itemKey === item.itemKey ? { ...candidate, isRead: true } : candidate))
      void service.markRead([item.itemKey]).then(() => {
        setItems((current) => current.map((candidate) => candidate.itemKey === item.itemKey ? { ...candidate, isRead: true } : candidate))
      }).catch(() => {
        setItems((current) => current.map((candidate) => candidate.itemKey === item.itemKey ? { ...candidate, isRead: false } : candidate))
        notify('Leitura não confirmada', 'A atualização continuará marcada como nova até o recibo ser salvo.')
      })
    }
    if (item.studentUserId) setSelectedStudentId(item.studentUserId)
    setOpen(false)
    navigate(item.targetPage)
  }

  const markAll = async () => {
    if (!unread.length || markingAll) return
    loadVersion.current += 1
    setMarkingAll(true)
    setError('')
    try {
      await service.markRead(unread.map((item) => item.itemKey))
      setItems((current) => current.map((item) => ({ ...item, isRead: true })))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar os recibos agora.')
    } finally {
      setMarkingAll(false)
    }
  }

  return <>
    <button type="button" className="icon-button" onClick={openDrawer} aria-label={unread.length ? `Abrir atualizações, ${unread.length} novas` : 'Abrir atualizações'}><Bell size={19} />{unread.length > 0 && <i />}</button>
    {open && <Drawer title="O que mudou" eyebrow="ATUALIZAÇÕES" onClose={() => setOpen(false)}>
      <div className="live-notification-toolbar"><p>{unread.length ? `${unread.length} ${unread.length === 1 ? 'atualização nova' : 'atualizações novas'}` : 'Nenhuma atualização nova'}</p><button type="button" onClick={() => void load()} disabled={phase === 'loading'} aria-label="Atualizar feed"><RefreshCw className={phase === 'loading' ? 'spin' : ''} size={15} /></button></div>
      {unread.length > 0 && <Button variant="secondary" className="live-mark-all" disabled={markingAll} onClick={() => void markAll()}>{markingAll ? <LoaderCircle className="spin" size={15} /> : <CheckCheck size={15} />} Marcar todas como lidas</Button>}
      {error && <p className="live-notification-error" role="alert">{error}</p>}
      {phase === 'loading' && !items.length && <div className="live-notification-state" aria-live="polite"><LoaderCircle className="spin" size={22} /><p>Buscando atualizações do seu workspace...</p></div>}
      {phase === 'error' && !items.length && <div className="live-notification-state"><ShieldCheck size={24} /><p>O feed não abriu agora.</p><Button variant="secondary" onClick={() => void load()}>Tentar novamente</Button></div>}
      {phase === 'ready' && !items.length && <div className="live-notification-state"><CheckCheck size={25} /><p>Tudo em dia por aqui.</p><small>Novos eventos aparecerão neste espaço.</small></div>}
      {items.length > 0 && <div className="notification-list live-notification-list" aria-live="polite">{items.map((item) => { const Icon = kindIcons[item.kind]; return <button type="button" className={item.isRead ? 'read' : 'unread'} key={item.itemKey} onClick={() => openItem(item)}><span className={`live-notification-icon priority-${item.priority}`}><Icon size={17} /></span><span><span className="live-notification-title"><strong>{item.title}</strong>{!item.isRead && <b>NOVA</b>}</span><small>{item.detail}</small><time>{occurredLabel(item.occurredAt)}</time></span></button> })}</div>}
      <p className="live-notification-footnote">O feed vem dos registros do Elo. “Nova” significa que ainda não há recibo de leitura nesta conta.</p>
    </Drawer>}
  </>
}
