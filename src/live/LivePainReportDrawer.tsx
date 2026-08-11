import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Check, CheckCircle2, HeartPulse, LoaderCircle, MessageCircle,
  RefreshCw, ShieldCheck, Sparkles,
} from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { Button, Drawer, Eyebrow } from '../components'
import {
  createIdempotencyKey, createSignalService, MAX_SIGNAL_PAGE_SIZE, type PainReport,
  type PainReportEvent, type PainReportLifecycleStatus, type PainReportLifecycleSummary,
} from '../signals'
import './live.css'

type Phase = 'loading' | 'ready' | 'error'
type Action = 'acknowledged' | 'resolved'

type Props = {
  report: PainReportLifecycleSummary
  studentName: string
  onClose: () => void
  onChanged: () => Promise<void> | void
  onOpenCopilot?: () => void
}

const statusLabels: Record<PainReportLifecycleStatus, string> = {
  open: 'Aguardando revisão',
  acknowledged: 'Em acompanhamento',
  resolved: 'Resolvido',
}

const sideLabels: Record<PainReport['side'], string> = {
  left: 'Lado esquerdo',
  right: 'Lado direito',
  bilateral: 'Ambos os lados',
  midline: 'Linha central',
  not_applicable: 'Sem lado específico',
}

const timingLabels: Record<PainReport['timing'], string> = {
  before_activity: 'Antes da atividade',
  during_activity: 'Durante a atividade',
  after_activity: 'Após a atividade',
  at_rest: 'Em repouso',
  constant: 'Constante',
}

function timeLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'registro recente'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function redFlagLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function lifecycleFrom(report: PainReportLifecycleSummary, events: PainReportEvent[]) {
  if (events.some((event) => event.action === 'resolved')) return 'resolved' as const
  if (events.some((event) => event.action === 'acknowledged')) return 'acknowledged' as const
  return report.status
}

