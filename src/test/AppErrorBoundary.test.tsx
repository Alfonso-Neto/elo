import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '../AppErrorBoundary'

function BrokenScreen(): never {
  throw new Error('render failed')
}

describe('application render boundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('replaces a broken screen with a safe recovery action', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()

    render(<AppErrorBoundary onReload={reload}><BrokenScreen /></AppErrorBoundary>)

    expect(screen.getByRole('alert')).toHaveTextContent('Esta área não abriu como deveria.')
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar o Elo' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
