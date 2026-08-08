import { describe, expect, it } from 'vitest'
import { OperationsDomainError } from './errors'
import { createOperationsService, type OperationsSupabaseClient } from './service'

type BackendResult = { data: unknown; error: unknown }
type QueryCall = {
  table: string
  selected?: string
  filters: Array<[string, unknown]>
  orders: Array<[string, boolean]>
  limit?: number
  range?: [number, number]
}
type RpcCall = { name: string; args: Record<string, unknown> }

class FakeQuery implements PromiseLike<BackendResult> {
  constructor(
    private readonly fake: FakeOperationsClient,
    readonly call: QueryCall,
  ) {}

  select(columns: string) {
    this.call.selected = columns
    return this
  }

  eq(column: string, value: unknown) {
    this.call.filters.push([column, value])
    return this
  }

  order(column: string, options: { ascending: boolean }) {
    this.call.orders.push([column, options.ascending])
    return this
  }

  limit(value: number) {
    this.call.limit = value
    return this
  }

  range(from: number, to: number) {
    this.call.range = [from, to]
    return this
  }

  then<TResult1 = BackendResult, TResult2 = never>(
    onfulfilled?: ((value: BackendResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.fake.takeTableResult(this.call.table)).then(onfulfilled, onrejected)
  }
}

class FakeOperationsClient {
  readonly queryCalls: QueryCall[] = []
  readonly rpcCalls: RpcCall[] = []
  private readonly tableResults = new Map<string, BackendResult[]>()
  private readonly rpcResults = new Map<string, BackendResult[]>()

  constructor(private readonly authenticatedUserId: string | null) {}

  readonly auth = {
    getUser: async () => ({
      data: { user: this.authenticatedUserId ? { id: this.authenticatedUserId } : null },
      error: null,
    }),
  }

  from(table: string) {
    const call: QueryCall = { table, filters: [], orders: [] }
    this.queryCalls.push(call)
    return new FakeQuery(this, call)
  }

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args })
    return this.takeResult(this.rpcResults, name)
  }

  queueTable(table: string, ...results: BackendResult[]) {
    this.tableResults.set(table, [...(this.tableResults.get(table) ?? []), ...results])
    return this
  }

  queueRpc(name: string, ...results: BackendResult[]) {
    this.rpcResults.set(name, [...(this.rpcResults.get(name) ?? []), ...results])
    return this
  }

  takeTableResult(table: string) {
    return this.takeResult(this.tableResults, table)
  }

  asClient() {
    return this as unknown as OperationsSupabaseClient
  }

  private takeResult(store: Map<string, BackendResult[]>, key: string): BackendResult {
    const result = store.get(key)?.shift()
    if (!result) throw new Error(`Missing fake response for ${key}`)
    return result
  }
}

const trainerId = '11111111-1111-4111-8111-111111111111'
const studentId = '22222222-2222-4222-8222-222222222222'
const otherStudentId = '33333333-3333-4333-8333-333333333333'
const workspaceId = '44444444-4444-4444-8444-444444444444'
const otherWorkspaceId = '55555555-5555-4555-8555-555555555555'
const slotId = '66666666-6666-4666-8666-666666666666'
const sessionId = '77777777-7777-4777-8777-777777777777'
const messageId = '88888888-8888-4888-8888-888888888888'
const createdAt = '2026-08-07T15:00:00.000Z'
const futureStart = new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString()
const key = (prefix: string) => `${prefix}:e1f2a3b4-5c6d-47e8-9f01-23456789abcd`
const ok = (data: unknown): BackendResult => ({ data, error: null })

function membershipRow(
  role: 'owner' | 'trainer' | 'student',
  userId = role === 'student' ? studentId : trainerId,
  overrides: Record<string, unknown> = {},
) {
  return {
    workspace_id: workspaceId,
    user_id: userId,
    role,
    status: 'active',
    ...overrides,
  }
}

