import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft, ArrowRight, AtSign, BadgeCheck, Check, Dumbbell, Eye, EyeOff, GraduationCap,
  KeyRound, LockKeyhole, MailCheck, ShieldCheck, UserRound,
} from 'lucide-react'
import { Brand } from '../components'
import type { Role } from '../types'
import { useAuth } from './auth-context'
import { isValidEmail, validatePasswordReset, validateRegistration, type RegistrationErrors, type RegistrationValues } from './auth-validation'

type AuthRoute = 'entrar' | 'cadastro' | 'confirmar-email' | 'recuperar-senha' | 'redefinir-senha'

const authRoutes: AuthRoute[] = ['entrar', 'cadastro', 'confirmar-email', 'recuperar-senha', 'redefinir-senha']
const authTitles: Record<AuthRoute, string> = {
  entrar: 'Entrar',
  cadastro: 'Criar conta',
  'confirmar-email': 'Confirmar e-mail',
  'recuperar-senha': 'Recuperar acesso',
  'redefinir-senha': 'Redefinir senha',
}
const states = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO']

function readRoute(): AuthRoute {
  const route = window.location.hash.replace('#/', '')
  return authRoutes.includes(route as AuthRoute) ? route as AuthRoute : 'entrar'
}

function AuthField({ label, fieldId, error, hint, children }: { label: string; fieldId: string; error?: string; hint?: string; children: ReactNode }) {
  const descriptionId = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
  return <div className={error ? 'auth-field has-error' : 'auth-field'}>
    <label htmlFor={fieldId}>{label}</label>
    {children}
    {error ? <small id={descriptionId} className="auth-field-error">{error}</small> : hint ? <small id={descriptionId}>{hint}</small> : null}
  </div>
}

function focusFirstInvalid(form: HTMLFormElement) {
  window.requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
}

function PasswordInput({ id, value, onChange, autoComplete, placeholder = 'Sua senha', error, label = 'Senha', hint }: {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  placeholder?: string
  error?: string
  label?: string
  hint?: string
}) {
  const [visible, setVisible] = useState(false)
  return <AuthField label={label} fieldId={id} error={error} hint={hint}>
    <span className="auth-input-wrap">
      <LockKeyhole size={17} aria-hidden="true" />
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      <button type="button" className="password-toggle" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}>
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  </AuthField>
}

function AuthLayout({ route, navigate, children }: { route: AuthRoute; navigate: (route: AuthRoute) => void; children: ReactNode }) {
  const { configured, configurationIssue, enterDemo } = useAuth()
  return <div className="auth-shell">
    <aside className="auth-story" aria-label="Elo, cuidado com contexto">
      <Brand />
      <div className="auth-story-copy">
        <span className="auth-kicker">PRESENÇA · CONTEXTO · CONTINUIDADE</span>
        <h1>O cuidado não termina quando o treino acaba.</h1>
        <p>O Elo aproxima professor e aluno para transformar sinais reais em decisões melhores, todos os dias.</p>
      </div>
      <div className="auth-signal" aria-hidden="true">
        <span className="auth-orbit one" /><span className="auth-orbit two" /><span className="auth-orbit three" />
        <span className="auth-signal-core"><i /><i /><i /></span>
      </div>
      <div className="auth-proof">
        <span><strong>01</strong><small>Contexto vivo</small></span>
        <span><strong>02</strong><small>Decisão humana</small></span>
        <span><strong>03</strong><small>Acompanhamento</small></span>
      </div>
    </aside>

    <main className="auth-main" id="main-content">
      <header className="auth-mobile-head"><Brand /><span>HOMOLOGAÇÃO</span></header>
      <nav className="auth-nav" aria-label="Acesso">
        <button className={route === 'entrar' ? 'active' : ''} onClick={() => navigate('entrar')}>Entrar</button>
        <button className={route === 'cadastro' ? 'active' : ''} onClick={() => navigate('cadastro')}>Criar conta</button>
      </nav>
      <section className="auth-panel">{children}</section>
      {!configured && <div className="auth-environment" role="status">
        <ShieldCheck size={17} />
        <p><strong>Ambiente sem conexão de autenticação.</strong>{configurationIssue ?? ' Configure as variáveis públicas do Supabase para habilitar contas reais.'}</p>
      </div>}
      <button className="demo-entry" onClick={enterDemo}><span>Explorar demonstração</span><ArrowRight size={17} /></button>
      <footer className="auth-footer">ELO · AMBIENTE DE HOMOLOGAÇÃO · DADOS PROTEGIDOS</footer>
    </main>
  </div>
}

