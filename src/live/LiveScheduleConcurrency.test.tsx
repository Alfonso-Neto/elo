import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduleSlot } from './operations'
import { LiveStudentScheduleScreen, LiveTrainerScheduleScreen } from './LiveOperationsScreens'

const app = vi.hoisted(() => ({ useEloApp: vi.fn(), notify: vi.fn() }))
const auth = vi.hoisted(() => ({ useAuth: vi.fn() }))
const enrollment = vi.hoisted(() => ({ listEnrolledStudents: vi.fn() }))
const operations = vi.hoisted(() => ({
  createOperationsService: vi.fn(),
  listScheduleSlots: vi.fn(),
  listScheduleSessions: vi.fn(),
  requestScheduleSlot: vi.fn(),
  cancelOwnScheduleSession: vi.fn(),
  createScheduleSlot: vi.fn(),
  respondScheduleSession: vi.fn(),
  cancelScheduleSession: vi.fn(),
  cancelScheduleSlot: vi.fn(),
}))

const workspaceId = '23ccf1ec-a377-4b45-a401-11d28a8a1503'
const trainerId = 'a654f432-1a44-45ad-bf25-808674d483e6'
const studentId = '0a258739-7658-4012-b747-0f95dca6372c'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function futureToday() {
  const date = new Date()
  date.setHours(23, 0, 0, 0)
  return date.toISOString()
}

function slot(place: string): ScheduleSlot {
  return {
    id: 'c1219b44-a812-4271-a005-f8809e6a83c5',
    workspaceId,
    createdByUserId: trainerId,
    createdByRole: 'owner',
    startAt: futureToday(),
    durationMinutes: 60,
    mode: 'in_person',
    place,
    capacity: 1,
    state: 'open',
    createdAt: '2026-08-08T12:00:00.000Z',
    updatedAt: '2026-08-08T12:00:00.000Z',
  }
}

vi.mock('../auth/auth-context', () => ({ useAuth: auth.useAuth }))
vi.mock('../app-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app-state')>()
  return { ...actual, useEloApp: app.useEloApp }
})
vi.mock('../onboarding/enrollment-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../onboarding/enrollment-service')>()
  return { ...actual, listEnrolledStudents: enrollment.listEnrolledStudents }
})
vi.mock('./operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./operations')>()
  return { ...actual, createOperationsService: operations.createOperationsService }
})

beforeEach(() => {
  vi.resetAllMocks()
  app.useEloApp.mockReturnValue({ notify: app.notify })
  operations.createOperationsService.mockReturnValue(operations)
  enrollment.listEnrolledStudents.mockResolvedValue([])
  operations.listScheduleSlots.mockResolvedValue({ items: [slot('Studio inicial')], nextOffset: null })
  operations.listScheduleSessions.mockResolvedValue({ items: [], nextOffset: null })
  operations.requestScheduleSlot.mockResolvedValue(undefined)
  operations.createScheduleSlot.mockResolvedValue(undefined)
})

describe('schedule concurrency boundaries', () => {
  it('keeps a newer trainer refresh when an older request resolves last', async () => {
    const older = deferred<{ items: ScheduleSlot[]; nextOffset: null }>()
    const newer = deferred<{ items: ScheduleSlot[]; nextOffset: null }>()
    operations.listScheduleSlots
      .mockResolvedValueOnce({ items: [slot('Studio inicial')], nextOffset: null })
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    auth.useAuth.mockReturnValue({
      profile: { id: trainerId, displayName: 'André Lima', accountRole: 'trainer' },
      membership: { workspaceId, workspaceName: 'Studio Horizonte', membershipRole: 'owner', trainerName: 'André Lima' },
    })
    render(<LiveTrainerScheduleScreen />)

    expect(await screen.findByText('Studio inicial')).toBeInTheDocument()
    const refresh = screen.getByRole('button', { name: 'Atualizar' })
    act(() => {
      fireEvent.click(refresh)
      fireEvent.click(refresh)
    })

    await act(async () => {
      newer.resolve({ items: [slot('Studio mais novo')], nextOffset: null })
      await newer.promise
    })
    expect(await screen.findByText('Studio mais novo')).toBeInTheDocument()

    await act(async () => {
      older.resolve({ items: [slot('Studio antigo')], nextOffset: null })
      await older.promise
    })
    expect(screen.getByText('Studio mais novo')).toBeInTheDocument()
    expect(screen.queryByText('Studio antigo')).not.toBeInTheDocument()
  })

  it('coalesces student slot requests dispatched before React can disable the control', async () => {
    const pending = deferred<void>()
    operations.requestScheduleSlot.mockReturnValueOnce(pending.promise)
    auth.useAuth.mockReturnValue({
      profile: { id: studentId, displayName: 'Marina Costa', accountRole: 'student' },
      membership: { workspaceId, workspaceName: 'Studio Horizonte', membershipRole: 'student', trainerName: 'André Lima' },
    })
    render(<LiveStudentScheduleScreen />)

    const request = await screen.findByRole('button', { name: 'Solicitar' })
    expect(request).toBeInTheDocument()
    expect(request).toBeEnabled()
    expect(operations.createOperationsService).toHaveBeenCalled()
    fireEvent.click(request)
    fireEvent.click(request)
    expect(operations.requestScheduleSlot).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve()
      await pending.promise
    })
    await waitFor(() => expect(request).toBeEnabled())
  })

  it('does not refresh or notify a schedule route after it has unmounted', async () => {
    const pending = deferred<void>()
    operations.requestScheduleSlot.mockReturnValueOnce(pending.promise)
    auth.useAuth.mockReturnValue({
      profile: { id: studentId, displayName: 'Marina Costa', accountRole: 'student' },
      membership: { workspaceId, workspaceName: 'Studio Horizonte', membershipRole: 'student', trainerName: 'André Lima' },
    })
    const view = render(<LiveStudentScheduleScreen />)

    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar' }))
    expect(operations.requestScheduleSlot).toHaveBeenCalledTimes(1)
    view.unmount()
    await act(async () => {
      pending.resolve()
      await pending.promise
    })

    expect(app.notify).not.toHaveBeenCalled()
    expect(operations.listScheduleSlots).toHaveBeenCalledTimes(1)
  })

  it('coalesces trainer slot publication dispatched in the same render cycle', async () => {
    operations.listScheduleSlots.mockResolvedValue({ items: [], nextOffset: null })
    auth.useAuth.mockReturnValue({
      profile: { id: trainerId, displayName: 'André Lima', accountRole: 'trainer' },
      membership: { workspaceId, workspaceName: 'Studio Horizonte', membershipRole: 'owner', trainerName: 'André Lima' },
    })
    render(<LiveTrainerScheduleScreen />)

    const openButtons = await screen.findAllByRole('button', { name: 'Abrir horário' })
    fireEvent.click(openButtons[0])
    const publish = screen.getByRole('button', { name: /Publicar disponibilidade/i })
    fireEvent.click(publish)
    fireEvent.click(publish)
    expect(operations.createScheduleSlot).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(operations.listScheduleSlots).toHaveBeenCalledTimes(2))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
  })

})
