import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Check, Clipboard, Clock3, Link2, LoaderCircle, LogOut, Mail, RefreshCw, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { Brand, Button, Eyebrow, Modal, PageIntro } from '../components'
import { useAuth } from '../auth/auth-context'
import { usePrototype } from '../prototype-context'
import {
  acceptWorkspaceInvitation,
  createWorkspaceInvitation,
  listEnrolledStudents,
  type AcceptedInvitation,
  type CreatedInvitation,
  type EnrolledStudent,
} from './enrollment-service'

type AsyncPhase = 'idle' | 'loading' | 'success' | 'error'

export function StudentEnrollmentOnboarding() {
  const { profile, refreshMembership, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<AsyncPhase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<AcceptedInvitation | null>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { document.title = 'Vincular professor · Elo' }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (phase === 'loading') return
    setPhase('loading')
    setMessage(null)
    try {
      const result = await acceptWorkspaceInvitation(code)
      setCode('')
      setAccepted(result)
      setPhase('success')
    } catch (error) {
      setPhase('error')
      setMessage(error instanceof Error ? error.message : 'Não foi possível validar este convite.')
      window.requestAnimationFrame(() => {
        codeInputRef.current?.focus()
        codeInputRef.current?.select()
      })
    }
  }

  const continueToApp = async () => {
    setPhase('loading')
    setMessage(null)
    try {
      const membership = await refreshMembership()
      if (!membership) throw new Error('Não foi possível atualizar o vínculo desta conta.')
    } catch {
      setPhase('error')
      setMessage('O vínculo foi aceito, mas não foi possível abrir o espaço agora. Atualize a página e tente novamente.')
    }
  }

  return <div className="enrollment-shell">
    <aside className="enrollment-story" aria-label="Como o vínculo funciona">
      <Brand />
      <div className="enrollment-story-copy">
        <Eyebrow accent>VÍNCULO SEGURO</Eyebrow>
        <h1>Seu treino começa com a pessoa certa.</h1>
        <p>O código liga sua conta ao espaço do professor que fez o convite. Nenhum outro aluno ou profissional entra nesse acompanhamento.</p>
      </div>
      <ol className="enrollment-steps" aria-label="Etapas do vínculo">
        <li className="done"><span><Check size={14} /></span><div><strong>Conta criada</strong><small>{profile?.displayName}</small></div></li>
        <li className="current"><span>02</span><div><strong>Inserir convite</strong><small>Código recebido do professor</small></div></li>
        <li><span>03</span><div><strong>Entrar no espaço</strong><small>Treinos e conversas privadas</small></div></li>
      </ol>
    </aside>
    <main id="main-content" className="enrollment-main" tabIndex={-1}>
      <div className="enrollment-mobile-head"><Brand /><span>ENTRADA DO ALUNO</span></div>
      <button className="enrollment-signout" type="button" onClick={() => void signOut()}><LogOut size={15} /> Sair</button>
      <section className="enrollment-panel" aria-live="polite">
        {accepted ? <div className="enrollment-success">
          <span><Check size={26} /></span>
          <Eyebrow accent>VÍNCULO CONFIRMADO</Eyebrow>
          <h2>Você entrou em<br />{accepted.workspaceName}.</h2>
          <p>Seu acompanhamento com <strong>{accepted.trainerName}</strong> está conectado. Agora o Elo pode mostrar apenas os dados desse espaço.</p>
          {message && <p className="enrollment-alert" role="alert">{message}</p>}
          <Button className="wide" onClick={() => void continueToApp()} disabled={phase === 'loading'}>
            {phase === 'loading' ? <><LoaderCircle className="spin" size={17} /> Abrindo espaço...</> : <>Entrar no Elo <ArrowRight size={16} /></>}
          </Button>
        </div> : <>
          <div className="enrollment-heading">
            <Eyebrow accent>FALTA UM ELO</Eyebrow>
            <h2>Conecte-se ao seu professor.</h2>
            <p>Peça ao professor um código de homologação criado para o mesmo email usado nesta conta.</p>
          </div>
          <form className="enrollment-form" onSubmit={(event) => void submit(event)} noValidate aria-busy={phase === 'loading'}>
            <div className="enrollment-code-field">
              <label htmlFor="invite-code">Código de convite</label>
              <div className={phase === 'error' ? 'enrollment-code-input has-error' : 'enrollment-code-input'}><Link2 size={18} aria-hidden="true" /><input ref={codeInputRef} id="invite-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={(event) => { setCode(event.target.value); if (phase === 'error') { setPhase('idle'); setMessage(null) } }} placeholder="ELO-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" aria-invalid={phase === 'error'} aria-describedby={phase === 'error' ? 'invite-code-help invite-code-error' : 'invite-code-help'} /></div>
              <small id="invite-code-help">O código vale por 72 horas e só pode ser usado uma vez.</small>
            </div>
            {message && <p id="invite-code-error" className="enrollment-alert" role="alert">{message}</p>}
            <Button className="wide" type="submit" disabled={phase === 'loading' || !code.trim()}>
              {phase === 'loading' ? <><LoaderCircle className="spin" size={17} /> Validando convite...</> : <>Conectar ao professor <ArrowRight size={16} /></>}
            </Button>
          </form>
          <div className="enrollment-security-note"><ShieldCheck size={19} /><p><strong>O vínculo é privado.</strong> O código não fica salvo neste navegador e não é colocado em links.</p></div>
        </>}
      </section>
    </main>
  </div>
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

export function TrainerStudentsEnrollment() {
  const { membership } = useAuth()
  const { navigate, setSelectedStudentId } = usePrototype()
  const [students, setStudents] = useState<EnrolledStudent[]>([])
  const [listPhase, setListPhase] = useState<AsyncPhase>('loading')
  const [listError, setListError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [invitePhase, setInvitePhase] = useState<AsyncPhase>('idle')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<CreatedInvitation | null>(null)
  const [copied, setCopied] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)

  const loadStudents = useCallback(async () => {
    setListPhase('loading')
    setListError(null)
    try {
      setStudents(await listEnrolledStudents())
      setListPhase('success')
    } catch (error) {
      setListPhase('error')
      setListError(error instanceof Error ? error.message : 'Não foi possível carregar seus alunos agora.')
    }
  }, [])

  useEffect(() => { void loadStudents() }, [loadStudents])

  const closeInvite = () => {
    setInviteOpen(false)
    setEmail('')
    setInvitation(null)
    setInviteError(null)
    setInvitePhase('idle')
    setCopied(false)
  }

  const createInvite = async (event: FormEvent) => {
    event.preventDefault()
    if (invitePhase === 'loading') return
    setInvitePhase('loading')
    setInviteError(null)
    setInvitation(null)
    try {
      const created = await createWorkspaceInvitation(email)
      setInvitation(created)
      setInvitePhase('success')
    } catch (error) {
      setInvitePhase('error')
      setInviteError(error instanceof Error ? error.message : 'Não foi possível gerar o convite agora.')
      window.requestAnimationFrame(() => {
        emailInputRef.current?.focus()
        emailInputRef.current?.select()
      })
    }
  }

  const copyCode = async () => {
    if (!invitation) return
    try {
      await navigator.clipboard.writeText(invitation.code)
      setCopied(true)
    } catch {
      setCopied(false)
      setInviteError('Não foi possível copiar automaticamente. Selecione o código e copie manualmente.')
    }
  }

  const openStudent = (student: EnrolledStudent) => {
    setSelectedStudentId(student.userId)
    navigate('student-detail')
  }

  return <div className="page enter trainer-enrollment-page">
    <PageIntro
      eyebrow={`SEU ESPAÇO · ${students.length} ${students.length === 1 ? 'ALUNO ATIVO' : 'ALUNOS ATIVOS'}`}
      title={<>Acompanhamentos<br />com vínculo real.</>}
      copy={`Convide alunos para ${membership?.workspaceName ?? 'seu espaço'} e acompanhe quem já aceitou o código.`}
      action={<Button onClick={() => setInviteOpen(true)}><UserPlus size={16} /> Convidar aluno</Button>}
    />

    <section className="remote-students-section" aria-live="polite" aria-busy={listPhase === 'loading'}>
      <header><div><Eyebrow>BASE VINCULADA</Eyebrow><h3>Alunos deste espaço</h3></div><button className="text-link" onClick={() => void loadStudents()} disabled={listPhase === 'loading'}><RefreshCw className={listPhase === 'loading' ? 'spin' : ''} size={15} /> Atualizar</button></header>
      {listPhase === 'loading' && <div className="enrollment-loading"><LoaderCircle className="spin" size={23} /><p>Buscando vínculos ativos...</p></div>}
      {listPhase === 'error' && <div className="empty-state compact"><ShieldCheck size={27} /><h3>Não foi possível abrir a base</h3><p>{listError}</p><Button variant="secondary" onClick={() => void loadStudents()}>Tentar novamente</Button></div>}
      {listPhase === 'success' && students.length === 0 && <div className="empty-state"><Users size={29} /><h3>Seu primeiro vínculo começa aqui.</h3><p>Gere um código para o aluno. Ele aparecerá nesta base depois de aceitar.</p><Button variant="secondary" onClick={() => setInviteOpen(true)}><UserPlus size={16} /> Criar convite</Button></div>}
      {listPhase === 'success' && students.length > 0 && <div className="remote-student-list">{students.map((student) => <button type="button" key={student.userId} onClick={() => openStudent(student)} aria-label={`Abrir acompanhamento de ${student.displayName}`}>
        <span className="person-avatar steady">{initialsFor(student.displayName)}</span>
        <div><strong>{student.displayName}</strong><small>{student.joinedAt ? `Vínculo ativo desde ${new Intl.DateTimeFormat('pt-BR').format(new Date(student.joinedAt))}` : 'Vínculo ativo'}</small></div>
        <span className="tag success"><Check size={12} /> Ativo</span>
        <ArrowRight className="remote-student-arrow" size={16} aria-hidden="true" />
      </button>)}</div>}
    </section>

    {inviteOpen && <Modal title={invitation ? 'Código pronto para compartilhar.' : 'Convide um aluno.'} eyebrow="VÍNCULO DE HOMOLOGAÇÃO" size="small" onClose={closeInvite}>
      {invitation ? <div className="invitation-result" aria-live="polite">
        <span className="invitation-result-icon"><Check size={21} /></span>
        <p>Este código está vinculado a <strong>{invitation.email}</strong>. O aluno deve usá-lo na própria conta confirmada.</p>
        <div className="invitation-code"><small>CÓDIGO DE USO ÚNICO</small><code>{invitation.code}</code><button type="button" onClick={() => void copyCode()}><Clipboard size={15} /> {copied ? 'Copiado' : 'Copiar código'}</button></div>
        <div className="invitation-expiry"><Clock3 size={16} /><span><strong>Expira em 72 horas</strong><small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(invitation.expiresAt))}</small></span></div>
        <p className="invitation-homologation-note"><Mail size={16} /><span><strong>Envio manual nesta homologação.</strong> O Elo ainda não enviou email; copie o código e compartilhe por um canal seguro.</span></p>
        {inviteError && <p className="enrollment-alert" role="alert">{inviteError}</p>}
        <Button className="wide" variant="secondary" onClick={closeInvite}>Concluir</Button>
      </div> : <form className="form-stack invitation-form" onSubmit={(event) => void createInvite(event)} noValidate aria-busy={invitePhase === 'loading'}>
        <p className="modal-lead">Use exatamente o email que o aluno cadastrou. O código não permite trocar de conta ou escolher outro espaço.</p>
        <label><span>Email do aluno</span><input ref={emailInputRef} id="invitation-email" autoFocus type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); if (invitePhase === 'error') { setInvitePhase('idle'); setInviteError(null) } }} placeholder="aluno@exemplo.com" aria-invalid={invitePhase === 'error'} aria-describedby={invitePhase === 'error' ? 'invitation-email-error' : undefined} /></label>
        {inviteError && <p id="invitation-email-error" className="enrollment-alert" role="alert">{inviteError}</p>}
        <Button className="wide" type="submit" disabled={invitePhase === 'loading' || !email.trim()}>
          {invitePhase === 'loading' ? <><LoaderCircle className="spin" size={17} /> Gerando código...</> : <>Gerar código de homologação <ArrowRight size={16} /></>}
        </Button>
        <small className="invitation-privacy"><ShieldCheck size={14} /> O código será exibido uma vez e não será salvo no navegador.</small>
      </form>}
    </Modal>}
  </div>
}
