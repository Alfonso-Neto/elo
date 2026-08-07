import { useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  Bell, CalendarDays, ClipboardList, Dumbbell, FileCheck2, LayoutDashboard, Menu, MessageCircle,
  LogOut, MoreHorizontal, RotateCcw, Salad, Search, Sparkles, UserRound, Users,
} from 'lucide-react'
import { Brand, Button, Drawer, Eyebrow, Modal } from './components'
import { AuthLoadingScreen, AuthPage } from './auth/AuthPage'
import { AuthProvider, useAuth } from './auth/auth-context'
import { StudentEnrollmentOnboarding } from './onboarding/EnrollmentScreens'
import { resolveEnrollmentAccess } from './onboarding/enrollment-access'
import { PrototypeProvider, usePrototype } from './prototype-context'
import {
  CopilotScreen, FormBuilderScreen, FormsScreen, MessagesScreen, ScheduleScreen, StudentDetailScreen,
  StudentsScreen, TrainerDashboard, WorkoutBuilderScreen,
} from './trainer-screens'
import {
  NutritionScreen, StudentAssistantScreen, StudentFormScreen, StudentScheduleScreen, StudentTodayScreen,
  StudentWorkoutScreen,
} from './student-screens'
import { students } from './data'
import type { Page, Role } from './types'

type NavItem = { page: Page | 'more'; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }

const trainerNav: NavItem[] = [
  { page: 'dashboard', label: 'Visão geral', icon: LayoutDashboard }, { page: 'students', label: 'Alunos', icon: Users },
  { page: 'copilot', label: 'Copiloto', icon: Sparkles }, { page: 'builder', label: 'Treinos', icon: Dumbbell },
  { page: 'schedule', label: 'Agenda', icon: CalendarDays }, { page: 'messages', label: 'Conversas', icon: MessageCircle },
  { page: 'forms', label: 'Anamneses', icon: FileCheck2 },
]

const studentNav: NavItem[] = [
  { page: 'today', label: 'Hoje', icon: LayoutDashboard }, { page: 'workout', label: 'Treino', icon: Dumbbell },
  { page: 'assistant', label: 'Assistente', icon: Sparkles }, { page: 'nutrition', label: 'Nutrição', icon: Salad },
  { page: 'schedule', label: 'Agenda', icon: CalendarDays }, { page: 'messages', label: 'Conversas', icon: MessageCircle },
  { page: 'student-form', label: 'Anamnese', icon: ClipboardList },
]

const titleForPage: Partial<Record<Page, string>> = {
  dashboard: 'Visão geral', students: 'Alunos', 'student-detail': 'Perfil do aluno', copilot: 'Copiloto', builder: 'Construtor de treino',
  forms: 'Anamneses', 'form-builder': 'Construtor de anamnese', schedule: 'Agenda', messages: 'Conversas',
  today: 'Hoje', workout: 'Meu treino', assistant: 'Assistente', nutrition: 'Nutrição', 'student-form': 'Anamnese',
}

function RoleSwitch({ compact = false }: { compact?: boolean }) {
  const { role, switchRole } = usePrototype()
  return <div className={compact ? 'role-switch compact' : 'role-switch'} role="group" aria-label="Alternar experiência"><button className={role === 'trainer' ? 'active' : ''} onClick={() => switchRole('trainer')} aria-label={compact ? 'Alternar para Treinador' : 'Treinador'} aria-pressed={role === 'trainer'}><UserRound size={15} />{!compact && 'Treinador'}</button><button className={role === 'student' ? 'active' : ''} onClick={() => switchRole('student')} aria-label={compact ? 'Alternar para Aluna' : 'Aluna'} aria-pressed={role === 'student'}><Dumbbell size={15} />{!compact && 'Aluna'}</button></div>
}

