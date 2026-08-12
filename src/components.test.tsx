import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BackButton, Button, Modal, MovementDemo, Segmented } from './components'

describe('shared button contracts', () => {
  it('does not submit a containing form unless submit is explicit', () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
    render(<form onSubmit={submit}>
      <Button>Ação secundária</Button>
      <Button type="submit">Confirmar</Button>
    </form>)

    fireEvent.click(screen.getByRole('button', { name: 'Ação secundária' }))
    expect(submit).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('keeps navigation and segmented controls out of implicit form submission', () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
    const back = vi.fn()
    const select = vi.fn()
    render(<form onSubmit={submit}>
      <BackButton onClick={back} />
      <Segmented value="one" onChange={select} label="Escolha" options={[
        { value: 'one', label: 'Um' },
        { value: 'two', label: 'Dois' },
      ]} />
    </form>)

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dois' }))

    expect(back).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledWith('two')
    expect(submit).not.toHaveBeenCalled()
  })

  it('keeps the movement control out of implicit form submission', () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
    const toggle = vi.fn()
    render(<form onSubmit={submit}>
      <MovementDemo name="Agachamento" playing={false} onToggle={toggle} />
    </form>)

    fireEvent.click(screen.getByRole('button', { name: 'Tocar demonstração' }))

    expect(toggle).toHaveBeenCalledTimes(1)
    expect(submit).not.toHaveBeenCalled()
  })
})

function ModalHarness({ close = vi.fn() }: { close?: () => void }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" onClick={() => setOpen(true)}>Abrir diálogo</button>
    {open && <Modal title="Revisar informação" onClose={() => { close(); setOpen(false) }}>
      <label>Nome <input autoFocus /></label>
      <button type="button">Última ação</button>
    </Modal>}
  </>
}

describe('shared dialog behavior', () => {
  it('focuses content, traps focus, closes on Escape, and restores the trigger', async () => {
    render(<ModalHarness />)
    const trigger = screen.getByRole('button', { name: 'Abrir diálogo' })
    trigger.focus()
    fireEvent.click(trigger)

    const input = screen.getByRole('textbox', { name: 'Nome' })
    await waitFor(() => expect(input).toHaveFocus())
    expect(document.body).toHaveClass('modal-open')

    const last = screen.getByRole('button', { name: 'Última ação' })
    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(document.body).not.toHaveClass('modal-open')
  })

  it('ignores secondary-button presses on the backdrop', async () => {
    const close = vi.fn()
    render(<ModalHarness close={close} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir diálogo' }))
    const dialog = await screen.findByRole('dialog')
    const backdrop = dialog.parentElement!

    fireEvent.mouseDown(backdrop, { button: 2 })
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.mouseDown(backdrop, { button: 0 })
    expect(close).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
