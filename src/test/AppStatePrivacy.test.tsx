import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { EloAppProvider, legacyBrowserStorageKeys, useEloApp } from '../app-state'

function StateProbe() {
  const {
    assistantEntry, formLastSentDrafts, formSessionDrafts, messageSessionDrafts,
    openExercisePainReport, setFormLastSentDrafts, setFormSessionDrafts, setMessageSessionDrafts,
    setStudentWorkoutPinnedVersions, setStudentWorkoutSessionDrafts, setWorkoutSessionDrafts,
    studentWorkoutPinnedVersions, studentWorkoutSessionDrafts, workoutSessionDrafts,
  } = useEloApp()
  return <div>
    <output>{assistantEntry?.movement ?? 'no-assistant-entry'}</output>
    <output>{`drafts:${Object.keys(workoutSessionDrafts).length}`}</output>
    <output>{`student-workout-drafts:${Object.keys(studentWorkoutSessionDrafts).length}`}</output>
    <output>{`student-workout-pins:${Object.keys(studentWorkoutPinnedVersions).length}`}</output>
    <output>{`form-drafts:${Object.keys(formSessionDrafts).length}`}</output>
    <output>{`sent-form-drafts:${Object.keys(formLastSentDrafts).length}`}</output>
    <output>{`message-drafts:${Object.keys(messageSessionDrafts).length}`}</output>
    <button onClick={() => openExercisePainReport('  Movimento\nprivado  ')}>Open exercise pain flow</button>
    <button onClick={() => setWorkoutSessionDrafts({
      'remote-student': { title: 'Rascunho privado', exercises: [{ id: 'private', name: 'Movimento confidencial', muscle: 'Teste', sets: '3', reps: '10', load: '', rest: '', tempo: '', rir: '', note: '' }] },
    })}>Keep private session draft</button>
    <button onClick={() => setStudentWorkoutSessionDrafts({
      'private-workspace:remote-student:private-version': {
        completedExerciseIds: ['movimento-confidencial'],
        elapsedSeconds: 81,
        runningSince: 1_722_000_000_000,
        feedback: { rpe: 9, mood: 'Pesado', comment: 'Feedback de saúde confidencial' },
        completionIdempotencyKey: 'complete-workout-private-key',
        completion: {
          state: 'pending',
          snapshot: {
            workoutVersionId: 'private-version',
            workoutTitle: 'Treino confidencial em andamento',
            completedExerciseIds: ['movimento-confidencial'],
            rpe: 9,
            mood: 'Pesado',
            comment: 'Feedback de saúde confidencial',
            idempotencyKey: 'complete-workout-private-key',
          },
        },
      },
    })}>Keep private student workout draft</button>
    <button onClick={() => setStudentWorkoutPinnedVersions({
      'private-workspace:remote-student': {
        id: 'private-version',
        workspaceId: 'private-workspace',
        studentUserId: 'remote-student',
        publishedByUserId: 'private-trainer',
        publishedByRole: 'trainer',
        versionNumber: 8,
        title: 'Treino publicado confidencial',
        exercises: [{ id: 'private-exercise', name: 'Exercício clínico privado', muscle: 'Teste', sets: '3', reps: '8', load: '', rest: '', tempo: '', rir: '', note: 'Nota técnica reservada' }],
        publishedAt: '2026-08-08T12:00:00.000Z',
      },
    })}>Pin private student workout</button>
    <button onClick={() => {
      const draft = { title: 'Anamnese confidencial', questions: [{ id: 'private-question', label: 'Histórico sensível', type: 'long' as const, required: true }] }
      setFormSessionDrafts({ 'remote-student': draft })
      setFormLastSentDrafts({ 'remote-student': draft })
    }}>Keep private form draft</button>
    <button onClick={() => setMessageSessionDrafts({
      'remote-student': { body: 'Mensagem confidencial', idempotencyKey: 'thread-message-private-key' },
    })}>Keep private message draft</button>
  </div>
}

function IdentityScopedProbe({ identity }: { identity: string }) {
  return <EloAppProvider key={identity} lockedRole="student"><StateProbe /></EloAppProvider>
}

