import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  BadgeCheck, Bell, CalendarDays, ClipboardList, Clock3, Dumbbell, FileCheck2, LayoutDashboard, LoaderCircle, Menu,
  MessageCircle, LogOut, MoreHorizontal, Salad, Search, Sparkles, Users, WifiOff,
} from 'lucide-react'
import { Brand, Button, Eyebrow, Modal } from './components'
import { AuthLoadingScreen, AuthPage } from './auth/AuthPage'
import { AuthProvider, useAuth } from './auth/auth-context'
import { StudentEnrollmentOnboarding, TrainerStudentsEnrollment as StudentsScreen } from './onboarding/EnrollmentScreens'
import { TrainerVerificationScreen } from './onboarding/TrainerVerificationScreen'
import { resolveEnrollmentAccess } from './onboarding/enrollment-access'
import { listEnrolledStudents, type EnrolledStudent } from './onboarding/enrollment-service'
import { clearLegacyBrowserStorage, EloAppProvider, useEloApp } from './app-state'
import type { Page } from './types'

const loadTrainerDashboard = () => import('./live/LiveTrainerDashboard')
const loadStudentDetail = () => import('./live/LiveStudentDetail')
const loadTrainerCopilot = () => import('./live/LiveTrainerCopilot')
const loadTrainerTraining = () => import('./live/LiveTrainerTraining')
const loadOperationsScreens = () => import('./live/LiveOperationsScreens')
const loadStudentTraining = () => import('./live/LiveStudentTraining')
const loadStudentAssistant = () => import('./student-assistant-screen')
const loadNutrition = () => import('./live/LiveNutritionScreen')

const TrainerDashboard = lazy(() => loadTrainerDashboard().then((module) => ({ default: module.LiveTrainerDashboard })))
const StudentDetailScreen = lazy(() => loadStudentDetail().then((module) => ({ default: module.LiveStudentDetailScreen })))
const CopilotScreen = lazy(() => loadTrainerCopilot().then((module) => ({ default: module.LiveTrainerCopilot })))
const WorkoutBuilderScreen = lazy(() => loadTrainerTraining().then((module) => ({ default: module.LiveWorkoutBuilderScreen })))
const FormsScreen = lazy(() => loadTrainerTraining().then((module) => ({ default: module.LiveTrainerFormsScreen })))
const FormBuilderScreen = lazy(() => loadTrainerTraining().then((module) => ({ default: module.LiveFormBuilderScreen })))
const ScheduleScreen = lazy(() => loadOperationsScreens().then((module) => ({ default: module.LiveTrainerScheduleScreen })))
const MessagesScreen = lazy(() => loadOperationsScreens().then((module) => ({ default: module.LiveMessagesScreen })))
const StudentTodayScreen = lazy(() => loadStudentTraining().then((module) => ({ default: module.LiveStudentTodayScreen })))
const StudentWorkoutScreen = lazy(() => loadStudentTraining().then((module) => ({ default: module.LiveStudentWorkoutScreen })))
const StudentAssistantScreen = lazy(() => loadStudentAssistant().then((module) => ({ default: module.StudentAssistantScreen })))
const NutritionScreen = lazy(() => loadNutrition().then((module) => ({ default: module.LiveNutritionScreen })))
const StudentScheduleScreen = lazy(() => loadOperationsScreens().then((module) => ({ default: module.LiveStudentScheduleScreen })))
const StudentFormScreen = lazy(() => loadStudentTraining().then((module) => ({ default: module.LiveStudentFormScreen })))
const LiveNotificationsButton = lazy(() => import('./live/LiveNotifications').then((module) => ({ default: module.LiveNotificationsButton })))

const routeChunkLoaders: Partial<Record<Page, () => Promise<unknown>>> = {
  dashboard: loadTrainerDashboard,
  'student-detail': loadStudentDetail,
  copilot: loadTrainerCopilot,
  builder: loadTrainerTraining,
  forms: loadTrainerTraining,
  'form-builder': loadTrainerTraining,
  schedule: loadOperationsScreens,
  messages: loadOperationsScreens,
  today: loadStudentTraining,
  workout: loadStudentTraining,
  assistant: loadStudentAssistant,
  nutrition: loadNutrition,
  'student-form': loadStudentTraining,
}

const preloadPage = (page: Page) => { void routeChunkLoaders[page]?.() }

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