function SignIn({ navigate }: { navigate: (route: AuthRoute) => void }) {
  const { signIn, accessError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const nextErrors: typeof errors = {}
    if (!isValidEmail(email)) nextErrors.email = 'Informe um e-mail válido.'
    if (!password) nextErrors.password = 'Informe sua senha.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); focusFirstInvalid(form); return }
    setBusy(true); setErrors({})
    try { await signIn(email, password) }
    catch (error) { setErrors({ form: error instanceof Error ? error.message : 'Não foi possível entrar agora.' }) }
    finally { setBusy(false) }
  }

  return <>
    <div className="auth-heading"><span>QUE BOM TER VOCÊ DE VOLTA</span><h2>Entre no seu Elo.</h2><p>Seu acompanhamento continua exatamente de onde parou.</p></div>
    <form className="auth-form" onSubmit={submit} noValidate>
      {(errors.form || accessError) && <div className="auth-form-alert" role="alert">{errors.form ?? accessError}</div>}
      <AuthField label="E-mail" fieldId="login-email" error={errors.email}>
        <span className="auth-input-wrap"><AtSign size={17} aria-hidden="true" /><input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'login-email-error' : undefined} /></span>
      </AuthField>
      <PasswordInput id="login-password" value={password} onChange={setPassword} autoComplete="current-password" error={errors.password} />
      <div className="auth-form-between"><span /><button type="button" className="auth-text-button" onClick={() => navigate('recuperar-senha')}>Esqueci minha senha</button></div>
      <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Validando acesso…' : 'Entrar'}{!busy && <ArrowRight size={18} />}</button>
    </form>
    <p className="auth-switch-copy">Ainda não faz parte? <button onClick={() => navigate('cadastro')}>Crie sua conta</button></p>
  </>
}

function RoleChoice({ onChoose }: { onChoose: (role: Role) => void }) {
  return <>
    <div className="auth-heading"><span>COMECE PELO SEU PAPEL</span><h2>Como você chega ao Elo?</h2><p>Cada experiência é construída para as decisões que você precisa tomar.</p></div>
    <div className="auth-role-grid" role="group" aria-label="Escolha seu perfil">
      <button onClick={() => onChoose('trainer')}>
        <span className="auth-role-icon pine"><GraduationCap size={23} /></span><span><small>QUERO ACOMPANHAR</small><strong>Sou professor</strong><p>Organize alunos, sinais, treinos e conversas em um só fluxo.</p></span><ArrowRight size={19} />
      </button>
      <button onClick={() => onChoose('student')}>
        <span className="auth-role-icon apricot"><Dumbbell size={22} /></span><span><small>QUERO SER ACOMPANHADO</small><strong>Sou aluno</strong><p>Tenha treino, agenda e suporte próximos da sua rotina.</p></span><ArrowRight size={19} />
      </button>
    </div>
  </>
}

