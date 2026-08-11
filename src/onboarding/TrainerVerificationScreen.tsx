import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  AlertTriangle, ArrowRight, BadgeCheck, Check, Clock3, FileCheck2, LoaderCircle, LogOut,
  RefreshCw, ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { Brand, Button, Eyebrow } from '../components'
import { createIdempotencyKey } from '../signals'
import { submitTrainerVerification } from './trainer-verification-service'
import './onboarding.css'

type SubmitPhase = 'idle' | 'submitting' | 'error'
type VerificationField = 'crefNumber' | 'crefState' | 'studioName'

type VerificationIntent = {
  crefNumber: string
  crefState: string
  studioName: string | null
  idempotencyKey: string
}

function intentMatches(left: VerificationIntent, right: Omit<VerificationIntent, 'idempotencyKey'>) {
  return left.crefNumber === right.crefNumber
    && left.crefState === right.crefState
    && left.studioName === right.studioName
}

function formatMoment(value: string | null) {
  if (!value) return 'Ainda não registrado'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function TrainerVerificationScreen() {
  const { membership, professionalAccess, profile } = useAuth()
  const accessIdentity = profile?.accountRole === 'trainer'
    && membership
    && membership.membershipRole !== 'student'
    && professionalAccess?.userId === profile.id
    && professionalAccess.workspaceId === membership.workspaceId
    ? `${profile.id}:${membership.workspaceId}`
    : 'unavailable'
  return <TrainerVerificationContent key={accessIdentity} />
}

function TrainerVerificationContent() {
  const {
    accessError, membership, professionalAccess: rawProfessionalAccess, profile, refreshProfessionalAccess, signOut,
  } = useAuth()
  const professionalAccess = profile?.accountRole === 'trainer'
    && membership
    && membership.membershipRole !== 'student'
    && rawProfessionalAccess?.userId === profile.id
    && rawProfessionalAccess.workspaceId === membership.workspaceId
    ? rawProfessionalAccess
    : null
  const [crefNumber, setCrefNumber] = useState(professionalAccess?.crefNumber ?? '')
  const [crefState, setCrefState] = useState(professionalAccess?.crefState ?? '')
  const [studioName, setStudioName] = useState(professionalAccess?.studioName ?? '')
  const [phase, setPhase] = useState<SubmitPhase>('idle')
  const [message, setMessage] = useState('')
  const [invalidField, setInvalidField] = useState<VerificationField | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const intentRef = useRef<VerificationIntent | null>(null)
  const submitGuard = useRef(false)
  const submitRequestVersion = useRef(0)
  const crefNumberRef = useRef<HTMLInputElement>(null)
  const crefStateRef = useRef<HTMLInputElement>(null)
  const studioNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = 'Verificação profissional · Elo'
    return () => {
      submitRequestVersion.current += 1
      submitGuard.current = false
    }
  }, [])

  useEffect(() => {
    if (!professionalAccess) return
    setCrefNumber(professionalAccess.crefNumber)
    setCrefState(professionalAccess.crefState)
    setStudioName(professionalAccess.studioName ?? '')
  }, [professionalAccess?.crefNumber, professionalAccess?.crefState, professionalAccess?.studioName])

  const clearFailedIntentAfterEdit = () => {
    intentRef.current = null
    if (phase === 'error') {
      setPhase('idle')
      setMessage('')
      setInvalidField(null)
    }
  }

  const rejectField = (field: VerificationField, copy: string) => {
    setPhase('error')
    setInvalidField(field)
    setMessage(copy)
    window.requestAnimationFrame(() => {
      const input = field === 'crefNumber' ? crefNumberRef.current : field === 'crefState' ? crefStateRef.current : studioNameRef.current
      input?.focus()
      input?.select()
    })
  }

  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    setMessage('')
    setInvalidField(null)
    try {
      await refreshProfessionalAccess()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível atualizar a verificação agora.')
    } finally {
      setRefreshing(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitGuard.current) return
    const snapshot = {
      crefNumber: crefNumber.trim().toUpperCase(),
      crefState: crefState.trim().toUpperCase(),
      studioName: studioName.trim() || null,
    }
    if (!/^[0-9A-Z/-]{4,24}$/.test(snapshot.crefNumber)) {
      rejectField('crefNumber', 'Revise o número do CREF. Use de 4 a 24 letras, números, barra ou hífen.')
      return
    }
    if (!/^[A-Z]{2}$/.test(snapshot.crefState)) {
      rejectField('crefState', 'Informe a UF do CREF com duas letras.')
      return
    }
    if (snapshot.studioName && (snapshot.studioName.length < 2 || snapshot.studioName.length > 80)) {
      rejectField('studioName', 'O nome do espaço deve ter entre 2 e 80 caracteres.')
      return
    }

    const previous = intentRef.current
    const intent: VerificationIntent = previous && intentMatches(previous, snapshot)
      ? previous
      : { ...snapshot, idempotencyKey: createIdempotencyKey('trainer-verification') }
    intentRef.current = intent
    submitGuard.current = true
    const requestVersion = ++submitRequestVersion.current
    setPhase('submitting')
    setMessage('')
    setInvalidField(null)
    try {
      await submitTrainerVerification(intent)
      if (requestVersion !== submitRequestVersion.current) return
      await refreshProfessionalAccess()
      if (requestVersion !== submitRequestVersion.current) return
      setPhase('idle')
    } catch (cause) {
      if (requestVersion !== submitRequestVersion.current) return
      setPhase('error')
      setInvalidField(null)
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível enviar a verificação agora.')
    } finally {
      if (requestVersion === submitRequestVersion.current) submitGuard.current = false
    }
  }

  const isPending = professionalAccess?.status === 'pending'
  const isRejected = professionalAccess?.status === 'rejected'
  const hasTemporaryAccess = professionalAccess?.mode === 'temporary_homologation'
  const unavailable = !professionalAccess
  const returnToTemporaryApp = () => { window.location.hash = '/dashboard' }

  return <div className="enrollment-shell verification-shell">
    <aside className="enrollment-story verification-story" aria-label="Etapas da verificação profissional">
      <Brand />
      <div className="enrollment-story-copy">
        <Eyebrow accent>IDENTIDADE PROFISSIONAL</Eyebrow>
        <h1>Confiança antes do acesso.</h1>
        <p>O Elo separa cadastro, revisão profissional e acesso aos dados dos alunos. A equipe confere o CREF em fonte pública antes de liberar o ambiente de acompanhamento.</p>
      </div>
      <ol className="enrollment-steps" aria-label="Progresso da verificação">
        <li className="done"><span><Check size={14} /></span><div><strong>Conta criada</strong><small>{profile?.displayName}</small></div></li>
        <li className={isPending || professionalAccess?.status === 'verified' ? 'done' : 'current'}><span>{isPending || professionalAccess?.status === 'verified' ? <Check size={14} /> : '02'}</span><div><strong>Enviar CREF</strong><small>Revise seus dados profissionais</small></div></li>
        <li className={isPending ? 'current' : ''}><span>03</span><div><strong>Revisão humana</strong><small>Nenhuma aprovação automática</small></div></li>
      </ol>
    </aside>

    <main id="main-content" className="enrollment-main verification-main" tabIndex={-1}>
      <div className="enrollment-mobile-head"><Brand /><span>ACESSO PROFISSIONAL</span></div>
      <button className="enrollment-signout" type="button" onClick={() => void signOut()}><LogOut size={15} /> Sair</button>
      <section className="enrollment-panel verification-panel" aria-live="polite" aria-busy={phase === 'submitting' || refreshing}>
        {hasTemporaryAccess && <div className="verification-temporary-note" role="status"><Clock3 size={18} /><p><strong>Acesso temporário de homologação.</strong> Exceção válida até {formatMoment(professionalAccess.temporaryAccessExpiresAt)}; isso não equivale a um CREF verificado.</p></div>}
        {unavailable ? <div className="verification-state verification-error-state">
          <span><ShieldCheck size={27} /></span>
          <Eyebrow accent>VALIDAÇÃO INDISPONÍVEL</Eyebrow>
          <h2>Seu acesso continua protegido.</h2>
          <p>{accessError ?? 'Não foi possível consultar a situação profissional desta conta. Nenhum dado de aluno foi liberado.'}</p>
          {message && <p className="enrollment-alert" role="alert">{message}</p>}
          <Button onClick={() => void refresh()} disabled={refreshing}>{refreshing ? <><LoaderCircle className="spin" size={17} /> Consultando...</> : <><RefreshCw size={16} /> Tentar novamente</>}</Button>
        </div> : isPending ? <div className="verification-state verification-pending-state">
          <span><Clock3 size={27} /></span>
          <Eyebrow accent>REVISÃO EM ANDAMENTO</Eyebrow>
          <h2>Seu CREF está com a equipe.</h2>
          <p>{hasTemporaryAccess
            ? 'Sua revisão continua pendente, mas a exceção temporária vigente libera o ambiente somente durante a janela de homologação.'
            : 'Enquanto a conferência não termina, o Elo mantém bloqueados os dados e recursos profissionais do workspace.'}</p>
          <dl className="verification-summary">
            <div><dt>Registro enviado</dt><dd>{professionalAccess.crefNumber} · {professionalAccess.crefState}</dd></div>
            <div><dt>Espaço</dt><dd>{professionalAccess.studioName ?? membership?.workspaceName ?? 'Não informado'}</dd></div>
            <div><dt>Solicitado em</dt><dd>{formatMoment(professionalAccess.submittedAt)}</dd></div>
          </dl>
          {message && <p className="enrollment-alert" role="alert">{message}</p>}
          <Button onClick={() => void refresh()} disabled={refreshing}>{refreshing ? <><LoaderCircle className="spin" size={17} /> Consultando...</> : <><RefreshCw size={16} /> Atualizar situação</>}</Button>
          {hasTemporaryAccess && <Button variant="secondary" onClick={returnToTemporaryApp}>Voltar ao ambiente temporário</Button>}
          <small className="verification-safe-copy"><ShieldCheck size={14} /> Esta tela não concede acesso por conta própria; a decisão vem do servidor.</small>
        </div> : <>
          <div className="enrollment-heading verification-heading">
            <Eyebrow accent>{isRejected ? 'CORRIJA E REENVIE' : 'ÚLTIMA ETAPA DO CADASTRO'}</Eyebrow>
            <h2>{isRejected ? <>Vamos revisar<br />seus dados.</> : <>Confirme seu<br />registro profissional.</>}</h2>
            <p>Confira exatamente como o registro aparece no sistema CONFEF/CREF. O envio cria uma solicitação; ele nunca marca a conta como verificada automaticamente.</p>
          </div>

          {isRejected && <div className="verification-rejection" role="status"><AlertTriangle size={20} /><div><strong>Revisão devolvida</strong><p>{professionalAccess.rejectionReason ?? 'Revise os dados e envie novamente.'}</p></div></div>}

          <form className="verification-form" onSubmit={(event) => void submit(event)} noValidate>
            <div className="verification-field-row">
              <label><span>Número do CREF</span><input ref={crefNumberRef} autoFocus value={crefNumber} maxLength={24} autoComplete="off" spellCheck={false} onChange={(event) => { clearFailedIntentAfterEdit(); setCrefNumber(event.target.value.toUpperCase()) }} placeholder="000000-G/UF" disabled={phase === 'submitting'} aria-invalid={invalidField === 'crefNumber'} aria-describedby={invalidField === 'crefNumber' ? 'verification-form-error' : undefined} /></label>
              <label className="verification-state-field"><span>UF</span><input ref={crefStateRef} value={crefState} maxLength={2} autoComplete="address-level1" spellCheck={false} onChange={(event) => { clearFailedIntentAfterEdit(); setCrefState(event.target.value.toUpperCase().replace(/[^A-Z]/g, '')) }} placeholder="SP" disabled={phase === 'submitting'} aria-invalid={invalidField === 'crefState'} aria-describedby={invalidField === 'crefState' ? 'verification-form-error' : undefined} /></label>
            </div>
            <label><span>Estúdio ou marca <small>opcional</small></span><input ref={studioNameRef} value={studioName} maxLength={80} autoComplete="organization" onChange={(event) => { clearFailedIntentAfterEdit(); setStudioName(event.target.value) }} placeholder={membership?.workspaceName ?? 'Seu espaço profissional'} disabled={phase === 'submitting'} aria-invalid={invalidField === 'studioName'} aria-describedby={invalidField === 'studioName' ? 'verification-form-error' : undefined} /></label>
            {message && <p id="verification-form-error" className="enrollment-alert" role="alert">{message}</p>}
            <Button className="wide" type="submit" disabled={phase === 'submitting'}>{phase === 'submitting' ? <><LoaderCircle className="spin" size={17} /> Enviando com segurança...</> : <><FileCheck2 size={16} /> {isRejected ? 'Reenviar para revisão' : 'Enviar para revisão'} <ArrowRight size={16} /></>}</Button>
            {hasTemporaryAccess && <Button className="wide" variant="secondary" type="button" onClick={returnToTemporaryApp} disabled={phase === 'submitting'}>Voltar ao ambiente temporário</Button>}
          </form>

          <div className="verification-security-note"><BadgeCheck size={21} /><p><strong>Revisão humana e rastreável.</strong> Não envie documento por esta tela. A homologação consulta o registro público e mantém um histórico imutável da decisão.</p></div>
        </>}
      </section>
    </main>
  </div>
}