function Sidebar() {
  const { role, page, navigate, painReports, messages, setSelectedStudentId, resetPrototype } = usePrototype()
  const { isDemo, profile, membership, signOut, leaveDemo } = useAuth()
  const nav = role === 'trainer' ? trainerNav : studentNav
  const openStudents = new Set(painReports.filter((item) => item.status === 'open').map((item) => item.studentId)).size
  const unreadMessages = messages.at(-1)?.sender !== role ? 1 : 0
  const displayName = profile?.displayName ?? (role === 'trainer' ? 'André Lima' : 'Marina Costa')
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const workspaceTitle = profile ? (membership?.workspaceName ?? 'SEU ESPAÇO') : role === 'trainer' ? 'STUDIO ANDRÉ' : 'MARINA COSTA'
  const workspaceDetail = profile
    ? role === 'student' ? `Com ${membership?.trainerName ?? 'seu professor'}` : 'Conta de homologação'
    : role === 'trainer' ? '28 alunos ativos' : 'Acompanhamento ativo'
  return <aside className="sidebar"><Brand /><div className="workspace-label"><span>{workspaceTitle.toUpperCase()}</span><small>{workspaceDetail}</small></div><nav aria-label="Navegação principal">{nav.map(({ page: target, label, icon: Icon }) => <button key={target} className={page === target || (target === 'students' && page === 'student-detail') || (target === 'forms' && page === 'form-builder') ? 'nav-item active' : 'nav-item'} onClick={() => { if (target === 'copilot' || target === 'builder' || target === 'forms') setSelectedStudentId('marina'); if (target !== 'more') navigate(target) }} aria-label={label} title={label} aria-current={page === target ? 'page' : undefined}><Icon size={19} strokeWidth={1.8} /><span>{label}</span>{label === 'Alunos' && openStudents > 0 && <b>{openStudents}</b>}{label === 'Conversas' && unreadMessages > 0 && <b>{unreadMessages}</b>}</button>)}</nav><div className="sidebar-bottom">{isDemo ? <><RoleSwitch /><button className="reset-button" onClick={resetPrototype}><RotateCcw size={15} /> Reiniciar demonstração</button><button className="account-action" onClick={leaveDemo}><LogOut size={15} /> Sair da demonstração</button></> : <button className="account-action" onClick={() => void signOut()}><LogOut size={15} /> Sair da conta</button>}<div className="sidebar-profile"><span className="avatar">{initials}</span><div><strong>{displayName}</strong><small>{role === 'trainer' ? 'Professor · conta ativa' : 'Aluno · conta ativa'}</small></div><MoreHorizontal size={17} /></div></div></aside>
}

