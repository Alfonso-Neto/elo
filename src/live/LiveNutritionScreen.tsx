import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeCheck, Check, Circle, Info, LoaderCircle, LockKeyhole, MessageCircle,
  Minus, Plus, RefreshCw, Salad, ShieldCheck, Waves,
} from 'lucide-react'
import { Button, Eyebrow, Modal, PageIntro, Progress, SectionTitle } from '../components'
import { usePrototype } from '../prototype-context'
import { createIdempotencyKey } from '../signals'
import {
  createNutritionService,
  deriveCompletedMealIds,
  latestHydrationTotal,
  type NutritionDashboard,
  type NutritionMeal,
} from './nutrition'
import './live-nutrition.css'

type LoadPhase = 'loading' | 'ready' | 'error'
type ConsentAction = 'granted' | 'withdrawn'
type PendingMeal = { action: 'completed' | 'uncompleted'; key: string }

export type NutritionTotals = {
  proteinG: number
  carbsG: number
  fatG: number
  kcal: number
}

const emptyTotals = (): NutritionTotals => ({ proteinG: 0, carbsG: 0, fatG: 0, kcal: 0 })

export function sumNutritionMeals(meals: NutritionMeal[], selected?: Set<string>) {
  return meals.reduce((totals, meal) => {
    if (selected && !selected.has(meal.id)) return totals
    return {
      proteinG: totals.proteinG + meal.proteinG,
      carbsG: totals.carbsG + meal.carbsG,
      fatG: totals.fatG + meal.fatG,
      kcal: totals.kcal + meal.kcal,
    }
  }, emptyTotals())
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)
}

function ratio(value: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function NutritionLoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="empty-state nutrition-load-failure"><ShieldCheck size={29} /><h3>Seu plano não abriu agora.</h3><p>{message}</p><Button variant="secondary" onClick={onRetry}><RefreshCw size={15} /> Tentar novamente</Button></div>
}

function ConsentPanel({
  withdrawn,
  acknowledged,
  onAcknowledged,
  onGrant,
  pending,
  error,
}: {
  withdrawn: boolean
  acknowledged: boolean
  onAcknowledged: (value: boolean) => void
  onGrant: () => void
  pending: boolean
  error: string
}) {
  return <section className={`nutrition-consent-panel${withdrawn ? ' withdrawn' : ''}`} aria-labelledby="nutrition-consent-title">
    <span className="nutrition-consent-icon"><LockKeyhole size={24} /></span>
    <div>
      <Eyebrow accent>{withdrawn ? 'COMPARTILHAMENTO PAUSADO' : 'ANTES DE CONECTAR'}</Eyebrow>
      <h3 id="nutrition-consent-title">{withdrawn ? 'Você retirou o consentimento nutricional.' : 'Você decide se o plano pode entrar no Elo.'}</h3>
      <p>{withdrawn
        ? 'Seu histórico continua acessível a você, mas o professor e a integração nutricional não recebem novos dados enquanto o consentimento estiver pausado.'
        : 'Ao autorizar, o Elo poderá receber um plano criado por nutricionista identificado e permitir que a equipe responsável o consulte para coordenar seu acompanhamento. Seu professor não poderá prescrever nem alterar a dieta.'}</p>
      <label className={`nutrition-consent-check${error && !acknowledged ? ' has-error' : ''}`}>
        <input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledged(event.target.checked)} />
        <span><i>{acknowledged && <Check size={13} />}</i>Entendi a finalidade, quem poderá consultar e que posso retirar este consentimento.</span>
      </label>
      {error && <p className="nutrition-action-error" role="alert">{error}</p>}
      <Button onClick={onGrant} disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
        {withdrawn ? 'Autorizar novamente' : 'Autorizar integração nutricional'}
      </Button>
    </div>
  </section>
}