function slotRow(overrides: Record<string, unknown> = {}) {
  return {
    id: slotId,
    workspace_id: workspaceId,
    created_by_user_id: trainerId,
    created_by_role: 'trainer',
    start_at: futureStart,
    duration_minutes: 60,
    mode: 'online',
    place: 'Sala virtual',
    capacity: 1,
    state: 'open',
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  }
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    session_sequence: 1,
    slot_id: slotId,
    workspace_id: workspaceId,
    student_user_id: studentId,
    state: 'requested',
    requested_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  }
}

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: messageId,
    message_sequence: 1,
    workspace_id: workspaceId,
    student_user_id: studentId,
    sender_user_id: trainerId,
    sender_role: 'trainer',
    body: 'Treino confirmado',
    created_at: createdAt,
    ...overrides,
  }
}

describe('operations mutation contracts', () => {
  it('reuses the caller key and exact normalized create-slot contract across retries', async () => {
    const serverStart = futureStart.replace('Z', '+00:00')
    const fake = new FakeOperationsClient(trainerId)
      .queueTable('workspace_members', ok([membershipRow('trainer')]), ok([membershipRow('trainer')]))
      .queueRpc(
        'create_schedule_slot',
        ok(slotRow({ start_at: serverStart })),
        ok([slotRow({ start_at: serverStart })]),
      )
    const service = createOperationsService(fake.asClient())
    const command = {
      idempotencyKey: key('create-slot'),
      startAt: futureStart,
      durationMinutes: 60,
      mode: 'online' as const,
      place: '  Sala   virtual  ',
      capacity: 1,
    }

    await expect(service.createScheduleSlot(command)).resolves.toMatchObject({ id: slotId })
    await expect(service.createScheduleSlot(command)).resolves.toMatchObject({ id: slotId })

    const expectedArgs = {
      p_start_at: futureStart,
      p_duration_minutes: 60,
      p_mode: 'online',
      p_place: 'Sala virtual',
      p_capacity: 1,
      p_idempotency_key: command.idempotencyKey,
    }
    expect(fake.rpcCalls).toEqual([
      { name: 'create_schedule_slot', args: expectedArgs },
      { name: 'create_schedule_slot', args: expectedArgs },
    ])
  })

  it('derives the student scope and sends the exact request and cancellation RPCs', async () => {
    const fake = new FakeOperationsClient(studentId)
      .queueTable('workspace_members', ok([membershipRow('student')]), ok([membershipRow('student')]))
      .queueRpc('request_schedule_slot', ok(sessionRow()))
      .queueRpc('cancel_own_schedule_session', ok(sessionRow({ state: 'cancelled' })))
    const service = createOperationsService(fake.asClient())

    await service.requestScheduleSlot({ slotId, idempotencyKey: key('request-slot') })
    await service.cancelOwnScheduleSession({ sessionId, idempotencyKey: key('cancel-session') })

    expect(fake.rpcCalls).toEqual([
      {
        name: 'request_schedule_slot',
        args: { p_slot_id: slotId, p_idempotency_key: key('request-slot') },
      },
      {
        name: 'cancel_own_schedule_session',
        args: { p_session_id: sessionId, p_idempotency_key: key('cancel-session') },
      },
    ])
  })

  it('allows a trainer response without accepting a workspace or student from the caller', async () => {
    const fake = new FakeOperationsClient(trainerId)
      .queueTable('workspace_members', ok([membershipRow('trainer')]))
      .queueRpc('respond_schedule_session', ok(sessionRow({ state: 'confirmed' })))
    const service = createOperationsService(fake.asClient())

    await service.respondScheduleSession({
      sessionId,
      decision: 'confirmed',
      idempotencyKey: key('respond-session'),
    })

    expect(fake.rpcCalls).toEqual([{
      name: 'respond_schedule_session',
      args: {
        p_session_id: sessionId,
        p_decision: 'confirmed',
        p_idempotency_key: key('respond-session'),
      },
    }])
  })

  it('lets a trainer cancel a session or slot without accepting tenant identity', async () => {
    const fake = new FakeOperationsClient(trainerId)
      .queueTable('workspace_members', ok([membershipRow('trainer')]), ok([membershipRow('trainer')]))
      .queueRpc('cancel_schedule_session', ok(sessionRow({ state: 'cancelled' })))
      .queueRpc('cancel_schedule_slot', ok(slotRow({ state: 'cancelled' })))
    const service = createOperationsService(fake.asClient())

    await service.cancelScheduleSession({ sessionId, idempotencyKey: key('trainer-cancel-session') })
    await service.cancelScheduleSlot({ slotId, idempotencyKey: key('trainer-cancel-slot') })

    expect(fake.rpcCalls).toEqual([
      {
        name: 'cancel_schedule_session',
        args: { p_session_id: sessionId, p_idempotency_key: key('trainer-cancel-session') },
      },
      {
        name: 'cancel_schedule_slot',
        args: { p_slot_id: slotId, p_idempotency_key: key('trainer-cancel-slot') },
      },
    ])
  })

  it('normalizes messages and validates a trainer subject in the same active workspace', async () => {
    const studentFake = new FakeOperationsClient(studentId)
      .queueTable('workspace_members', ok([membershipRow('student')]))
      .queueRpc('send_student_thread_message', ok(messageRow({
        sender_user_id: studentId,
        sender_role: 'student',
        body: 'Tudo certo',
      })))
    await createOperationsService(studentFake.asClient()).sendStudentThreadMessage({
      body: '  Tudo   certo  ',
      idempotencyKey: key('student-message'),
    })
    expect(studentFake.rpcCalls[0]).toEqual({
      name: 'send_student_thread_message',
      args: { p_body: 'Tudo certo', p_idempotency_key: key('student-message') },
    })

    const trainerFake = new FakeOperationsClient(trainerId)
      .queueTable(
        'workspace_members',
        ok([membershipRow('trainer')]),
        ok([membershipRow('student')]),
      )
      .queueRpc('send_trainer_thread_message', ok(messageRow()))
    await createOperationsService(trainerFake.asClient()).sendTrainerThreadMessage({
      studentUserId: studentId,
      body: '  Treino   confirmado  ',
      idempotencyKey: key('trainer-message'),
    })
    expect(trainerFake.rpcCalls[0]).toEqual({
      name: 'send_trainer_thread_message',
      args: {
        p_student_user_id: studentId,
        p_body: 'Treino confirmado',
        p_idempotency_key: key('trainer-message'),
      },
    })
  })

  it('rejects controls, oversized bodies, and bad keys before any RPC', async () => {
    const fake = new FakeOperationsClient(studentId)
    const service = createOperationsService(fake.asClient())

    await expect(service.sendStudentThreadMessage({
      body: 'linha\noutra',
      idempotencyKey: key('message-control'),
    })).rejects.toMatchObject({ code: 'validation' })
    await expect(service.sendStudentThreadMessage({
      body: 'x'.repeat(1001),
      idempotencyKey: key('message-long'),
    })).rejects.toMatchObject({ code: 'validation' })
    await expect(service.requestScheduleSlot({
      slotId,
      idempotencyKey: 'retry-me',
    })).rejects.toMatchObject({ code: 'validation' })
    expect(fake.rpcCalls).toHaveLength(0)
    expect(fake.queryCalls).toHaveLength(0)
  })

  it('fails closed on cross-tenant RPC rows and never exposes backend details', async () => {
    const crossTenant = new FakeOperationsClient(studentId)
      .queueTable('workspace_members', ok([membershipRow('student')]))
      .queueRpc('request_schedule_slot', ok(sessionRow({ workspace_id: otherWorkspaceId })))
    await expect(createOperationsService(crossTenant.asClient()).requestScheduleSlot({
      slotId,
      idempotencyKey: key('cross-tenant'),
    })).rejects.toMatchObject({ code: 'service_unavailable' })

    const backendFailure = new FakeOperationsClient(studentId)
      .queueTable('workspace_members', ok([membershipRow('student')]))
      .queueRpc('request_schedule_slot', {
        data: null,
        error: { code: 'XX999', message: 'private table and user details' },
      })
    const caught = await createOperationsService(backendFailure.asClient()).requestScheduleSlot({
      slotId,
      idempotencyKey: key('backend-failure'),
    }).catch((error: unknown) => error)
    expect(caught).toBeInstanceOf(OperationsDomainError)
    expect(caught).toMatchObject({ code: 'service_unavailable' })
    if (!(caught instanceof OperationsDomainError)) throw new Error('Expected an operations domain error')
    expect(String(caught.message)).not.toContain('private table')
    expect(caught).not.toHaveProperty('cause')
  })
})

