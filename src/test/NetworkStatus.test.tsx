import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NetworkStatusBanner } from '../App'

const setOnline = (online: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, value: online })

describe('network status feedback', () => {
  afterEach(() => setOnline(true))

  it('shows offline feedback and clears it when connectivity returns', () => {
    setOnline(false)
    render(<NetworkStatusBanner />)
    expect(screen.getByText('Sem conexão')).toBeInTheDocument()

    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByText('Sem conexão')).not.toBeInTheDocument()
  })
})