describe('authenticated Elo app-state privacy boundary', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '#/today')
  })

  it('never hydrates or persists authenticated state through legacy demo storage', async () => {
    localStorage.setItem('elo-pain', JSON.stringify([{ id: 'legacy-health-record' }]))
    localStorage.setItem('elo-messages', JSON.stringify([{ id: 'legacy-message' }]))
    localStorage.setItem('elo-other-messages', JSON.stringify([{ id: 'legacy-other-thread' }]))
    localStorage.setItem('elo-published-workout', JSON.stringify([{ id: 'legacy-workout' }]))
    localStorage.setItem('elo-auth', 'supabase-session-must-survive')

    render(<EloAppProvider lockedRole="student"><StateProbe /></EloAppProvider>)

    expect(screen.getByText('no-assistant-entry')).toBeInTheDocument()
    expect(screen.getByText('drafts:0')).toBeInTheDocument()
    expect(screen.getByText('student-workout-drafts:0')).toBeInTheDocument()
    expect(screen.getByText('form-drafts:0')).toBeInTheDocument()
    expect(screen.getByText('message-drafts:0')).toBeInTheDocument()
    await waitFor(() => {
      legacyBrowserStorageKeys.forEach((key) => expect(localStorage.getItem(key)).toBeNull())
    })
    expect(localStorage.getItem('elo-auth')).toBe('supabase-session-must-survive')

    fireEvent.click(screen.getByRole('button', { name: 'Open exercise pain flow' }))
    expect(screen.getByText('Movimento privado')).toBeInTheDocument()
    expect(JSON.stringify({ ...localStorage })).not.toContain('Movimento privado')

    fireEvent.click(screen.getByRole('button', { name: 'Keep private session draft' }))
    expect(screen.getByText('drafts:1')).toBeInTheDocument()
    expect(JSON.stringify({ ...localStorage })).not.toContain('Rascunho privado')
    expect(JSON.stringify({ ...localStorage })).not.toContain('Movimento confidencial')

    fireEvent.click(screen.getByRole('button', { name: 'Keep private student workout draft' }))
    expect(screen.getByText('student-workout-drafts:1')).toBeInTheDocument()
    expect(JSON.stringify({ ...localStorage })).not.toContain('movimento-confidencial')
    expect(JSON.stringify({ ...localStorage })).not.toContain('Feedback de saúde confidencial')
    expect(JSON.stringify({ ...localStorage })).not.toContain('complete-workout-private-key')

    fireEvent.click(screen.getByRole('button', { name: 'Pin private student workout' }))
    expect(screen.getByText('student-workout-pins:1')).toBeInTheDocument()
    expect(JSON.stringify({ ...localStorage })).not.toContain('Treino publicado confidencial')
    expect(JSON.stringify({ ...localStorage })).not.toContain('Exercício clínico privado')
    expect(JSON.stringify({ ...localStorage })).not.toContain('Nota técnica reservada')

    fireEvent.click(screen.getByRole('button', { name: 'Keep private form draft' }))
    expect(screen.getByText('form-drafts:1')).toBeInTheDocument()
    expect(screen.getByText('sent-form-drafts:1')).toBeInTheDocument()
    expect(JSON.stringify({ ...localStorage })).not.toContain('Anamnese confidencial')
    expect(JSON.stringify({ ...localStorage })).not.toContain('Histórico sensível')

    fireEvent.click(screen.getByRole('button', { name: 'Keep private message draft' }))
    expect(screen.getByText('message-drafts:1')).toBeInTheDocument()
    expect(JSON.stringify({ ...localStorage })).not.toContain('Mensagem confidencial')
    expect(JSON.stringify({ ...localStorage })).not.toContain('thread-message-private-key')
  })

  it('drops every in-memory draft when the authenticated identity scope changes', () => {
    const view = render(<IdentityScopedProbe identity="first-user" />)

    fireEvent.click(screen.getByRole('button', { name: 'Keep private session draft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep private student workout draft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep private form draft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep private message draft' }))
    expect(screen.getByText('drafts:1')).toBeInTheDocument()
    expect(screen.getByText('student-workout-drafts:1')).toBeInTheDocument()
    expect(screen.getByText('form-drafts:1')).toBeInTheDocument()
    expect(screen.getByText('message-drafts:1')).toBeInTheDocument()

    view.rerender(<IdentityScopedProbe identity="second-user" />)

    expect(screen.getByText('drafts:0')).toBeInTheDocument()
    expect(screen.getByText('student-workout-drafts:0')).toBeInTheDocument()
    expect(screen.getByText('form-drafts:0')).toBeInTheDocument()
    expect(screen.getByText('message-drafts:0')).toBeInTheDocument()
    expect(JSON.stringify({ ...localStorage })).not.toContain('confidencial')
  })

  it('warns before a browser exit only while an in-memory draft is unsent', () => {
    const view = render(<IdentityScopedProbe identity="first-user" />)
    const cleanExit = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanExit)
    expect(cleanExit.defaultPrevented).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Keep private message draft' }))
    const dirtyExit = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyExit)
    expect(dirtyExit.defaultPrevented).toBe(true)

    view.rerender(<IdentityScopedProbe identity="second-user" />)
    const resetExit = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(resetExit)
    expect(resetExit.defaultPrevented).toBe(false)
  })
})