function Sidebar() {
  const { role, page, navigate } = useEloApp()
  const { profile, membership, professionalAccess, signOut } = useAuth()
  const nav = role === 'trainer' ? trainerNav : studentNav
  const displayName = profile?.displayName ?? 'Conta Elo'
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const workspaceTitle = membership?.workspaceName ?? 'SEU ESPAÇO'
  const workspaceDetail = role === 'student'
    ? `Com ${membership?.trainerName ?? 'seu professor'}`
    : professionalAccess?.mode === 'verified' ? 'Identidade profissional confirmada' : 'Acesso profissional temporário'
  const professionalLabel = professionalAccess?.mode === 'verified'
    ? 'CREF VERIFICADO'
    : professionalAccess?.mode === 'temporary_homologation' ? 'ACESSO TEMPORÁRIO' : null
  return <aside className="sidebar">
    <Brand />
    <div className="workspace-label">
      <span>{workspaceTitle.toUpperCase()}</span>
      <small>{workspaceDetail}</small>
      {role === 'trainer' && professionalLabel && <b className={`professional-status ${professionalAccess?.mode === 'temporary_homologation' ? 'temporary' : ''}`}>
        {professionalAccess?.mode === 'verified' ? <BadgeCheck size={10} /> : <Clock3 size={10} />}{professionalLabel}
      </b>}
    </div>
    <nav aria-label="Navegação principal">{nav.map(({ page: target, label, icon: Icon }) => <button type="button"
      key={target}
      className={page === target || (target === 'students' && page === 'student-detail') || (target === 'forms' && page === 'form-builder') ? 'nav-item active' : 'nav-item'}
      onMouseEnter={() => { if (target !== 'more') preloadPage(target) }}
      onFocus={() => { if (target !== 'more') preloadPage(target) }}
      onClick={() => { if (target !== 'more') navigate(target) }}
      aria-label={label}
      title={label}
      aria-current={page === target ? 'page' : undefined}
    ><Icon size={19} strokeWidth={1.8} /><span>{label}</span></button>)}</nav>
    <div className="sidebar-bottom">
      <button type="button" className="account-action" onClick={() => void signOut()}><LogOut size={15} /> Sair da conta</button>
      <div className="sidebar-profile"><span className="avatar">{initials}</span><div><strong>{displayName}</strong><small>{role === 'trainer' ? professionalAccess?.mode === 'verified' ? 'Professor · CREF verificado' : 'Professor · homologação temporária' : 'Aluno · conta ativa'}</small></div><MoreHorizontal size={17} /></div>
    </div>
  </aside>
}

function ProfessionalAccessBanner() {
  const { professionalAccess } = useAuth()
  if (professionalAccess?.mode !== 'temporary_homologation') return null
  const expires = professionalAccess.temporaryAccessExpiresAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(professionalAccess.temporaryAccessExpiresAt))
    : 'em breve'
  return <aside className="professional-access-banner" role="status"><Clock3 size={19} /><span><strong>Acesso temporário de homologação — não equivale a CREF verificado.</strong><small>Exceção válida até {expires}. <a href="#/verificacao">Enviar ou acompanhar verificação profissional</a></small></span></aside>
}