function Topbar() {
  const { role, page, navigate, painReports, formSubmitted, workoutSent, messages, setSelectedStudentId } = usePrototype()
  const { isDemo } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const matches = students.filter((student) => student.name.toLowerCase().includes(query.toLowerCase()))
  const studentMatches = studentNav.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()))
  const openPainCount = painReports.filter((item) => item.status === 'open').length
  const incomingMessage = messages.at(-1)?.sender !== role
  const hasNotifications = role === 'trainer' ? openPainCount > 0 || formSubmitted || incomingMessage : workoutSent || !formSubmitted || incomingMessage
  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', openSearch)
    return () => window.removeEventListener('keydown', openSearch)
  }, [])
  return <><header className="topbar"><div className="mobile-brand"><Brand /></div><div className="topbar-title"><Eyebrow>{role === 'trainer' ? 'PAINEL DO TREINADOR' : 'EXPERIÊNCIA DA ALUNA'}</Eyebrow><h1>{titleForPage[page]}</h1></div><div className="top-actions"><button className="top-search" onClick={() => setSearchOpen(true)}><Search size={17} /><span>{role === 'trainer' ? 'Buscar aluno...' : 'Buscar no Elo...'}</span><kbd>⌘ K</kbd></button><button className="icon-button" onClick={() => setNotificationsOpen(true)} aria-label="Abrir notificações"><Bell size={19} />{hasNotifications && <i />}</button>{role === 'trainer' ? <Button onClick={() => { setSelectedStudentId('marina'); navigate('builder') }}><Dumbbell size={16} /> Nova prescrição</Button> : isDemo ? <RoleSwitch compact /> : null}</div></header>
    {searchOpen && <Modal title={role === 'trainer' ? 'Buscar na sua base' : 'Onde você quer chegar?'} eyebrow="BUSCA RÁPIDA" onClose={() => setSearchOpen(false)} size="small"><label className="search-field modal-search"><Search size={17} /><span className="sr-only">{role === 'trainer' ? 'Buscar aluno' : 'Buscar seção no Elo'}</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={role === 'trainer' ? 'Nome do aluno...' : 'Treino, agenda, conversa...'} /></label>{role === 'trainer' ? <div className="quick-results">{matches.map((student) => <button key={student.id} onClick={() => { setSelectedStudentId(student.id); setSearchOpen(false); navigate('student-detail') }}><span className={`person-avatar ${student.status}`}>{student.initials}</span><span><strong>{student.name}</strong><small>{student.summary}</small></span></button>)}</div> : <div className="quick-results">{studentMatches.map(({ page: target, label, icon: Icon }) => <button key={target} onClick={() => { if (target !== 'more') navigate(target); setSearchOpen(false) }}><span className="quick-icon"><Icon size={17} /></span><span><strong>{label}</strong><small>Abrir seção</small></span></button>)}{!studentMatches.length && <p className="mini-empty">Nenhuma seção encontrada.</p>}</div>}</Modal>}
    {notificationsOpen && <Drawer title="O que mudou" eyebrow="NOTIFICAÇÕES" onClose={() => setNotificationsOpen(false)}><div className="notification-list">{role === 'trainer' && openPainCount > 0 && <button onClick={() => { setSelectedStudentId('marina'); navigate('copilot'); setNotificationsOpen(false) }}><span className="signal-avatar danger"><HeartIcon /></span><span><strong>{openPainCount} relatos de Marina</strong><small>Dor no joelho · sinal aberto</small></span></button>}{role === 'student' && workoutSent && <button onClick={() => { navigate('workout'); setNotificationsOpen(false) }}><span className="signal-avatar danger"><HeartIcon /></span><span><strong>André revisou seu contexto</strong><small>O treino foi ajustado com base no seu relato</small></span></button>}{((role === 'trainer' && formSubmitted) || (role === 'student' && !formSubmitted)) && <button onClick={() => { if (role === 'trainer') setSelectedStudentId('marina'); navigate(role === 'trainer' ? 'forms' : 'student-form'); setNotificationsOpen(false) }}><span className="signal-avatar blue"><FileCheck2 size={17} /></span><span><strong>{formSubmitted ? 'Anamnese respondida' : 'Anamnese aguardando resposta'}</strong><small>Contexto inicial · Marina Costa</small></span></button>}{incomingMessage && <button onClick={() => { navigate('messages'); setNotificationsOpen(false) }}><span className="signal-avatar warning"><MessageCircle size={17} /></span><span><strong>Nova mensagem</strong><small>Conversa de acompanhamento</small></span></button>}{!hasNotifications && <p className="mini-empty">Tudo em dia por aqui.</p>}</div></Drawer>}
  </>
}

function HeartIcon() { return <span aria-hidden="true">!</span> }

