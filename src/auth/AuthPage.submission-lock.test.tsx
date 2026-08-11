import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthPage } from './AuthPage'

const auth = vi.hoisted(() => ({
  signIn: vi.fn(),
}))

vi.mock('./auth-context', () => ({
  useAuth: () => ({
    configured: true,
    configurationIssue: null,
    accessError: null,
    recoveryMode: false,
    signIn: auth.signIn,
  }),
}))

beforeEach(() => {
  auth.signIn.mockReset()
  window.history.replaceState(null, '', '/#/entrar')
})

describe('authentication submission lock', () => {
  it('coalesces rapid valid login submissions and unlocks after completion', async () => {
    let resolveFirst: (() => void) | undefined
    auth.signIn
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce(undefined)

    render(<AuthPage />)
    fireEvent.change(screen.getByLabelText(/^E-mail$/i), { target: { value: 'aluno@example.com' } })
    fireEvent.change(screen.getByLabelText(/^Senha$/i), { target: { value: 'senha-valida' } })
    const submit = screen.getAllByRole('button', { name: /^Entrar$/i }).at(-1)!
    const form = submit.closest('form')!

    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(auth.signIn).toHaveBeenCalledTimes(1)
    expect(auth.signIn).toHaveBeenCalledWith('aluno@example.com', 'senha-valida')

    resolveFirst?.()
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.submit(form)
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledTimes(2))
  })
})