function Topbar() {
  const { role, page, navigate, setSelectedStudentId } = useEloApp()
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [liveStudents, setLiveStudents] = useState<EnrolledStudent[]>([])
  const [liveSearchState, setLiveSearchState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const liveMatches = liveStudents.filter((student) => student.displayName.toLowerCase().includes(query.toLowerCase()))
  const studentMatches = studentNav.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()))
  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', openSearch)
    return () => window.removeEventListener('keydown', openSearch)
  }, [])
  useEffect(() => {
    if (!searchOpen || role !== 'trainer') return
    let active = true
    setLiveSearchState('loading')
    void listEnrolledStudents().then((roster) => {
      if (!active) return
      setLiveStudents(roster); setLiveSearchState('ready')
    }).catch(() => {
      if (!active) return
      setLiveSearchState('error')
    })
    return () => { active = false }
  }, [role, searchOpen])
  return <>
    <header className="topbar">
      <div className="mobile-brand"><Brand /></div>
      <div className="topbar-title"><Eyebrow>{role === 'trainer' ? 'PAINEL DO TREINADOR' : 'EXPERIÊNCIA DO ALUNO'}</Eyebrow><h1>{titleForPage[page]}</h1></div>
      <div className="top-actions">
        <button type="button" className="top-search" onClick={() => setSearchOpen(true)}><Search size={17} /><span>{role === 'trainer' ? 'Buscar aluno...' : 'Buscar no Elo...'}</span><kbd>⌘ K</kbd></button>
        <Suspense fallback={<button type="button" className="icon-button" aria-label="Carregando atualizações" disabled><Bell size={19} /></button>}><LiveNotificationsButton /></Suspense>
        {role === 'trainer' && <Button onMouseEnter={() => preloadPage('builder')} onFocus={() => preloadPage('builder')} onClick={() => navigate('builder')}><Dumbbell size={16} /> Nova prescrição</Button>}
      </div>
    </header>
    {searchOpen && <Modal title={role === 'trainer' ? 'Buscar na sua base' : 'Onde você quer chegar?'} eyebrow="BUSCA RÁPIDA" onClose={() => setSearchOpen(false)} size="small">
      <label className="search-field modal-search"><Search size={17} /><span className="sr-only">{role === 'trainer' ? 'Buscar aluno' : 'Buscar seção no Elo'}</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={role === 'trainer' ? 'Nome do aluno...' : 'Treino, agenda, conversa...'} /></label>
      {role === 'trainer' ? <div className="quick-results">
        {liveSearchState === 'loading' && <p className="mini-empty">Carregando alunos vinculados...</p>}
        {liveSearchState === 'error' && <p className="mini-empty">A busca não abriu agora.</p>}
        {liveSearchState === 'ready' && liveMatches.map((student) => <button type="button" key={student.userId} onPointerDown={() => preloadPage('student-detail')} onClick={() => { setSelectedStudentId(student.userId); setSearchOpen(false); navigate('student-detail') }}><span className="person-avatar">{student.displayName.split(/\s+/).slice(0,2).map((part) => part[0]).join('').toUpperCase()}</span><span><strong>{student.displayName}</strong><small>Aluno vinculado ao workspace</small></span></button>)}
        {liveSearchState === 'ready' && !liveMatches.length && <p className="mini-empty">Nenhum aluno vinculado encontrado.</p>}
      </div> : <div className="quick-results">{studentMatches.map(({ page: target, label, icon: Icon }) => <button type="button" key={target} onClick={() => { if (target !== 'more') navigate(target); setSearchOpen(false) }}><span className="quick-icon"><Icon size={17} /></span><span><strong>{label}</strong><small>Abrir seção</small></span></button>)}{!studentMatches.length && <p className="mini-empty">Nenhuma seção encontrada.</p>}</div>}
    </Modal>}
  </>
}