function BottomNav() {
  const { role, page, navigate, setSelectedStudentId, resetPrototype } = usePrototype()
  const { isDemo, signOut, leaveDemo } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const nav = role === 'trainer'
    ? [...trainerNav.slice(0, 3), trainerNav[4], { page: 'more' as const, label: 'Mais', icon: Menu }]
    : [...studentNav.slice(0, 4), { page: 'more' as const, label: 'Mais', icon: Menu }]
  const extra = role === 'trainer' ? [trainerNav[3], trainerNav[5], trainerNav[6]] : [studentNav[4], studentNav[5], studentNav[6]]
  const extraActive = extra.some((item) => item.page === page || (item.page === 'forms' && page === 'form-builder'))
  return <><nav className="bottom-nav" aria-label="Navegação móvel">{nav.map(({ page: target, label, icon: Icon }) => { const active = page === target || (target === 'more' && extraActive); return <button key={target} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => { if (target === 'more') { setMoreOpen(true); return }; if (target === 'copilot' || target === 'builder') setSelectedStudentId('marina'); navigate(target) }}><Icon size={20} /><small>{label}</small></button> })}</nav>{moreOpen && <Modal title="Mais no Elo" eyebrow={isDemo ? 'NAVEGAÇÃO E DEMONSTRAÇÃO' : 'NAVEGAÇÃO E CONTA'} onClose={() => setMoreOpen(false)} size="small"><div className="mobile-more-menu">{extra.map(({ page: target, label, icon: Icon }) => <button key={target} onClick={() => { if (target === 'builder' || target === 'forms') setSelectedStudentId('marina'); if (target !== 'more') navigate(target); setMoreOpen(false) }}><Icon size={19} /><span>{label}</span></button>)}{isDemo ? <><RoleSwitch /><button className="reset-mobile" onClick={() => { resetPrototype(); setMoreOpen(false) }}><RotateCcw size={18} /> Reiniciar demonstração</button><button className="reset-mobile" onClick={() => { leaveDemo(); setMoreOpen(false) }}><LogOut size={18} /> Sair da demonstração</button></> : <button className="reset-mobile" onClick={() => { void signOut(); setMoreOpen(false) }}><LogOut size={18} /> Sair da conta</button>}</div></Modal>}</>
}

function Toast() {
  const { toast } = usePrototype()
  if (!toast) return null
  return <div className="toast" role="status"><span><CheckIcon /></span><div><strong>{toast.title}</strong><p>{toast.message}</p></div></div>
}

function CheckIcon() { return <span aria-hidden="true">✓</span> }

function AppContent() {
  const { role, page } = usePrototype()
  const screen = useMemo(() => {
    const screens: Partial<Record<Page, React.ReactNode>> = {
      dashboard: <TrainerDashboard />, students: <StudentsScreen />, 'student-detail': <StudentDetailScreen />, copilot: <CopilotScreen />,
      builder: <WorkoutBuilderScreen />, forms: <FormsScreen />, 'form-builder': <FormBuilderScreen />, schedule: role === 'trainer' ? <ScheduleScreen /> : <StudentScheduleScreen />,
      messages: <MessagesScreen />, today: <StudentTodayScreen />, workout: <StudentWorkoutScreen />, assistant: <StudentAssistantScreen />,
      nutrition: <NutritionScreen />, 'student-form': <StudentFormScreen />,
    }
    return screens[page] ?? (role === 'trainer' ? <TrainerDashboard /> : <StudentTodayScreen />)
  }, [page, role])
  return <div className={`app-shell role-${role}`}><Sidebar /><div className="main-shell"><Topbar /><main id="main-content" tabIndex={-1}>{screen}</main></div><BottomNav /><Toast /></div>
}

function AppGate() {
  const { loading, session, profile, membership, isDemo } = useAuth()
  const resetRoute = window.location.hash.replace('#/', '') === 'redefinir-senha'
  if (loading) return <AuthLoadingScreen />
  if (!isDemo && (resetRoute || !session || !profile)) return <AuthPage />
  const access = resolveEnrollmentAccess({ isDemo, role: profile?.accountRole ?? null, membership })
  if (access === 'student-onboarding') return <StudentEnrollmentOnboarding />
  if (access === 'blocked') return <AuthPage />
  return <PrototypeProvider lockedRole={isDemo ? undefined : profile?.accountRole}><AppContent /></PrototypeProvider>
}

export function App() { return <AuthProvider><AppGate /></AuthProvider> }