function SignUp({ navigate, onEmail }: { navigate: (route: AuthRoute) => void; onEmail: (email: string) => void }) {
  const { signUp } = useAuth()
  const [step, setStep] = useState<'role' | 'identity'>('role')
  const [values, setValues] = useState<RegistrationValues>({ role: null, displayName: '', email: '', password: '', confirmation: '', crefNumber: '', crefState: '', studioName: '', acceptedTerms: false })
  const [errors, setErrors] = useState<RegistrationErrors & { form?: string }>({})
  const [busy, setBusy] = useState(false)
  const roleLabel = values.role === 'trainer' ? 'Professor' : 'Aluno'
  const update = <K extends keyof RegistrationValues>(key: K, value: RegistrationValues[K]) => setValues((current) => ({ ...current, [key]: value }))

  const chooseRole = (role: Role) => { update('role', role); setErrors({}); setStep('identity') }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const nextErrors = validateRegistration(values)
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); focusFirstInvalid(form); return }
    setBusy(true); setErrors({})
    try {
      await signUp({ role: values.role!, displayName: values.displayName, email: values.email, password: values.password, crefNumber: values.crefNumber, crefState: values.crefState, studioName: values.studioName })
      onEmail(values.email.trim().toLowerCase())
      navigate('confirmar-email')
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'Não foi possível concluir o cadastro agora.' })
    } finally { setBusy(false) }
  }

  if (step === 'role') return <RoleChoice onChoose={chooseRole} />

  return <>
    <button className="auth-back" onClick={() => setStep('role')}><ArrowLeft size={16} /> Trocar perfil</button>
    <div className="auth-heading compact"><span>CADASTRO · {roleLabel.toUpperCase()}</span><h2>Crie sua presença no Elo.</h2><p>Primeiro, os dados essenciais. Você completa o restante dentro da plataforma.</p></div>
    <form className="auth-form" onSubmit={submit} noValidate>
      {errors.form && <div className="auth-form-alert" role="alert">{errors.form}</div>}
      <div className="auth-two-columns">
        <AuthField label="Nome completo" fieldId="signup-name" error={errors.displayName}>
          <span className="auth-input-wrap"><UserRound size={17} aria-hidden="true" /><input id="signup-name" value={values.displayName} onChange={(event) => update('displayName', event.target.value)} autoComplete="name" placeholder="Como devemos chamar você?" aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? 'signup-name-error' : undefined} /></span>
        </AuthField>
        <AuthField label="E-mail" fieldId="signup-email" error={errors.email}>
          <span className="auth-input-wrap"><AtSign size={17} aria-hidden="true" /><input id="signup-email" type="email" value={values.email} onChange={(event) => update('email', event.target.value)} autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'signup-email-error' : undefined} /></span>
        </AuthField>
      </div>

      {values.role === 'trainer' && <div className="trainer-fields" aria-label="Dados profissionais">
        <div className="trainer-fields-heading"><BadgeCheck size={18} /><span><strong>Identificação profissional</strong><small>Usada para a validação da conta do professor.</small></span></div>
        <div className="auth-professional-grid">
          <AuthField label="Número do CREF" fieldId="signup-cref" error={errors.crefNumber}>
            <span className="auth-input-wrap"><BadgeCheck size={17} aria-hidden="true" /><input id="signup-cref" value={values.crefNumber} onChange={(event) => update('crefNumber', event.target.value.toUpperCase())} autoComplete="off" placeholder="000000-G" aria-invalid={Boolean(errors.crefNumber)} aria-describedby={errors.crefNumber ? 'signup-cref-error' : undefined} /></span>
          </AuthField>
          <AuthField label="UF do CREF" fieldId="signup-cref-state" error={errors.crefState}>
            <select id="signup-cref-state" value={values.crefState} onChange={(event) => update('crefState', event.target.value)} aria-invalid={Boolean(errors.crefState)} aria-describedby={errors.crefState ? 'signup-cref-state-error' : undefined}><option value="">UF</option>{states.map((state) => <option key={state}>{state}</option>)}</select>
          </AuthField>
          <AuthField label="Estúdio ou marca" fieldId="signup-studio" hint="Opcional">
            <input id="signup-studio" className="auth-plain-input" value={values.studioName} onChange={(event) => update('studioName', event.target.value)} autoComplete="organization" placeholder="Nome do seu espaço" maxLength={80} aria-describedby="signup-studio-hint" />
          </AuthField>
        </div>
      </div>}

      <div className="auth-two-columns">
        <PasswordInput id="signup-password" value={values.password} onChange={(value) => update('password', value)} autoComplete="new-password" error={errors.password} hint="Use 12 ou mais caracteres." />
        <PasswordInput id="signup-confirmation" value={values.confirmation} onChange={(value) => update('confirmation', value)} autoComplete="new-password" error={errors.confirmation} label="Confirme a senha" placeholder="Repita sua senha" />
      </div>
      <label className={errors.acceptedTerms ? 'auth-check has-error' : 'auth-check'}>
        <input id="signup-terms" type="checkbox" checked={values.acceptedTerms} onChange={(event) => update('acceptedTerms', event.target.checked)} aria-invalid={Boolean(errors.acceptedTerms)} aria-describedby={errors.acceptedTerms ? 'signup-terms-error' : undefined} />
        <span><i><Check size={13} /></i>Li e aceito os Termos de Uso e a Política de Privacidade do Elo.</span>
        {errors.acceptedTerms && <small id="signup-terms-error">{errors.acceptedTerms}</small>}
      </label>
      <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Criando sua conta…' : 'Criar conta'}{!busy && <ArrowRight size={18} />}</button>
    </form>
    <p className="auth-switch-copy">Já tem uma conta? <button onClick={() => navigate('entrar')}>Entre por aqui</button></p>
  </>
}