function BottomNav() {
  const { role, page, navigate } = useEloApp()
  const { signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const nav = role === 'trainer'
    ? [...trainerNav.slice(0, 3), trainerNav[4], { page: 'more' as const, label: 'Mais', icon: Menu }]
    : [...studentNav.slice(0, 4), { page: 'more' as const, label: 'Mais', icon: Menu }]
  const extra = role === 'trainer' ? [trainerNav[3], trainerNav[5], trainerNav[6]] : [studentNav[4], studentNav[5], studentNav[6]]
  const extraActive = extra.some((item) => item.page === page || (item.page === 'forms' && page === 'form-builder'))
  return <>
    <nav className="bottom-nav" aria-label="Navegação móvel">{nav.map(({ page: target, label, icon: Icon }) => {
      const active = page === target || (target === 'more' && extraActive)
      return <button type="button" key={target} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onPointerDown={() => { if (target !== 'more') preloadPage(target) }} onFocus={() => { if (target !== 'more') preloadPage(target) }} onClick={() => { if (target === 'more') { setMoreOpen(true); return }; navigate(target) }}><Icon size={20} /><small>{label}</small></button>
    })}</nav>
    {moreOpen && <Modal title="Mais no Elo" eyebrow="NAVEGAÇÃO E CONTA" onClose={() => setMoreOpen(false)} size="small"><div className="mobile-more-menu">
      {extra.map(({ page: target, label, icon: Icon }) => <button type="button" key={target} onPointerDown={() => { if (target !== 'more') preloadPage(target) }} onFocus={() => { if (target !== 'more') preloadPage(target) }} onClick={() => { if (target !== 'more') navigate(target); setMoreOpen(false) }}><Icon size={19} /><span>{label}</span></button>)}
      <button type="button" className="reset-mobile" onClick={() => { void signOut(); setMoreOpen(false) }}><LogOut size={18} /> Sair da conta</button>
    </div></Modal>}
  </>
}

function Toast() {
  const { toast } = useEloApp()
  if (!toast) return null
  return <div className="toast" role="status"><span><CheckIcon /></span><div><strong>{toast.title}</strong><p>{toast.message}</p></div></div>
}

function CheckIcon() { return <span aria-hidden="true">✓</span> }

function RouteLoading() {
  return <div className="page route-loading" role="status"><LoaderCircle className="spin" size={24} /><p>Preparando esta área...</p></div>
}

export function NetworkStatusBanner() {
  const [offline, setOffline] = useState(() => !navigator.onLine)
  useEffect(() => {
    const updateStatus = () => setOffline(!navigator.onLine)
    window.addEventListener('online', updateStatus)
    window.addEventListener('offline', updateStatus)
    return () => {
      window.removeEventListener('online', updateStatus)
      window.removeEventListener('offline', updateStatus)
    }
  }, [])
  if (!offline) return null
  return <aside className="network-status" role="status" aria-live="polite"><WifiOff size={16} /><span><strong>Sem conexão</strong> Alterações e atualizações ficarão indisponíveis até a rede voltar.</span></aside>
}

function AppContent() {
  const { role, page } = useEloApp()
  const pageTitle = titleForPage[page]
  useEffect(() => { document.title = `${pageTitle} · Elo` }, [pageTitle])
  const screen = useMemo(() => {
    const screens: Partial<Record<Page, React.ReactNode>> = {
      dashboard: <TrainerDashboard />, students: <StudentsScreen />, 'student-detail': <StudentDetailScreen />, copilot: <CopilotScreen />,
      builder: <WorkoutBuilderScreen />, forms: <FormsScreen />, 'form-builder': <FormBuilderScreen />, schedule: role === 'trainer' ? <ScheduleScreen /> : <StudentScheduleScreen />,
      messages: <MessagesScreen />, today: <StudentTodayScreen />, workout: <StudentWorkoutScreen />, assistant: <StudentAssistantScreen />,
      nutrition: <NutritionScreen />, 'student-form': <StudentFormScreen />,
    }
    return screens[page] ?? (role === 'trainer' ? <TrainerDashboard /> : <StudentTodayScreen />)
  }, [page, role])
  return <div className={`app-shell role-${role}`}><Sidebar /><div className="main-shell"><Topbar /><ProfessionalAccessBanner /><main id="main-content" tabIndex={-1}><span className="sr-only" role="status">Área atual: {pageTitle}</span><Suspense fallback={<RouteLoading />}>{screen}</Suspense></main></div><BottomNav /><Toast /></div>
}

function AppGate() {
  const { loading, session, profile, membership, professionalAccess } = useAuth()
  const [, refreshRoute] = useState(0)
  useEffect(() => {
    const updateRoute = () => refreshRoute((version) => version + 1)
    window.addEventListener('hashchange', updateRoute)
    window.addEventListener('popstate', updateRoute)
    return () => {
      window.removeEventListener('hashchange', updateRoute)
      window.removeEventListener('popstate', updateRoute)
    }
  }, [])
  const route = window.location.hash.replace('#/', '')
  const resetRoute = route === 'redefinir-senha'
  if (loading) return <AuthLoadingScreen />
  if (resetRoute || !session || !profile) return <AuthPage />
  const access = resolveEnrollmentAccess({ role: profile.accountRole, membership, professionalAccess })
  if (access === 'student-onboarding') return <StudentEnrollmentOnboarding />
  if (access === 'trainer-verification' || (route === 'verificacao' && professionalAccess?.mode === 'temporary_homologation')) return <TrainerVerificationScreen />
  if (access === 'blocked') return <AuthPage />
  // Remount all in-memory drafts if Auth ever replaces the active identity
  // without an intermediate signed-out render.
  return <EloAppProvider key={profile.id} lockedRole={profile.accountRole}><AppContent /></EloAppProvider>
}

export function App() {
  useEffect(() => { clearLegacyBrowserStorage() }, [])
  return <AuthProvider><NetworkStatusBanner /><AppGate /></AuthProvider>
}
