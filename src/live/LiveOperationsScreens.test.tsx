import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EloAppProvider, useEloApp } from '../app-state'
import type { ThreadMessage } from './operations'
import { LiveMessagesScreen } from './LiveOperationsScreens'

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }))
const enrollment = vi.hoisted(() => ({ listEnrolledStudents: vi.fn() }))
const operations = vi.hoisted(() => ({
  listThreadMessages: vi.fn(),
  sendStudentThreadMessage: vi.fn(),
  sendTrainerThreadMessage: vi.fn(),
}))

const workspaceId = '23ccf1ec-a377-4b45-a401-11d28a8a1503'
const trainerId = 'a654f432-1a44-45ad-bf25-808674d483e6'
const marinaId = '0a258739-7658-4012-b747-0f95dca6372c'
const biancaId = '9a258739-7658-4012-b747-0f95dca6372d'
const trainerRoster = [
  { userId: marinaId, displayName: 'Marina Costa', joinedAt: null },
  { userId: biancaId, displayName: 'Bianca Rocha', joinedAt: null },
]

function message(studentUserId: string, body: string, sequence = 1): ThreadMessage {
  return {
    id: `${studentUserId}-${sequence}`,
    sequence,
    workspaceId,
    studentUserId,
    senderUserId: trainerId,
    senderRole: 'trainer',
    body,
    createdAt: `2026-08-08T12:${String(sequence).padStart(2, '0')}:00.000Z`,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function routeHarness() {
  function MessagesRouteHarness() {
    const { messageSessionDrafts, navigate, page } = useEloApp()
    return <>
      <output>{`message-drafts:${Object.keys(messageSessionDrafts).length}`}</output>
      {page === 'messages'
        ? <><button onClick={() => navigate('dashboard')}>Sair das mensagens</button><LiveMessagesScreen /></>
        : <button onClick={() => navigate('messages')}>Voltar às mensagens</button>}
    </>
  }
  return <MessagesRouteHarness />
}

vi.mock('../auth/auth-context', () => ({ useAuth: auth.useAuth }))
vi.mock('../onboarding/enrollment-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../onboarding/enrollment-service')>()
  return { ...actual, listEnrolledStudents: enrollment.listEnrolledStudents }
})
vi.mock('./operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./operations')>()
  return { ...actual, createOperationsService: () => operations }
})

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '#/messages')
  auth.useAuth.mockReturnValue({
    profile: { id: trainerId, displayName: 'André Lima', accountRole: 'trainer' },
    membership: { workspaceId, workspaceName: 'Studio Horizonte', membershipRole: 'owner', trainerName: 'André Lima' },
  })
  operations.listThreadMessages.mockResolvedValue({ items: [], nextOffset: null })
  operations.sendStudentThreadMessage.mockResolvedValue(message(marinaId, 'Mensagem da aluna'))
  operations.sendTrainerThreadMessage.mockResolvedValue(message(marinaId, 'Mensagem do professor'))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('live conversation recovery', () => {
  it('retries the failed trainer roster before loading the thread', async () => {
    enrollment.listEnrolledStudents
      .mockRejectedValueOnce(new Error('Falha temporária'))
      .mockResolvedValueOnce([{
        userId: '0a258739-7658-4012-b747-0f95dca6372c',
        displayName: 'Marina Costa',
        joinedAt: null,
      }])

    render(<EloAppProvider lockedRole="trainer"><LiveMessagesScreen /></EloAppProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }))

    await waitFor(() => expect(enrollment.listEnrolledStudents).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'O contexto fica junto.' })).toBeInTheDocument()
    expect(operations.listThreadMessages).toHaveBeenCalledWith({ studentUserId: '0a258739-7658-4012-b747-0f95dca6372c', limit: 50 })
  })

  it('keeps a late Marina refresh out of Bianca’s active conversation', async () => {
    const slowMarina = deferred<{ items: ThreadMessage[]; nextOffset: number | null }>()
    const pollers: Array<() => void> = []
    let marinaLoads = 0
    const nativeSetInterval = window.setInterval.bind(window)
    vi.spyOn(window, 'setInterval').mockImplementation((handler, timeout, ...args) => {
      if (timeout === 15_000 && typeof handler === 'function') pollers.push(() => handler())
      return nativeSetInterval(handler, timeout, ...args)
    })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    enrollment.listEnrolledStudents.mockResolvedValue(trainerRoster)
    operations.listThreadMessages.mockImplementation(({ studentUserId }: { studentUserId?: string }) => {
      if (studentUserId === marinaId) {
        marinaLoads += 1
        return marinaLoads === 1
          ? Promise.resolve({ items: [message(marinaId, 'Contexto inicial da Marina')], nextOffset: null })
          : slowMarina.promise
      }
      return Promise.resolve({ items: [message(biancaId, 'Mensagem correta da Bianca')], nextOffset: null })
    })

    render(<EloAppProvider lockedRole="trainer"><LiveMessagesScreen /></EloAppProvider>)
    expect(await screen.findByText('Contexto inicial da Marina', { selector: '.message p' })).toBeInTheDocument()
    await waitFor(() => expect(pollers).toHaveLength(1))

    act(() => pollers[0]())
    await waitFor(() => expect(marinaLoads).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: /Bianca Rocha/ }))
    expect(await screen.findByText('Mensagem correta da Bianca', { selector: '.message p' })).toBeInTheDocument()

    await act(async () => {
      slowMarina.resolve({ items: [message(marinaId, 'Atualização privada da Marina', 2)], nextOffset: null })
      await slowMarina.promise
    })
    expect(screen.getByText('Mensagem correta da Bianca', { selector: '.message p' })).toBeInTheDocument()
    expect(screen.queryByText('Atualização privada da Marina', { selector: '.message p' })).not.toBeInTheDocument()
  })

  it('discards an older Marina page after the trainer switches to Bianca', async () => {
    const slowOlderMarina = deferred<{ items: ThreadMessage[]; nextOffset: number | null }>()
    enrollment.listEnrolledStudents.mockResolvedValue(trainerRoster)
    operations.listThreadMessages.mockImplementation((options: { studentUserId?: string; offset?: number }) => {
      if (options.studentUserId === marinaId && options.offset === 50) return slowOlderMarina.promise
      if (options.studentUserId === marinaId) {
        return Promise.resolve({ items: [message(marinaId, 'Mensagem recente da Marina', 60)], nextOffset: 50 })
      }
      return Promise.resolve({ items: [message(biancaId, 'Canal seguro da Bianca')], nextOffset: null })
    })
    render(<EloAppProvider lockedRole="trainer"><LiveMessagesScreen /></EloAppProvider>)

    expect(await screen.findByText('Mensagem recente da Marina', { selector: '.message p' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Carregar anteriores' }))
    await waitFor(() => expect(operations.listThreadMessages).toHaveBeenCalledWith(expect.objectContaining({ offset: 50 })))
    fireEvent.click(screen.getByRole('button', { name: /Bianca Rocha/ }))
    expect(await screen.findByText('Canal seguro da Bianca', { selector: '.message p' })).toBeInTheDocument()

    await act(async () => {
      slowOlderMarina.resolve({ items: [message(marinaId, 'Histórico privado da Marina', 10)], nextOffset: null })
      await slowOlderMarina.promise
    })
    expect(screen.getByText('Canal seguro da Bianca', { selector: '.message p' })).toBeInTheDocument()
    expect(screen.queryByText('Histórico privado da Marina', { selector: '.message p' })).not.toBeInTheDocument()
  })

  it('preserves independent drafts for each student while switching conversations', async () => {
    enrollment.listEnrolledStudents.mockResolvedValue(trainerRoster)
    render(<EloAppProvider lockedRole="trainer"><LiveMessagesScreen /></EloAppProvider>)

    const marinaDraft = await screen.findByRole('textbox', { name: 'Mensagem' })
    fireEvent.change(marinaDraft, { target: { value: 'Rascunho da Marina' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Conversa' }), { target: { value: biancaId } })
    const biancaDraft = await screen.findByRole('textbox', { name: 'Mensagem' })
    expect(biancaDraft).toHaveValue('')
    fireEvent.change(biancaDraft, { target: { value: 'Rascunho da Bianca' } })

    fireEvent.change(screen.getByRole('combobox', { name: 'Conversa' }), { target: { value: marinaId } })
    expect(await screen.findByRole('textbox', { name: 'Mensagem' })).toHaveValue('Rascunho da Marina')
    fireEvent.change(screen.getByRole('combobox', { name: 'Conversa' }), { target: { value: biancaId } })
    expect(await screen.findByRole('textbox', { name: 'Mensagem' })).toHaveValue('Rascunho da Bianca')
  })

  it('reuses the same idempotency key when an unchanged send is retried', async () => {
    enrollment.listEnrolledStudents.mockResolvedValue([trainerRoster[0]])
    operations.sendTrainerThreadMessage
      .mockRejectedValueOnce(new Error('Falha temporária'))
      .mockResolvedValueOnce(message(marinaId, 'Mensagem confirmada'))
    render(<EloAppProvider lockedRole="trainer"><LiveMessagesScreen /></EloAppProvider>)

    const textarea = await screen.findByRole('textbox', { name: 'Mensagem' })
    fireEvent.change(textarea, { target: { value: 'Mensagem importante' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
    await screen.findByRole('alert')
    const sendButton = screen.getByRole('button', { name: 'Enviar mensagem' })
    await waitFor(() => expect(sendButton).not.toBeDisabled())
    fireEvent.click(sendButton)

    expect(await screen.findByText('Mensagem confirmada', { selector: '.message p' })).toBeInTheDocument()
    expect(operations.sendTrainerThreadMessage).toHaveBeenCalledTimes(2)
    const first = operations.sendTrainerThreadMessage.mock.calls[0][0]
    const second = operations.sendTrainerThreadMessage.mock.calls[1][0]
    expect(first).toMatchObject({ studentUserId: marinaId, body: 'Mensagem importante' })
    expect(second.idempotencyKey).toBe(first.idempotencyKey)
    expect(first.idempotencyKey).toBeTruthy()
    expect(textarea).toHaveValue('')
  })

  it('locks every mutable conversation control while a send is pending', async () => {
    const pendingSend = deferred<ThreadMessage>()
    enrollment.listEnrolledStudents.mockResolvedValue(trainerRoster)
    operations.sendTrainerThreadMessage.mockReturnValue(pendingSend.promise)
    render(<EloAppProvider lockedRole="trainer"><LiveMessagesScreen /></EloAppProvider>)

    const textarea = await screen.findByRole('textbox', { name: 'Mensagem' })
    fireEvent.change(textarea, { target: { value: '  Texto   com espaços  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
    await waitFor(() => expect(operations.sendTrainerThreadMessage).toHaveBeenCalledTimes(1))

    expect(operations.sendTrainerThreadMessage).toHaveBeenCalledWith(expect.objectContaining({
      studentUserId: marinaId,
      body: 'Texto com espaços',
    }))
    expect(textarea).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Conversa' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Marina Costa/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Bianca Rocha/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
    expect(operations.sendTrainerThreadMessage).toHaveBeenCalledTimes(1)

    await act(async () => {
      pendingSend.resolve(message(marinaId, 'Texto com espaços'))
      await pendingSend.promise
    })
    expect(await screen.findByText('Texto com espaços', { selector: '.message p' })).toBeInTheDocument()
    expect(textarea).not.toBeDisabled()
  })

  it('does not erase a newer remounted draft when an old send resolves late', async () => {
    const pendingSend = deferred<ThreadMessage>()
    enrollment.listEnrolledStudents.mockResolvedValue([trainerRoster[0]])
    operations.sendTrainerThreadMessage.mockReturnValue(pendingSend.promise)
    render(<EloAppProvider lockedRole="trainer">{routeHarness()}</EloAppProvider>)

    const firstComposer = await screen.findByRole('textbox', { name: 'Mensagem' })
    fireEvent.change(firstComposer, { target: { value: 'Rascunho antigo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
    await waitFor(() => expect(operations.sendTrainerThreadMessage).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Sair das mensagens' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar às mensagens' }))

    const restoredComposer = await screen.findByRole('textbox', { name: 'Mensagem' })
    expect(restoredComposer).toHaveValue('Rascunho antigo')
    fireEvent.change(restoredComposer, { target: { value: 'Rascunho mais novo' } })
    await act(async () => {
      pendingSend.resolve(message(marinaId, 'Rascunho antigo'))
      await pendingSend.promise
    })

    expect(restoredComposer).toHaveValue('Rascunho mais novo')
    expect(screen.getByText('message-drafts:1')).toBeInTheDocument()
    expect(screen.queryByText('Rascunho antigo', { selector: '.message p' })).not.toBeInTheDocument()
  })

  it('keeps older-message pagination alive and monotonic during polling', async () => {
    const olderPage = deferred<{ items: ThreadMessage[]; nextOffset: number | null }>()
    const pollers: Array<() => void> = []
    const nativeSetInterval = window.setInterval.bind(window)
    vi.spyOn(window, 'setInterval').mockImplementation((handler, timeout, ...args) => {
      if (timeout === 15_000 && typeof handler === 'function') pollers.push(() => handler())
      return nativeSetInterval(handler, timeout, ...args)
    })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    enrollment.listEnrolledStudents.mockResolvedValue([trainerRoster[0]])
    let latestLoads = 0
    operations.listThreadMessages.mockImplementation((options: { offset?: number }) => {
      if (options.offset === 50) return olderPage.promise
      if (options.offset === 100) return Promise.resolve({ items: [], nextOffset: null })
      latestLoads += 1
      return Promise.resolve({
        items: [message(marinaId, latestLoads === 1 ? 'Mensagem mais recente' : 'Nova mensagem do polling', 60 + latestLoads)],
        nextOffset: 50,
      })
    })
    render(<EloAppProvider lockedRole="trainer"><LiveMessagesScreen /></EloAppProvider>)

    expect(await screen.findByText('Mensagem mais recente', { selector: '.message p' })).toBeInTheDocument()
    await waitFor(() => expect(pollers).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Carregar anteriores' }))
    await waitFor(() => expect(operations.listThreadMessages).toHaveBeenCalledWith(expect.objectContaining({ offset: 50 })))
    act(() => pollers[0]())
    expect(await screen.findByText('Nova mensagem do polling', { selector: '.message p' })).toBeInTheDocument()

    await act(async () => {
      olderPage.resolve({ items: [message(marinaId, 'Mensagem antiga', 10)], nextOffset: 100 })
      await olderPage.promise
    })
    expect(await screen.findByText('Mensagem antiga', { selector: '.message p' })).toBeInTheDocument()
    const olderButton = screen.getByRole('button', { name: 'Carregar anteriores' })
    expect(olderButton).not.toBeDisabled()
    fireEvent.click(olderButton)
    await waitFor(() => expect(operations.listThreadMessages).toHaveBeenCalledWith(expect.objectContaining({ offset: 100 })))
  })

  it('uses the student send boundary without accepting a trainer target', async () => {
    auth.useAuth.mockReturnValue({
      profile: { id: marinaId, displayName: 'Marina Costa', accountRole: 'student' },
      membership: { workspaceId, workspaceName: 'Studio Horizonte', membershipRole: 'student', trainerName: 'André Lima' },
    })
    operations.sendStudentThreadMessage.mockResolvedValue({
      ...message(marinaId, 'Mensagem da aluna'),
      senderUserId: marinaId,
      senderRole: 'student',
    })
    render(<EloAppProvider lockedRole="student"><LiveMessagesScreen /></EloAppProvider>)

    const textarea = await screen.findByRole('textbox', { name: 'Mensagem' })
    fireEvent.change(textarea, { target: { value: 'Mensagem da aluna' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }))

    await waitFor(() => expect(operations.sendStudentThreadMessage).toHaveBeenCalledTimes(1))
    expect(operations.sendStudentThreadMessage).toHaveBeenCalledWith(expect.objectContaining({ body: 'Mensagem da aluna' }))
    expect(operations.sendTrainerThreadMessage).not.toHaveBeenCalled()
  })
})