export function LivePainReportDrawer({ report, studentName, onClose, onChanged, onOpenCopilot }: Props) {
  const { membership, profile } = useAuth()
  const authorized = profile?.accountRole === 'trainer'
    && membership?.membershipRole !== 'student'
    && membership?.workspaceId === report.workspaceId
  const identity = authorized
    ? `${membership.workspaceId}:${profile.id}:${report.studentUserId}:${report.id}`
    : ''
  const activeIdentityRef = useRef(identity)
  activeIdentityRef.current = identity
  const [detail, setDetail] = useState<PainReport | null>(null)
  const [events, setEvents] = useState<PainReportEvent[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [loadedIdentity, setLoadedIdentity] = useState('')
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const [pending, setPending] = useState<Action | null>(null)
  const loadRequestVersion = useRef(0)
  const actionRequestVersion = useRef(0)
  const actionGuard = useRef(false)
  const acknowledgementIntent = useRef<{ reportId: string; key: string } | null>(null)
  const resolutionIntent = useRef<{ reportId: string; note: string; key: string } | null>(null)

  const clearSensitiveState = useCallback(() => {
    setDetail(null)
    setEvents([])
    setLoadedIdentity('')
  }, [])

  const load = useCallback(async () => {
    const requestVersion = ++loadRequestVersion.current
    const requestIdentity = identity
    clearSensitiveState()
    setLoadError('')
    setPhase('loading')
    if (!authorized || !requestIdentity) return
    try {
      const service = createSignalService()
      const [nextDetail, timeline] = await Promise.all([
        service.getPainReport(report.id),
        service.listPainReportTimeline(report.id, { limit: MAX_SIGNAL_PAGE_SIZE }),
      ])
      if (requestVersion !== loadRequestVersion.current || requestIdentity !== activeIdentityRef.current) return
      if (
        !nextDetail
        || nextDetail.workspaceId !== report.workspaceId
        || nextDetail.studentUserId !== report.studentUserId
        || timeline.items.some((event) =>
          event.workspaceId !== report.workspaceId || event.studentUserId !== report.studentUserId)
      ) throw new Error('O relato não está disponível neste vínculo.')
      setDetail(nextDetail)
      setEvents(timeline.items)
      setLoadedIdentity(requestIdentity)
      setPhase('ready')
    } catch (cause) {
      if (requestVersion !== loadRequestVersion.current || requestIdentity !== activeIdentityRef.current) return
      setPhase('error')
      setLoadError(cause instanceof Error ? cause.message : 'Não foi possível carregar o relato.')
    }
  }, [authorized, clearSensitiveState, identity, report.id, report.studentUserId, report.workspaceId])

  useEffect(() => {
    actionRequestVersion.current += 1
    actionGuard.current = false
    acknowledgementIntent.current = null
    resolutionIntent.current = null
    setResolutionNote('')
    setActionError('')
    setPending(null)
    void load()
    return () => {
      loadRequestVersion.current += 1
      actionRequestVersion.current += 1
      actionGuard.current = false
    }
  }, [identity, load])

  const status = useMemo(() => lifecycleFrom(report, events), [events, report])
  const resolutionEvent = useMemo(
    () => [...events].reverse().find((event) => event.action === 'resolved') ?? null,
    [events],
  )

  const runAction = async (action: Action) => {
    if (!authorized || !identity || pending || actionGuard.current || status === 'resolved') return
    const normalizedNote = resolutionNote.trim()
    if (action === 'resolved' && !normalizedNote) {
      setActionError('Explique ao aluno como este relato foi encerrado.')
      return
    }
    actionGuard.current = true
    const requestVersion = ++actionRequestVersion.current
    const requestIdentity = identity
    const intent = action === 'acknowledged'
      ? acknowledgementIntent.current?.reportId === report.id
        ? acknowledgementIntent.current
        : { reportId: report.id, key: createIdempotencyKey('pain-acknowledge') }
      : resolutionIntent.current?.reportId === report.id && resolutionIntent.current.note === normalizedNote
        ? resolutionIntent.current
        : { reportId: report.id, note: normalizedNote, key: createIdempotencyKey('pain-resolve') }
    if (action === 'acknowledged') acknowledgementIntent.current = intent
    else resolutionIntent.current = intent as { reportId: string; note: string; key: string }
    setPending(action)
    setActionError('')
    try {
      const service = createSignalService()
      if (action === 'acknowledged') {
        await service.acknowledgePainReport({
          painReportId: report.id,
          idempotencyKey: intent.key,
        })
      } else {
        await service.resolvePainReport({
          painReportId: report.id,
          resolutionNote: normalizedNote,
          idempotencyKey: intent.key,
        })
      }
      if (requestVersion !== actionRequestVersion.current || requestIdentity !== activeIdentityRef.current) return
      if (action === 'acknowledged') acknowledgementIntent.current = null
      else resolutionIntent.current = null
      await load()
      if (requestVersion !== actionRequestVersion.current || requestIdentity !== activeIdentityRef.current) return
      await onChanged()
    } catch (cause) {
      if (requestVersion !== actionRequestVersion.current || requestIdentity !== activeIdentityRef.current) return
      const message = cause instanceof Error ? cause.message : 'Não foi possível atualizar o relato.'
      setActionError(message)
      if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'lifecycle_conflict') {
        await load()
        if (requestVersion === actionRequestVersion.current && requestIdentity === activeIdentityRef.current) await onChanged()
      }
    } finally {
      if (requestVersion === actionRequestVersion.current && requestIdentity === activeIdentityRef.current) {
        setPending(null)
        actionGuard.current = false
      }
    }
  }

  const changeResolutionNote = (value: string) => {
    if (pending) return
    const next = value.slice(0, 1000)
    if (resolutionIntent.current?.note !== next.trim()) resolutionIntent.current = null
    setResolutionNote(next)
    setActionError('')
  }

  const guardedClose = () => { if (!pending) onClose() }

  if (!authorized) return <Drawer title="Relato indisponível" eyebrow="ÁREA PROFISSIONAL PROTEGIDA" onClose={guardedClose}><div className="pain-review-unavailable"><ShieldCheck size={27} /><p>Entre com uma conta profissional vinculada a este espaço para revisar o relato.</p></div></Drawer>

  return <Drawer title={`Relato de ${studentName}`} eyebrow={`SINAL DE SAÚDE · ${statusLabels[status].toUpperCase()}`} onClose={guardedClose}>
    <div className="pain-review" aria-busy={phase === 'loading' || Boolean(pending)}>
      {phase === 'loading' || loadedIdentity !== identity ? <div className="live-loading"><LoaderCircle className="spin" size={22} /><p>Carregando fonte e histórico...</p></div> : null}
      {phase === 'error' && <div className="pain-review-error"><ShieldCheck size={22} /><p>{loadError}</p><Button variant="secondary" onClick={() => void load()}><RefreshCw size={15} /> Tentar novamente</Button></div>}
      {phase === 'ready' && loadedIdentity === identity && detail && <>
        <header className={`pain-review-status ${status}`}><span><HeartPulse size={19} /></span><div><small>ESTADO DO RELATO</small><strong>{statusLabels[status]}</strong></div><b>{detail.intensity}/10</b></header>
        <section className="pain-review-source"><Eyebrow>FONTE IMUTÁVEL · {timeLabel(detail.createdAt)}</Eyebrow><h3>{detail.region}</h3><p>{detail.movement}</p><div><span><small>Lado</small><strong>{sideLabels[detail.side]}</strong></span><span><small>Momento</small><strong>{timingLabels[detail.timing]}</strong></span><span><small>Início informado</small><strong>{timeLabel(detail.onset)}</strong></span></div>{detail.detail && <blockquote><MessageCircle size={15} /><span><small>DETALHE DO ALUNO</small>{detail.detail}</span></blockquote>}</section>
        {detail.redFlags.length > 0 && <section className="pain-review-flags"><AlertTriangle size={18} /><div><Eyebrow>SINAIS ESTRUTURADOS</Eyebrow>{detail.redFlags.map((flag) => <span key={flag}>{redFlagLabel(flag)}</span>)}</div></section>}
        <section className="pain-review-timeline"><Eyebrow>HISTÓRICO DO RELATO</Eyebrow><article><span><HeartPulse size={14} /></span><div><strong>Relato recebido</strong><small>{timeLabel(detail.createdAt)} · fonte: aluno</small></div></article>{events.map((event) => <article key={event.id}><span>{event.action === 'resolved' ? <CheckCircle2 size={14} /> : <Check size={14} />}</span><div><strong>{event.action === 'resolved' ? 'Relato resolvido' : 'Revisão confirmada'}</strong><small>{timeLabel(event.createdAt)} · atualização profissional</small>{event.note && <p>{event.note}<em>Visível ao aluno</em></p>}</div></article>)}</section>
        {status !== 'resolved' && <section className="pain-review-actions"><Eyebrow>DECISÃO PROFISSIONAL · NADA É AUTOMÁTICO</Eyebrow>{status === 'open' && <Button variant="secondary" disabled={Boolean(pending)} onClick={() => void runAction('acknowledged')}>{pending === 'acknowledged' ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Marcar como revisado</Button>}<label><span>Retorno de resolução para {studentName}</span><textarea value={resolutionNote} disabled={Boolean(pending)} onChange={(event) => changeResolutionNote(event.target.value)} placeholder="Ex.: Revisei seu relato; vamos adaptar o treino e acompanhar a resposta..." /><small>Este texto entra no histórico protegido e fica visível ao aluno. Não é uma nota privada.</small></label>{actionError && <p className="form-error" role="alert">{actionError}</p>}<Button disabled={Boolean(pending) || !resolutionNote.trim()} onClick={() => void runAction('resolved')}>{pending === 'resolved' ? <LoaderCircle className="spin" size={15} /> : <CheckCircle2 size={15} />} Resolver e avisar o aluno</Button></section>}
        {status === 'resolved' && <section className="pain-review-resolved"><CheckCircle2 size={20} /><div><strong>Ciclo encerrado</strong><p>{resolutionEvent?.note ?? report.resolutionNote}</p><small>Retorno visível ao aluno.</small></div></section>}
        <p className="pain-review-boundary"><ShieldCheck size={14} /> O Elo organiza o acompanhamento; sinais de urgência exigem avaliação pelos serviços de saúde adequados.</p>
        {onOpenCopilot && <Button className="wide" variant="secondary" disabled={Boolean(pending)} onClick={onOpenCopilot}><Sparkles size={15} /> Abrir este contexto no Copiloto</Button>}
      </>}
    </div>
  </Drawer>
}
