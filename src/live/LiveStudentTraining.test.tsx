import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PrototypeProvider, usePrototype } from '../prototype-context'
import { LiveStudentWorkoutScreen } from './LiveStudentTraining'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getLatestWorkoutVersion: vi.fn(),
}))

vi.mock('../auth/auth-context', () => ({ useAuth: mocks.useAuth }))
vi.mock('./training', async (importOriginal) => ({
  ...await importOriginal<typeof import('./training')>(),
  getLatestWorkoutVersion: mocks.getLatestWorkoutVersion,
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const studentId = '33333333-3333-4333-8333-333333333333'

function EntryProbe() {
  const { assistantEntry, page } = usePrototype()
  return <output>{`${page}:${assistantEntry?.movement ?? 'sem-contexto'}`}</output>
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/#/workout')
  mocks.useAuth.mockReturnValue({
    membership: { workspaceId, workspaceName: 'Studio Elo', membershipRole: 'student', trainerName: 'André Lima' },
    profile: { id: studentId, accountRole: 'student', displayName: 'Marina Costa' },
  })
  mocks.getLatestWorkoutVersion.mockResolvedValue({
    id: '55555555-5555-4555-8555-555555555555', workspaceId, studentUserId: studentId,
    publishedByUserId: '22222222-2222-4222-8222-222222222222', publishedByRole: 'trainer', versionNumber: 2,
    title: 'Inferiores', publishedAt: '2026-08-07T12:00:00.000Z',
    exercises: [{
      id: 'bulgarian', name: 'Agachamento búlgaro', muscle: 'Quadríceps', sets: '3', reps: '10', load: '16 kg',
      rest: '75s', tempo: '3-1-1', rir: '2', note: 'Mantenha o movimento confortável.',
    }],
  })
})

describe('authenticated student workout', () => {
  it('opens a transient exercise-scoped pain report without browser persistence', async () => {
    render(<PrototypeProvider lockedRole="student"><LiveStudentWorkoutScreen /><EntryProbe /></PrototypeProvider>)

    const exerciseTitle = await screen.findByText('Agachamento búlgaro')
    fireEvent.click(exerciseTitle.closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: /Senti dor neste exercício/i }))

    expect(screen.getByText('assistant:Agachamento búlgaro')).toBeInTheDocument()
    expect(window.location.hash).toBe('#/assistant')
    expect(JSON.stringify({ ...localStorage })).not.toContain('Agachamento búlgaro')
  })
})
