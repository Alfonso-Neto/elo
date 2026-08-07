import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PrototypeProvider, legacyPrototypeStorageKeys, usePrototype } from '../prototype-context'

function StateProbe() {
  const { addPainReport, messages, painReports, studentWorkout } = usePrototype()
  return <div>
    <output>{`pain:${painReports.length} messages:${messages.length} workout:${studentWorkout.length}`}</output>
    <button onClick={() => addPainReport({
      studentId: 'remote-student',
      studentName: 'Conta remota',
      location: 'Joelho direito',
      moment: 'Durante o treino',
      intensity: 4,
    })}>Mutate remote state</button>
  </div>
}

describe('authenticated workspace privacy boundary', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '#/today')
  })

  it('never hydrates or persists authenticated state through legacy demo storage', async () => {
    localStorage.setItem('elo-pain', JSON.stringify([{ id: 'legacy-health-record' }]))
    localStorage.setItem('elo-messages', JSON.stringify([{ id: 'legacy-message' }]))
    localStorage.setItem('elo-published-workout', JSON.stringify([{ id: 'legacy-workout' }]))

    render(<PrototypeProvider lockedRole="student"><StateProbe /></PrototypeProvider>)

    expect(screen.getByText('pain:0 messages:0 workout:0')).toBeInTheDocument()
    await waitFor(() => {
      legacyPrototypeStorageKeys.forEach((key) => expect(localStorage.getItem(key)).toBeNull())
    })

    fireEvent.click(screen.getByRole('button', { name: 'Mutate remote state' }))
    expect(screen.getByText('pain:1 messages:0 workout:0')).toBeInTheDocument()
    expect(localStorage.getItem('elo-pain')).toBeNull()
  })
})
