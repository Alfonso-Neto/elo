import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../App'
import { AuthLoadingScreen } from '../auth/AuthPage'
import { EloAppProvider, useEloApp } from '../app-state'

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/#/entrar')
})

describe('Elo authentication entry', () => {
  it('keeps the loading boundary reachable from the global skip link', () => {
    render(<AuthLoadingScreen />)
    expect(document.getElementById('main-content')).toHaveClass('auth-loading')
    expect(document.title).toBe('Validando acesso · Elo')
  })

  it('fails closed on the login page when remote auth is not configured', () => {
    localStorage.setItem('elo-pain', '[{"detail":"legacy-sensitive-context"}]')
    render(<App />)
    expect(screen.getByRole('heading', { name: /Entre no seu Elo/i })).toBeInTheDocument()
    expect(screen.getByText(/Ambiente sem conexão de autenticação/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Explorar demonstração/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Bom dia, André/i })).not.toBeInTheDocument()
    expect(document.getElementById('main-content')).toBeInTheDocument()
    expect(document.title).toBe('Entrar · Elo')
    expect(localStorage.getItem('elo-pain')).toBeNull()
  })

  it('describes validation errors and focuses the first invalid field', async () => {
    render(<App />)
    const submit = screen.getAllByRole('button', { name: /^Entrar$/i }).at(-1)
    expect(submit).toBeDefined()
    fireEvent.click(submit!)
    const email = screen.getByLabelText(/^E-mail$/i)
    expect(email).toHaveAttribute('aria-describedby', 'login-email-error')
    expect(screen.getByText('Informe um e-mail válido.')).toHaveAttribute('id', 'login-email-error')
    await waitFor(() => expect(email).toHaveFocus())
  })

  it('progressively reveals the professional registration fields', () => {
    window.history.replaceState(null, '', '/#/cadastro')
    render(<App />)
    expect(screen.getByRole('heading', { name: /Como você chega ao Elo/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Sou professor/i }))
    expect(screen.getByRole('heading', { name: /Crie sua presença no Elo/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Número do CREF/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/UF do CREF/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Estúdio ou marca/i)).toBeInTheDocument()
  })

  it('keeps the student registration free of professional and health-consent fields', () => {
    window.history.replaceState(null, '', '/#/cadastro')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Sou aluno/i }))
    expect(screen.queryByLabelText(/CREF/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/consentimento de saúde/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Nome completo/i)).toBeInTheDocument()
  })

  it('does not treat the legacy demo query as authenticated access', () => {
    window.history.replaceState(null, '', '/?demo=1&role=trainer#/dashboard')
    render(<App />)
    expect(screen.getByRole('heading', { name: /Entre no seu Elo/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Bom dia, André/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Explorar demonstração/i })).not.toBeInTheDocument()
    expect(window.location.search).toBe('')
  })
})

function LockedRoleProbe() {
  const { role, page, navigate } = useEloApp()
  return <div>
    <output aria-label="papel">{role}</output><output aria-label="pagina">{page}</output>
    <button onClick={() => navigate('dashboard')}>Tentar abrir painel</button>
    <button onClick={() => navigate('messages')}>Abrir rota compartilhada</button>
  </div>
}

describe('authenticated role lock', () => {
  it('derives routing only from the required server role and ignores the legacy role query', () => {
    window.history.replaceState(null, '', '/?role=trainer#/dashboard')
    localStorage.setItem('elo-auth', 'active-session')
    const view = render(<EloAppProvider lockedRole="student"><LockedRoleProbe /></EloAppProvider>)

    expect(screen.getByLabelText('papel')).toHaveTextContent('student')
    expect(screen.getByLabelText('pagina')).toHaveTextContent('today')

    fireEvent.click(screen.getByRole('button', { name: /Abrir rota compartilhada/i }))
    expect(screen.getByLabelText('pagina')).toHaveTextContent('messages')
    expect(window.location.hash).toBe('#/messages')

    fireEvent.click(screen.getByRole('button', { name: /Tentar abrir painel/i }))
    expect(screen.getByLabelText('papel')).toHaveTextContent('student')
    expect(screen.getByLabelText('pagina')).toHaveTextContent('today')
    expect(window.location.hash).toBe('#/today')

    view.rerender(<EloAppProvider lockedRole="trainer"><LockedRoleProbe /></EloAppProvider>)
    expect(screen.getByLabelText('papel')).toHaveTextContent('trainer')
    expect(screen.getByLabelText('pagina')).toHaveTextContent('dashboard')
    expect(window.location.hash).toBe('#/dashboard')
    expect(localStorage.getItem('elo-auth')).toBe('active-session')
  })
})