function ConfirmEmail({ email, navigate }: { email: string; navigate: (route: AuthRoute) => void }) {
  const { resendConfirmation, configured } = useAuth()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const resend = async () => {
    if (!email || !configured) return
    setBusy(true)
    try { await resendConfirmation(email) } finally {
      setMessage('Se o endereço estiver elegível, uma nova mensagem chegará em instantes.')
      setBusy(false)
    }
  }
  return <div className="auth-state">
    <span className="auth-state-icon"><MailCheck size={28} /></span>
    <span className="auth-kicker">CONFIRME SEU E-MAIL</span>
    <h2>Falta só abrir sua caixa de entrada.</h2>
    <p>Se o endereço puder ser usado, enviaremos um link para concluir o acesso{email ? <> em <strong>{email}</strong></> : ''}. Isso pode levar alguns minutos.</p>
    {message && <div className="auth-success-note" role="status">{message}</div>}
    <button className="auth-submit" onClick={() => navigate('entrar')}>Voltar para entrar <ArrowRight size={18} /></button>
    {email && <button className="auth-text-button state-link" onClick={resend} disabled={busy || !configured}>{busy ? 'Solicitando…' : 'Reenviar confirmação'}</button>}
  </div>
}

function ForgotPassword({ navigate }: { navigate: (route: AuthRoute) => void }) {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!isValidEmail(email)) { setError('Informe um e-mail válido.'); focusFirstInvalid(form); return }
    setBusy(true); setError(null)
    try { await requestPasswordReset(email); setSent(true) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível solicitar o acesso agora.') }
    finally { setBusy(false) }
  }
  if (sent) return <div className="auth-state"><span className="auth-state-icon"><MailCheck size={28} /></span><span className="auth-kicker">SOLICITAÇÃO RECEBIDA</span><h2>Confira seu e-mail.</h2><p>Se houver uma conta elegível para esse endereço, enviaremos as instruções de redefinição.</p><button className="auth-submit" onClick={() => navigate('entrar')}>Voltar para entrar <ArrowRight size={18} /></button></div>
  return <>
    <button className="auth-back" onClick={() => navigate('entrar')}><ArrowLeft size={16} /> Voltar</button>
    <div className="auth-heading"><span>RECUPERAR ACESSO</span><h2>Vamos criar uma nova senha.</h2><p>Informe seu e-mail. Por segurança, a resposta será sempre a mesma.</p></div>
    <form className="auth-form" onSubmit={submit} noValidate>
      {error?.includes('autenticação') && <div className="auth-form-alert" role="alert">{error}</div>}
      <AuthField label="E-mail" fieldId="recovery-email" error={error && !error.includes('autenticação') ? error : undefined}>
        <span className="auth-input-wrap"><AtSign size={17} aria-hidden="true" /><input id="recovery-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" aria-invalid={Boolean(error && !error.includes('autenticação'))} aria-describedby={error && !error.includes('autenticação') ? 'recovery-email-error' : undefined} /></span>
      </AuthField>
      <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Enviando instruções…' : 'Enviar instruções'}{!busy && <ArrowRight size={18} />}</button>
    </form>
  </>
}

