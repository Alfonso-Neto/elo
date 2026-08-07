import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { publicSupabaseConfig, supabase } from '../lib/supabase'
import { boundedText, isCanonicalUuid } from '../onboarding/boundary-validation'
import type { Role } from '../types'

export type AuthProfile = {
  id: string
  accountRole: Role
  displayName: string
}

export type ActiveMembership = {
  workspaceId: string
  workspaceName: string
  membershipRole: 'owner' | 'trainer' | 'student'
  trainerName: string
}

export type SignUpInput = {
  role: Role
  displayName: string
  email: string
  password: string
  crefNumber?: string
  crefState?: string
  studioName?: string
}

type AuthContextValue = {
  configured: boolean
  configurationIssue: string | null
  loading: boolean
  session: Session | null
  profile: AuthProfile | null
  membership: ActiveMembership | null
  isDemo: boolean
  recoveryMode: boolean
  accessError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<void>
  resendConfirmation: (email: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  refreshMembership: () => Promise<ActiveMembership | null>
  signOut: () => Promise<void>
  enterDemo: () => void
  leaveDemo: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const unavailableMessage = 'A autenticação da homologação ainda não está configurada neste ambiente.'
const genericSignInMessage = 'Não foi possível entrar com esses dados. Confira as informações e tente novamente.'
const genericSignUpMessage = 'Não foi possível concluir o cadastro agora. Revise os dados e tente novamente.'
const genericPasswordMessage = 'Não foi possível atualizar a senha. Solicite um novo link e tente novamente.'

function redirectTo(route: 'confirmar-email' | 'redefinir-senha') {
  return `${window.location.origin}${window.location.pathname}#/${route}`
}

export function normalizeProfile(row: unknown, expectedId: string): AuthProfile | null {
  if (!row || typeof row !== 'object') return null
  const candidate = row as { id?: unknown; account_role?: unknown; display_name?: unknown }
  if (!isCanonicalUuid(expectedId) || !isCanonicalUuid(candidate.id) || candidate.id !== expectedId) return null
  if (candidate.account_role !== 'trainer' && candidate.account_role !== 'student') return null
  const displayName = boundedText(candidate.display_name)
  if (!displayName) return null
  return { id: candidate.id, accountRole: candidate.account_role, displayName }
}

export function normalizeMembership(data: unknown): ActiveMembership | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null
  const candidate = row as Record<string, unknown>
  if (!isCanonicalUuid(candidate.workspace_id)) return null
  const workspaceName = boundedText(candidate.workspace_name)
  const trainerName = boundedText(candidate.trainer_name)
  if (!workspaceName || !trainerName) return null
  if (!['owner', 'trainer', 'student'].includes(String(candidate.membership_role))) return null
  return {
    workspaceId: candidate.workspace_id,
    workspaceName,
    membershipRole: candidate.membership_role as ActiveMembership['membershipRole'],
    trainerName,
  }
}

function homeFor(role: Role) {
  return role === 'trainer' ? 'dashboard' : 'today'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(() => new URLSearchParams(window.location.search).get('demo') === '1')
  const [loading, setLoading] = useState(() => !isDemo && publicSupabaseConfig.configured)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [membership, setMembership] = useState<ActiveMembership | null>(null)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(publicSupabaseConfig.issue)
  const requestVersion = useRef(0)

  const loadAuthoritativeProfile = useCallback(async (nextSession: Session, event?: AuthChangeEvent) => {
    if (!supabase) return
    const version = ++requestVersion.current
    setLoading(true)
    setAccessError(null)

    const { data, error } = await supabase
      .from('profiles')
      .select('id, account_role, display_name')
      .eq('id', nextSession.user.id)
      .maybeSingle()

    if (version !== requestVersion.current) return
    const nextProfile = error ? null : normalizeProfile(data, nextSession.user.id)
    if (!nextProfile) {
      setSession(null)
      setProfile(null)
      setMembership(null)
      setLoading(false)
      setAccessError('Não foi possível validar o perfil desta conta. Entre novamente ou fale com o suporte.')
      await supabase.auth.signOut({ scope: 'local' })
      return
    }

    const { data: membershipData, error: membershipError } = await supabase.rpc('get_my_active_membership')
    if (version !== requestVersion.current) return
    const nextMembership = membershipError ? null : normalizeMembership(membershipData)
    const hasExpectedMembership = nextProfile.accountRole === 'student'
      ? !nextMembership || nextMembership.membershipRole === 'student'
      : Boolean(nextMembership && ['owner', 'trainer'].includes(nextMembership.membershipRole))
    if (membershipError || !hasExpectedMembership) {
      setSession(null)
      setProfile(null)
      setMembership(null)
      setLoading(false)
      setAccessError('Não foi possível validar o espaço desta conta. Entre novamente ou fale com o suporte.')
      await supabase.auth.signOut({ scope: 'local' })
      return
    }

    setSession(nextSession)
    setProfile(nextProfile)
    setMembership(nextMembership)
    setLoading(false)
    if (event === 'PASSWORD_RECOVERY') {
      setRecoveryMode(true)
      window.history.replaceState(null, '', '#/redefinir-senha')
      return
    }
    setRecoveryMode(false)
    const route = window.location.hash.replace('#/', '')
    if (['entrar', 'cadastro', 'confirmar-email', 'recuperar-senha'].includes(route)) {
      window.history.replaceState(null, '', `#/${homeFor(nextProfile.accountRole)}`)
    }
  }, [])

  useEffect(() => {
    const client = supabase
    if (isDemo || !client) {
      requestVersion.current += 1
      setSession(null)
      setProfile(null)
      setMembership(null)
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error || !data.session) {
        setSession(null)
        setProfile(null)
        setMembership(null)
        setLoading(false)
        if (error) setAccessError('Não foi possível validar sua sessão. Tente entrar novamente.')
        return
      }
      void loadAuthoritativeProfile(data.session)
    })

    const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
      window.setTimeout(() => {
        if (!active) return
        if (!nextSession || event === 'SIGNED_OUT') {
          requestVersion.current += 1
          setSession(null)
          setProfile(null)
          setMembership(null)
          setRecoveryMode(false)
          setLoading(false)
          return
        }
        void loadAuthoritativeProfile(nextSession, event)
      }, 0)
    })

    return () => {
      active = false
      requestVersion.current += 1
      listener.subscription.unsubscribe()
    }
  }, [isDemo, loadAuthoritativeProfile])

  const ensureClient = useCallback(() => {
    if (!supabase) throw new Error(unavailableMessage)
    return supabase
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const client = ensureClient()
    setAccessError(null)
    const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) throw new Error(genericSignInMessage)
  }, [ensureClient])

  const signUp = useCallback(async (input: SignUpInput) => {
    const client = ensureClient()
    setAccessError(null)
    const metadata: Record<string, string> = {
      requested_role: input.role,
      display_name: input.displayName.trim(),
    }
    if (input.role === 'trainer') {
      metadata.cref_number = input.crefNumber?.trim().toUpperCase() ?? ''
      metadata.cref_state = input.crefState?.trim().toUpperCase() ?? ''
      if (input.studioName?.trim()) metadata.studio_name = input.studioName.trim()
    }
    const { error } = await client.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: { data: metadata, emailRedirectTo: redirectTo('confirmar-email') },
    })
    if (error) throw new Error(genericSignUpMessage)
  }, [ensureClient])

  const resendConfirmation = useCallback(async (email: string) => {
    const client = ensureClient()
    try {
      await client.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: redirectTo('confirmar-email') },
      })
    } catch { /* Keep this response indistinguishable to prevent account enumeration. */ }
  }, [ensureClient])

  const requestPasswordReset = useCallback(async (email: string) => {
    const client = ensureClient()
    try {
      await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: redirectTo('redefinir-senha') })
    } catch { /* Keep this response indistinguishable to prevent account enumeration. */ }
  }, [ensureClient])

  const updatePassword = useCallback(async (password: string) => {
    const client = ensureClient()
    const { error } = await client.auth.updateUser({ password })
    if (error) throw new Error(genericPasswordMessage)
    const { error: signOutError } = await client.auth.signOut({ scope: 'global' })
    if (signOutError) await client.auth.signOut({ scope: 'local' })
    requestVersion.current += 1
    setSession(null)
    setProfile(null)
    setMembership(null)
    setRecoveryMode(false)
    window.history.replaceState(null, '', '#/entrar')
  }, [ensureClient])

  const refreshMembership = useCallback(async () => {
    if (!supabase || !session || !profile) return null
    const { data, error } = await supabase.rpc('get_my_active_membership')
    if (error) throw new Error('Não foi possível atualizar o vínculo desta conta.')
    const nextMembership = normalizeMembership(data)
    const hasExpectedMembership = profile.accountRole === 'student'
      ? !nextMembership || nextMembership.membershipRole === 'student'
      : Boolean(nextMembership && ['owner', 'trainer'].includes(nextMembership.membershipRole))
    if (!hasExpectedMembership) throw new Error('Não foi possível atualizar o vínculo desta conta.')
    setMembership(nextMembership)
    return nextMembership
  }, [profile, session])

  const signOut = useCallback(async () => {
    setLoading(true)
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'global' })
      if (error) await supabase.auth.signOut({ scope: 'local' })
    }
    requestVersion.current += 1
    setSession(null)
    setProfile(null)
    setMembership(null)
    setRecoveryMode(false)
    setAccessError(null)
    setLoading(false)
    window.history.replaceState(null, '', '#/entrar')
  }, [])

  const enterDemo = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('demo', '1')
    url.searchParams.delete('role')
    url.hash = '/dashboard'
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    setAccessError(null)
    setIsDemo(true)
  }, [])

  const leaveDemo = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('demo')
    url.searchParams.delete('role')
    url.hash = '/entrar'
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    setIsDemo(false)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    configured: publicSupabaseConfig.configured,
    configurationIssue: publicSupabaseConfig.issue,
    loading,
    session,
    profile,
    membership,
    isDemo,
    recoveryMode,
    accessError,
    signIn,
    signUp,
    resendConfirmation,
    requestPasswordReset,
    updatePassword,
    refreshMembership,
    signOut,
    enterDemo,
    leaveDemo,
  }), [accessError, isDemo, loading, membership, profile, recoveryMode, requestPasswordReset, resendConfirmation, refreshMembership, session, signIn, signOut, signUp, updatePassword, enterDemo, leaveDemo])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
