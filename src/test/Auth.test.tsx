import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { App } from '../App'
import { PrototypeProvider, usePrototype } from '../prototype-context'

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/#/entrar')
})

describe('Elo authentication entry', () => {
  it('fails closed on the login page when remote auth is not configured', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /Entre no seu Elo/i })).toBeInTheDocument()
    expect(screen.getByText(/Ambiente sem conexão de autenticação/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Explorar demonstração/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Bom dia, André/i })).not.toBeInTheDocument()
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

  it('enters demo mode only after an explicit action', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Explorar demonstração/i }))
    expect(await screen.findByRole('heading', { name: /Bom dia, André/i })).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('demo')).toBe('1')
  })
})

function LockedRoleProbe() {
  const { role, page, switchRole, navigate, resetPrototype } = usePrototype()
  return <div>
    <output aria-label="papel">{role}</output><output aria-label="pagina">{page}</output>
    <button onClick={() => switchRole('trainer')}>Tentar elevar papel</button>
    <button onClick={() => navigate('dashboard')}>Tentar abrir painel</button>
    <button onClick={resetPrototype}>Reiniciar</button>
  </div>
}

describe('authenticated role lock', () => {
  it('ignores query, navigation, switching, and reset attempts that conflict with the server role', () => {
    window.history.replaceState(null, '', '/?role=trainer#/dashboard')
    localStorage.setItem('elo-auth', 'active-session')
    render(<PrototypeProvider lockedRole="student"><LockedRoleProbe /></PrototypeProvider>)
    expect(screen.getByLabelText('papel')).toHaveTextContent('student')
    expect(screen.getByLabelText('pagina')).toHaveTextContent('today')
    fireEvent.click(screen.getByRole('button', { name: /Tentar elevar papel/i }))
    fireEvent.click(screen.getByRole('button', { name: /Tentar abrir painel/i }))
    fireEvent.click(screen.getByRole('button', { name: /Reiniciar/i }))
    expect(screen.getByLabelText('papel')).toHaveTextContent('student')
    expect(screen.getByLabelText('pagina')).toHaveTextContent('today')
    expect(window.location.hash).toBe('#/today')
    expect(localStorage.getItem('elo-auth')).toBe('active-session')
  })
})