function ResetPassword({ navigate }: { navigate: (route: AuthRoute) => void }) {
  const { recoveryMode, updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  if (!recoveryMode) return <div className="auth-state"><span className="auth-state-icon warning"><KeyRound size={27} /></span><span className="auth-kicker">LINK INDISPONÍVEL</span><h2>Este acesso expirou ou já foi usado.</h2><p>Solicite um novo link para redefinir sua senha com segurança.</p><button className="auth-submit" onClick={() => navigate('recuperar-senha')}>Solicitar novo link <ArrowRight size={18} /></button></div>
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const nextErrors = validatePasswordReset(password, confirmation)
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); focusFirstInvalid(form); return }
    setBusy(true); setErrors({})
    try { await updatePassword(password) }
    catch (error) { setErrors({ form: error instanceof Error ? error.message : 'Não foi possível atualizar a senha.' }) }
    finally { setBusy(false) }
  }
  return <>
    <div className="auth-heading"><span>NOVA SENHA</span><h2>Escolha uma chave forte.</h2><p>Depois da alteração, você entrará novamente em todos os dispositivos.</p></div>
    <form className="auth-form" onSubmit={submit} noValidate>
      {errors.form && <div className="auth-form-alert" role="alert">{errors.form}</div>}
      <PasswordInput id="reset-password" value={password} onChange={setPassword} autoComplete="new-password" error={errors.password} hint="Use 12 ou mais caracteres." label="Nova senha" />
      <PasswordInput id="reset-confirmation" value={confirmation} onChange={setConfirmation} autoComplete="new-password" error={errors.confirmation} label="Confirme a nova senha" placeholder="Repita sua nova senha" />
      <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Protegendo sua conta…' : 'Atualizar senha'}{!busy && <ArrowRight size={18} />}</button>
    </form>
  </>
}

export function AuthPage() {
  const [route, setRoute] = useState<AuthRoute>(readRoute)
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const navigate = (next: AuthRoute) => {
    window.history.pushState(null, '', `#/${next}`)
    setRoute(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  useEffect(() => {
    document.body.classList.add('auth-active')
    if (!authRoutes.includes(window.location.hash.replace('#/', '') as AuthRoute)) window.history.replaceState(null, '', '#/entrar')
    const sync = () => setRoute(readRoute())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => { document.body.classList.remove('auth-active'); window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync) }
  }, [])
  useEffect(() => { document.title = `${authTitles[route]} · Elo` }, [route])
  const content = useMemo(() => {
    if (route === 'cadastro') return <SignUp navigate={navigate} onEmail={setConfirmationEmail} />
    if (route === 'confirmar-email') return <ConfirmEmail email={confirmationEmail} navigate={navigate} />
    if (route === 'recuperar-senha') return <ForgotPassword navigate={navigate} />
    if (route === 'redefinir-senha') return <ResetPassword navigate={navigate} />
    return <SignIn navigate={navigate} />
  }, [confirmationEmail, route])
  return <AuthLayout route={route} navigate={navigate}>{content}</AuthLayout>
}

export function AuthLoadingScreen() {
  useEffect(() => { document.title = 'Validando acesso · Elo' }, [])
  return <main id="main-content" className="auth-loading" tabIndex={-1} aria-live="polite"><Brand /><span className="auth-loading-line" /><p>Validando seu acesso…</p></main>
}