describe('operations scoped read contracts', () => {
  it('returns a bounded minimal slot page and records limit-plus-one pagination', async () => {
    const fake = new FakeOperationsClient(trainerId)
      .queueTable('workspace_members', ok([membershipRow('trainer')]))
      .queueTable('schedule_slots', ok([
        slotRow(),
        slotRow({ id: '66666666-6666-4666-8666-666666666667' }),
        slotRow({ id: '66666666-6666-4666-8666-666666666668' }),
      ]))
    const page = await createOperationsService(fake.asClient()).listScheduleSlots({
      state: 'open',
      limit: 2,
      offset: 5,
    })

    expect(page.items).toHaveLength(2)
    expect(page.nextOffset).toBe(7)
    expect(fake.queryCalls[1]).toMatchObject({
      table: 'schedule_slots',
      filters: [['workspace_id', workspaceId], ['state', 'open']],
      orders: [['start_at', true], ['id', true]],
      range: [5, 7],
    })
    expect(fake.queryCalls[1].selected).not.toContain('idempotency')
    expect(fake.queryCalls[1].selected).not.toContain('fingerprint')
  })

  it('forces a student session read to self and rejects a mixed-tenant response', async () => {
    const fake = new FakeOperationsClient(studentId)
      .queueTable('workspace_members', ok([membershipRow('student')]))
      .queueTable('schedule_sessions', ok([sessionRow({ student_user_id: otherStudentId })]))
    const service = createOperationsService(fake.asClient())

    await expect(service.listScheduleSessions()).rejects.toMatchObject({ code: 'service_unavailable' })
    expect(fake.queryCalls[1].filters).toEqual([
      ['workspace_id', workspaceId],
      ['student_user_id', studentId],
    ])
  })

  it('forces a student message thread to self and rejects another requested subject', async () => {
    const fake = new FakeOperationsClient(studentId)
    const service = createOperationsService(fake.asClient())

    fake.queueTable('workspace_members', ok([membershipRow('student')]))
    await expect(service.listThreadMessages({ studentUserId: otherStudentId })).rejects.toMatchObject({
      code: 'record_unavailable',
    })
    expect(fake.queryCalls).toHaveLength(1)
  })

  it('requires an active linked student before a trainer reads a thread', async () => {
    const fake = new FakeOperationsClient(trainerId)
      .queueTable(
        'workspace_members',
        ok([membershipRow('trainer')]),
        ok([membershipRow('student')]),
      )
      .queueTable('thread_messages', ok([
        messageRow(),
        messageRow({
          id: '88888888-8888-4888-8888-888888888889',
          message_sequence: '2',
          sender_user_id: studentId,
          sender_role: 'student',
          body: 'Obrigado',
        }),
      ]))
    const page = await createOperationsService(fake.asClient()).listThreadMessages({
      studentUserId: studentId,
      limit: 2,
    })

    expect(page.items).toHaveLength(2)
    expect(fake.queryCalls[2]).toMatchObject({
      table: 'thread_messages',
      filters: [['workspace_id', workspaceId], ['student_user_id', studentId]],
      orders: [['message_sequence', false], ['id', false]],
      range: [0, 2],
    })
    expect(fake.queryCalls[2].selected).not.toContain('idempotency')
  })

  it('rejects ambiguous membership and pagination before reading protected rows', async () => {
    const ambiguous = new FakeOperationsClient(trainerId).queueTable('workspace_members', ok([
      membershipRow('trainer'),
      membershipRow('trainer', trainerId, { workspace_id: otherWorkspaceId }),
    ]))
    await expect(createOperationsService(ambiguous.asClient()).listScheduleSlots()).rejects.toMatchObject({
      code: 'ambiguous_workspace',
    })

    const invalidPage = new FakeOperationsClient(trainerId)
    await expect(createOperationsService(invalidPage.asClient()).listScheduleSlots({ limit: 51 })).rejects.toMatchObject({
      code: 'validation',
    })
    expect(invalidPage.queryCalls).toHaveLength(0)
  })
})