export function LiveNutritionScreen() {
  const { navigate, notify } = usePrototype()
  const service = useMemo(() => createNutritionService(), [])
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [dashboard, setDashboard] = useState<NutritionDashboard | null>(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [consentPending, setConsentPending] = useState(false)
  const [pendingMeals, setPendingMeals] = useState<Set<string>>(new Set())
  const [hydrationPending, setHydrationPending] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const consentCommand = useRef<{ action: ConsentAction; key: string } | null>(null)
  const mealCommands = useRef(new Map<string, PendingMeal>())
  const hydrationCommand = useRef<{ totalMl: number; key: string } | null>(null)

  const load = async () => {
    setPhase('loading')
    setError('')
    try {
      const next = await service.loadDashboard()
      setDashboard(next)
      setPhase('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a nutrição agora.')
      setPhase('error')
    }
  }

  useEffect(() => { void load() }, [])

  const updateConsent = async (action: ConsentAction) => {
    if (consentPending) return
    if (action === 'granted' && !acknowledged) {
      setActionError('Confirme que leu a finalidade antes de autorizar.')
      return
    }
    setConsentPending(true)
    setActionError('')
    try {
      const command = consentCommand.current?.action === action
        ? consentCommand.current
        : { action, key: createIdempotencyKey(action === 'granted' ? 'nutrition-consent' : 'nutrition-withdraw') }
      consentCommand.current = command
      if (action === 'granted') await service.grantConsent(command.key)
      else await service.withdrawConsent(command.key)
      consentCommand.current = null
      setAcknowledged(false)
      setWithdrawOpen(false)
      await load()
      notify(
        action === 'granted' ? 'Integração nutricional autorizada' : 'Consentimento nutricional retirado',
        action === 'granted'
          ? 'O Elo já pode receber um plano de um nutricionista parceiro identificado.'
          : 'Novos registros e o acesso da equipe foram pausados.',
      )
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o consentimento agora.')
    } finally {
      setConsentPending(false)
    }
  }

  const toggleMeal = async (mealId: string, completed: boolean) => {
    if (!dashboard?.plan || dashboard.consent !== 'granted' || pendingMeals.has(mealId)) return
    const action: PendingMeal['action'] = completed ? 'uncompleted' : 'completed'
    setActionError('')
    setPendingMeals((current) => new Set(current).add(mealId))
    try {
      const previous = mealCommands.current.get(mealId)
      const command = previous?.action === action
        ? previous
        : { action, key: createIdempotencyKey(`nutrition-meal-${action}`) }
      mealCommands.current.set(mealId, command)
      const event = await service.recordMealState({
        planVersionId: dashboard.plan.id,
        mealId,
        action,
        idempotencyKey: command.key,
      })
      mealCommands.current.delete(mealId)
      setDashboard((current) => current ? { ...current, mealEvents: [...current.mealEvents, event] } : current)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível registrar a refeição agora.')
    } finally {
      setPendingMeals((current) => {
        const next = new Set(current)
        next.delete(mealId)
        return next
      })
    }
  }

  const changeHydration = async (totalMl: number) => {
    if (!dashboard?.plan || dashboard.consent !== 'granted' || hydrationPending) return
    setActionError('')
    setHydrationPending(true)
    try {
      const bounded = Math.max(0, Math.min(10_000, totalMl))
      const command = hydrationCommand.current?.totalMl === bounded
        ? hydrationCommand.current
        : { totalMl: bounded, key: createIdempotencyKey('nutrition-water') }
      hydrationCommand.current = command
      const event = await service.recordHydrationTotal({
        planVersionId: dashboard.plan.id,
        totalMl: bounded,
        idempotencyKey: command.key,
      })
      hydrationCommand.current = null
      setDashboard((current) => current ? { ...current, hydrationEvents: [...current.hydrationEvents, event] } : current)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível registrar a água agora.')
    } finally {
      setHydrationPending(false)
    }
  }

  if (phase === 'loading') return <div className="page enter"><div className="live-loading"><LoaderCircle className="spin" size={24} /><p>Conferindo plano e consentimento...</p></div></div>
  if (phase === 'error' || !dashboard) return <div className="page enter"><NutritionLoadFailure message={error} onRetry={() => void load()} /></div>

  const { plan } = dashboard
  if (!plan) return <div className="page nutrition-page live-nutrition-page enter">
    <PageIntro eyebrow="NUTRIÇÃO · INTEGRAÇÃO PROFISSIONAL" title={<>Seu plano, vindo de<br />quem pode prescrever.</>} copy="O Elo organiza treino e nutrição no mesmo contexto sem transferir ao professor uma atribuição que é do nutricionista." action={<div className="nutrition-author nutrition-status"><span><Salad size={18} /></span><div><strong>{dashboard.consent === 'granted' ? 'Conexão autorizada' : 'Conexão protegida'}</strong><small>{dashboard.consent === 'granted' ? 'Aguardando plano parceiro' : 'Consentimento necessário'}</small></div></div>} />
    {dashboard.consent !== 'granted' ? <ConsentPanel withdrawn={dashboard.consent === 'withdrawn'} acknowledged={acknowledged} onAcknowledged={setAcknowledged} onGrant={() => void updateConsent('granted')} pending={consentPending} error={actionError} /> : <section className="nutrition-partner-empty">
      <span><BadgeCheck size={27} /></span><Eyebrow accent>CONEXÃO PRONTA</Eyebrow><h3>Aguardando o plano do nutricionista.</h3><p>Seu consentimento está ativo, mas nenhum plano profissional válido foi recebido. Quando uma integração parceira enviar uma versão assinada com nome e CRN, ela aparecerá aqui.</p>
      {actionError && <p className="nutrition-action-error" role="alert">{actionError}</p>}
      <div><Button variant="secondary" onClick={() => navigate('messages')}><MessageCircle size={16} /> Falar com seu professor</Button><Button variant="ghost" onClick={() => setWithdrawOpen(true)}>Revisar consentimento</Button></div>
    </section>}
    <div className="legal-note nutrition-boundary-note"><Info size={17} /><p>O professor pode coordenar dúvidas, mas não cria, substitui nem altera seu plano alimentar. O Elo não gera dietas por IA.</p></div>
    {withdrawOpen && <Modal title="Pausar a integração nutricional?" eyebrow="CONTROLE DOS SEUS DADOS" onClose={() => setWithdrawOpen(false)} size="small"><div className="nutrition-withdraw-dialog"><p>O acesso da equipe e novos registros serão pausados. Você poderá autorizar novamente depois.</p>{actionError && <p className="nutrition-action-error" role="alert">{actionError}</p>}<div><Button variant="secondary" onClick={() => setWithdrawOpen(false)}>Manter autorização</Button><Button variant="danger" disabled={consentPending} onClick={() => void updateConsent('withdrawn')}>{consentPending && <LoaderCircle className="spin" size={15} />} Pausar integração</Button></div></div></Modal>}
  </div>

  const completed = deriveCompletedMealIds(dashboard.mealEvents)
  const hydrationMl = latestHydrationTotal(dashboard.hydrationEvents)
  const totals = sumNutritionMeals(plan.meals)
  const consumed = sumNutritionMeals(plan.meals, completed)
  const trackingEnabled = dashboard.consent === 'granted'
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${plan.validUntil}T12:00:00`))

  return <div className="page nutrition-page live-nutrition-page enter">
    <PageIntro eyebrow={`PLANO PROFISSIONAL · VERSÃO ${plan.versionNumber}`} title={<>Nutrição que acompanha<br />o seu treino.</>} copy={`${plan.title} · válido até ${date}. Cada registro diário fica separado da versão imutável do plano.`} action={<div className="nutrition-author"><span>{initials(plan.nutritionistName)}</span><div><strong>{plan.nutritionistName}</strong><small>Nutricionista · {plan.nutritionistCrn}</small></div></div>} />
    {!trackingEnabled && <ConsentPanel withdrawn acknowledged={acknowledged} onAcknowledged={setAcknowledged} onGrant={() => void updateConsent('granted')} pending={consentPending} error={actionError} />}
    <section className="macro-strip" aria-label="Totais planejados e progresso registrado"><div><strong>{formatNumber(totals.proteinG)}g</strong><span>Proteína planejada</span><i style={{ width: `${ratio(consumed.proteinG, totals.proteinG)}%` }} /></div><div><strong>{formatNumber(totals.carbsG)}g</strong><span>Carboidratos planejados</span><i style={{ width: `${ratio(consumed.carbsG, totals.carbsG)}%` }} /></div><div><strong>{formatNumber(totals.fatG)}g</strong><span>Gorduras planejadas</span><i style={{ width: `${ratio(consumed.fatG, totals.fatG)}%` }} /></div><div><strong>{formatNumber(totals.kcal)}</strong><span>kcal planejadas</span><i style={{ width: `${ratio(consumed.kcal, totals.kcal)}%` }} /></div></section>
    {actionError && trackingEnabled && <p className="nutrition-action-error nutrition-page-error" role="alert">{actionError}</p>}
    <div className="nutrition-layout"><section><SectionTitle index="01" title="Refeições" copy={`${completed.size} de ${plan.meals.length} registradas hoje`} /><div className="meal-list">{plan.meals.map((meal) => { const done = completed.has(meal.id); const pending = pendingMeals.has(meal.id); return <article className={done ? 'done' : ''} key={meal.id}><time>{meal.time}</time><button disabled={!trackingEnabled || pending} onClick={() => void toggleMeal(meal.id, done)} aria-pressed={done} aria-label={done ? `Desmarcar ${meal.title}` : `Registrar ${meal.title}`}>{pending ? <LoaderCircle className="spin" size={17} /> : done ? <Check size={17} /> : <Circle size={17} />}</button><div><h3>{meal.title}</h3><p>{meal.description}</p><small>P {formatNumber(meal.proteinG)}g · C {formatNumber(meal.carbsG)}g · G {formatNumber(meal.fatG)}g · {meal.kcal} kcal</small></div></article> })}</div>
      {plan.notes && <div className="nutrition-plan-note"><Eyebrow>ORIENTAÇÃO DA NUTRICIONISTA</Eyebrow><p>{plan.notes}</p></div>}
    </section><aside><div className="water-card"><Waves size={22} /><Eyebrow>ÁGUA · META {formatNumber(plan.hydrationTargetMl)} ML</Eyebrow><strong>{formatNumber(hydrationMl)}<small> ml</small></strong><Progress value={(hydrationMl / plan.hydrationTargetMl) * 100} label="Progresso da meta de água" /><div><button disabled={!trackingEnabled || hydrationPending || hydrationMl === 0} onClick={() => void changeHydration(hydrationMl - 250)} aria-label="Remover 250 mililitros">{hydrationPending ? <LoaderCircle className="spin" size={16} /> : <Minus size={17} />}</button><span>{hydrationMl >= plan.hydrationTargetMl ? 'Meta atingida' : `${formatNumber(plan.hydrationTargetMl - hydrationMl)} ml para a meta`}</span><button disabled={!trackingEnabled || hydrationPending || hydrationMl >= 10_000} onClick={() => void changeHydration(hydrationMl + 250)} aria-label="Adicionar 250 mililitros">{hydrationPending ? <LoaderCircle className="spin" size={16} /> : <Plus size={17} />}</button></div></div><div className="legal-note"><Info size={17} /><p>Seu professor não prescreve nem altera este plano. Ele pode consultar a versão vigente apenas enquanto houver consentimento e encaminhar dúvidas ao nutricionista.</p></div><Button variant="secondary" className="wide" onClick={() => { notify('Canal de acompanhamento', `Peça ao seu professor para coordenar a dúvida com ${plan.nutritionistName}.`); navigate('messages') }}><MessageCircle size={16} /> Pedir encaminhamento</Button>{trackingEnabled && <button className="nutrition-withdraw-link" onClick={() => setWithdrawOpen(true)}>Pausar compartilhamento nutricional</button>}</aside></div>
    {withdrawOpen && <Modal title="Pausar a integração nutricional?" eyebrow="CONTROLE DOS SEUS DADOS" onClose={() => setWithdrawOpen(false)} size="small"><div className="nutrition-withdraw-dialog"><p>Você continuará vendo o plano atual, mas registros diários e o acesso da equipe serão pausados até uma nova autorização.</p>{actionError && <p className="nutrition-action-error" role="alert">{actionError}</p>}<div><Button variant="secondary" onClick={() => setWithdrawOpen(false)}>Manter autorização</Button><Button variant="danger" disabled={consentPending} onClick={() => void updateConsent('withdrawn')}>{consentPending && <LoaderCircle className="spin" size={15} />} Pausar integração</Button></div></div></Modal>}
  </div>
}
