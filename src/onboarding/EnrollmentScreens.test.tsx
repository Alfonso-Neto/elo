import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentEnrollmentOnboarding, TrainerStudentsEnrollment } from './EnrollmentScreens'

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }))
const enrollment = vi.hoisted(() => ({
  acceptWorkspaceInvitation: vi.fn(),
  createWorkspaceInvitation: vi.fn(),
  listEnrolledStudents: vi.fn(),
}))

vi.mock('../auth/auth-context', () => ({ useAuth: auth.useAuth }))
vi.mock('./enrollment-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./enrollment-service')>()
  return { ...actual, ...enrollment }
})

beforeEach(() => {
  vi.clearAllMocks()
  enrollment.listEnrolledStudents.mockResolvedValue([])
  auth.useAuth.mockReturnValue({
    profile: { id: '0a258739-7658-4012-b747-0f95dca6372c', displayName: 'Marina Costa', accountRole: 'student' },
    membership: { workspaceId: '23ccf1ec-a377-4b45-a401-11d28a8a1503', workspaceName: 'Studio Horizonte', membershipRole: 'owner', trainerName: 'André Lima' },
    refreshMembership: vi.fn(),
    signOut: vi.fn(),
  })
})

describe('enrollment interface boundaries', () => {
  it('exposes the student onboarding as the main route and preserves a rejected code for correction', async () => {
    enrollment.acceptWorkspaceInvitation.mockRejectedValue(new Error('Não foi possível validar este convite.'))
    render(<StudentEnrollmentOnboarding />)

    const input = screen.getByLabelText('Código de convite')
    const code = 'ELO-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-1111-2222'
    fireEvent.change(input, { target: { value: code } })
    fireEvent.click(screen.getByRole('button', { name: /Conectar ao professor/i }))

    const alert = await screen.findByRole('alert')
    expect(document.getElementById('main-content')).toHaveClass('enrollment-main')
    expect(document.title).toBe('Vincular professor · Elo')
    expect(alert).toHaveAttribute('id', 'invite-code-error')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'invite-code-help invite-code-error')
    expect(input).toHaveValue(code)
    await waitFor(() => expect(input).toHaveFocus())
  })

  it('links trainer invitation failures to the email field and returns focus for correction', async () => {
    enrollment.createWorkspaceInvitation.mockRejectedValue(new Error('Não foi possível gerar o convite agora.'))
    render(<TrainerStudentsEnrollment />)

    fireEvent.click(screen.getByRole('button', { name: /Convidar aluno/i }))
    const input = screen.getByLabelText('Email do aluno')
    fireEvent.change(input, { target: { value: 'aluna@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Gerar código de homologação/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('id', 'invitation-email-error')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'invitation-email-error')
    expect(input).toHaveValue('aluna@example.com')
    await waitFor(() => expect(input).toHaveFocus())
  })
})
