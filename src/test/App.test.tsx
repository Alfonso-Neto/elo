import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '../App'

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/?demo=1#/dashboard')
})

describe('Elo validation prototype', () => {
  it('starts in the trainer experience without finance', async () => {
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: /Bom dia, André/i }, { timeout: 3_000 }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Financeiro/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Copiloto/i).length).toBeGreaterThan(0)
    expect(screen.getByText('Área atual: Visão geral')).toBeInTheDocument()
    expect(document.title).toBe('Visão geral · Elo')
  })

  it('closes the pain-report loop across roles', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Aluna$/i }))
    expect(await screen.findByRole('heading', { name: /Oi, Marina/i })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /Assistente/i })[0])
    fireEvent.click(await screen.findByRole('button', { name: /Senti uma dor/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Joelho direito' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leg press 45°' }))
    fireEvent.click(screen.getByRole('button', { name: 'Durante a descida' }))
    fireEvent.click(screen.getByRole('button', { name: '6' }))
    fireEvent.click(screen.getByRole('button', { name: /Nenhum desses sinais/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }))
    fireEvent.change(screen.getByPlaceholderText(/começou na terceira série/i), { target: { value: 'Melhorou quando parei.' } })
    fireEvent.click(screen.getByRole('button', { name: /Revisar relato/i }))
    fireEvent.click(screen.getByLabelText(/Autorizo salvar e compartilhar/i))
    fireEvent.click(screen.getByRole('button', { name: /Enviar ao André/i }))
    expect(screen.getByRole('heading', { name: /O André já recebeu/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Treinador$/i }))
    expect(await screen.findByText(/4 relatos sobre o joelho/i)).toBeInTheDocument()
  })

  it('publishes a builder change to the student workout', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Treinos/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar exercício/i }))
    const dialog = screen.getByRole('dialog', { name: /Biblioteca de exercícios/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /Stiff com halteres/i }))
    expect(screen.getByText('Stiff com halteres')).toBeInTheDocument()
    expect(localStorage.getItem('elo-workout')).toContain('Stiff com halteres')
    fireEvent.click(screen.getByRole('button', { name: /Enviar para Marina/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Aluna$/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /Treino/i })[0])
    expect(await screen.findByText('Stiff com halteres')).toBeInTheDocument()
  })

  it('validates consent and exposes submitted anamnesis answers to the trainer', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Aluna$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Anamnese$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Revisar e enviar/i }))
    expect(screen.getByText(/precisa registrar o consentimento/i)).toBeInTheDocument()
    const consent = screen.getByLabelText(/Li e concordo/i)
    expect(consent).toHaveAttribute('aria-describedby', 'student-form-consent-error')
    await waitFor(() => expect(consent).toHaveFocus())
    fireEvent.click(consent)
    fireEvent.click(screen.getByRole('button', { name: 'Ganhar massa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }))
    fireEvent.change(screen.getByRole('textbox', { name: /Tem alguma lesão ou dor atual/i }), { target: { value: 'Dor leve no joelho direito.' } })
    fireEvent.click(screen.getByRole('button', { name: /Revisar e enviar/i }))
    expect(screen.getByRole('heading', { name: /Anamnese concluída/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Treinador$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Anamneses$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Marina Costa/i }))
    expect(screen.getByRole('dialog', { name: /Respostas de Marina/i })).toBeInTheDocument()
    expect(screen.getByText('Dor leve no joelho direito.')).toBeInTheDocument()
  })

  it('keeps the student conversation private and addressed to the trainer', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Aluna$/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /^Conversas$/i })[0])
    expect(await screen.findByText('André Lima')).toBeInTheDocument()
    expect(screen.queryByText('Rafael Lima')).not.toBeInTheDocument()
    expect(screen.queryByText('Bianca Souza')).not.toBeInTheDocument()
  })

  it('delivers post-workout feedback to the trainer dashboard', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Aluna$/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /^Treino$/i })[0])
    fireEvent.click(await screen.findByRole('button', { name: /Finalizar treino/i }))
    const dialog = screen.getByRole('dialog', { name: /Como foi para você/i })
    fireEvent.change(within(dialog).getByRole('slider'), { target: { value: '9' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pesado' }))
    fireEvent.change(within(dialog).getByPlaceholderText(/dor, dificuldade ou conquista/i), { target: { value: 'Joelho ficou estável.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Enviar feedback/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Treinador$/i }))
    expect(await screen.findByText(/RPE 9\/10 · Pesado · Joelho ficou estável/i)).toBeInTheDocument()
  })

  it('publishes the selected Copilot strategy instead of the untouched workout', async () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: /^Copiloto$/i })[0])
    fireEvent.click(await screen.findByRole('button', { name: /Trocar o estímulo por agora/i }))
    fireEvent.click(screen.getByRole('button', { name: /Manter o volume planejado/i }))
    expect(await screen.findByText('Abdução de quadril')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Revisar e enviar/i }))
    const dialog = screen.getByRole('dialog', { name: /Seu último olhar/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /Sim, confirmar e enviar/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Aluna$/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /^Treino$/i })[0])
    expect(screen.getByText('Abdução de quadril')).toBeInTheDocument()
    expect(screen.queryByText('Leg press 45°')).not.toBeInTheDocument()
  })

  it('does not expose a trainer form draft before it is sent', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Anamneses$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Corrida \/ endurance.*Corredores/i }))
    expect(await screen.findByDisplayValue(/Qual distância você corre atualmente/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Aluna$/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /^Anamnese$/i })[0])
    expect(await screen.findByText('Qual é o seu objetivo principal?')).toBeInTheDocument()
    expect(screen.queryByText('Qual distância você corre atualmente?')).not.toBeInTheDocument()
  })

  it('normalizes a student entry URL to the student home', async () => {
    window.history.replaceState(null, '', '/?demo=1&role=student')
    render(<App />)
    expect(await screen.findByRole('heading', { name: /Oi, Marina/i })).toBeInTheDocument()
  })
})
