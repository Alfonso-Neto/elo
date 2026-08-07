import { describe, expect, it } from 'vitest'
import { SignalDomainError } from './errors'
import { createSignalService, type SignalSupabaseClient } from './service'

type BackendResult = { data: unknown; error: unknown }
type QueryCall = {
  table: string
  selected?: string
  inserted?: unknown
  filters: Array<[string, unknown]>
  orders: Array<[string, boolean]>
  limit?: number
  range?: [number, number]
  terminal?: 'single' | 'maybeSingle'
}
type RpcCall = { name: string; args: Record<string, unknown> }

class FakeQuery implements PromiseLike<BackendResult> {
  constructor(
    private readonly fake: FakeSignalClient,
    readonly call: QueryCall,
  ) {}

  select(columns: string) {
    this.call.selected = columns
    return this
  }

  insert(payload: unknown) {
    this.call.inserted = payload
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

  single() {
    this.call.terminal = 'single'
    return Promise.resolve(this.fake.takeTableResult(this.call.table))
  }

  maybeSingle() {
    this.call.terminal = 'maybeSingle'
    return Promise.resolve(this.fake.takeTableResult(this.call.table))
  }

  then<TResult1 = BackendResult, TResult2 = never>(
    onfulfilled?: ((value: BackendResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.fake.takeTableResult(this.call.table)).then(onfulfilled, onrejected)
  }
}

class FakeSignalClient {
  readonly queryCalls: QueryCall[] = []
  readonly rpcCalls: RpcCall[] = []
  private readonly tableResults = new Map<string, BackendResult[]>()
  private readonly rpcResults = new Map<string, BackendResult[]>()

  constructor(private readonly authenticatedUserId: string | null = userId) {}

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
    return this as unknown as SignalSupabaseClient
  }

  private takeResult(store: Map<string, BackendResult[]>, key: string): BackendResult {
    const result = store.get(key)?.shift()
    if (!result) throw new Error(`Missing fake response for ${key}`)
    return result
  }
}

const userId = '11111111-1111-4111-8111-111111111111'
const otherUserId = '33333333-3333-4333-8333-333333333333'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const otherWorkspaceId = '99999999-9999-4999-8999-999999999999'
const reportId = '44444444-4444-4444-8444-444444444444'
const otherReportId = '77777777-7777-4777-8777-777777777777'
const eventId = '55555555-5555-4555-8555-555555555555'
const consentId = '66666666-6666-4666-8666-666666666666'
const timestamp = '2026-08-07T15:00:00.000Z'

const key = (prefix: string) => `${prefix}:e1f2a3b4-5c6d-47e8-9f01-23456789abcd`
const ok = (data: unknown): BackendResult => ({ data, error: null })

function reportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: reportId,
    signal_sequence: 1,
    workspace_id: workspaceId,
    student_user_id: userId,
    region: 'Joelho',
    side: 'left',
    movement: 'Agachamento',
    timing: 'during_activity',
    intensity: 6,
    onset: timestamp,
    red_flags: ['major_trauma'],
    created_at: timestamp,
    ...overrides,
  }
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: eventId,
    event_sequence: 1,
    pain_report_id: reportId,
    workspace_id: workspaceId,
    student_user_id: userId,
    actor_user_id: otherUserId,
    action: 'acknowledged',
    note: null,
    created_at: timestamp,
    ...overrides,
  }
}

describe('signal mutation contracts', () => {
  it('reuses the caller command key across retries and sends the exact create RPC contract', async () => {
    const fake = new FakeSignalClient().queueRpc('create_pain_report', ok(reportId), ok(reportId))
    const service = createSignalService(fake.asClient())
    const onset = new Date(Date.now() - 60_000).toISOString()
    const command = {
      idempotencyKey: key('pain-report'),
      draft: {
        region: '  Joelho ',
        side: 'Lado esquerdo',
        movement: ' Agachamento ',
        timing: 'Durante o treino',
        intensity: '7',
        onset,
        detail: ' Ao descer ',
        redFlags: ['trauma', 'numbness_or_weakness'],
      },
    }

    await expect(service.createPainReport(command)).resolves.toBe(reportId)
    await expect(service.createPainReport(command)).resolves.toBe(reportId)

    expect(fake.rpcCalls).toEqual([
      {
        name: 'create_pain_report',
        args: {
          p_region: 'Joelho',
          p_side: 'left',
          p_movement: 'Agachamento',
          p_timing: 'during_activity',
          p_intensity: 7,
          p_onset: onset,
          p_detail: 'Ao descer',
          p_red_flags: ['major_trauma', 'numbness_or_weakness'],
          p_idempotency_key: command.idempotencyKey,
        },
      },
      {
        name: 'create_pain_report',
        args: expect.objectContaining({ p_idempotency_key: command.idempotencyKey }),
      },
    ])
  })

  it('uses caller keys and normalized notes for both trainer action RPCs', async () => {
    const fake = new FakeSignalClient()
      .queueRpc('acknowledge_pain_report', ok(eventId))
      .queueRpc('resolve_pain_report', ok(eventId))
    const service = createSignalService(fake.asClient())

    await service.acknowledgePainReport({
      painReportId: reportId,
      idempotencyKey: key('pain-ack'),
      note: '  Vou acompanhar  ',
    })
    await service.resolvePainReport({
      painReportId: reportId,
      idempotencyKey: key('pain-resolve'),
      resolutionNote: '  Avaliação concluída  ',
    })

    expect(fake.rpcCalls).toEqual([
      {
        name: 'acknowledge_pain_report',
        args: {
          p_pain_report_id: reportId,
          p_idempotency_key: key('pain-ack'),
          p_note: 'Vou acompanhar',
        },
      },
      {
        name: 'resolve_pain_report',
        args: {
          p_pain_report_id: reportId,
          p_idempotency_key: key('pain-resolve'),
          p_resolution_note: 'Avaliação concluída',
        },
      },
    ])
  })

  it('rejects invalid caller keys before making a backend mutation', async () => {
    const fake = new FakeSignalClient()
    const service = createSignalService(fake.asClient())

    await expect(service.acknowledgePainReport({
      painReportId: reportId,
      idempotencyKey: 'retry-me',
    })).rejects.toMatchObject({ code: 'validation' })
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it('fails closed when a consent insert response crosses the selected membership', async () => {
    const fake = new FakeSignalClient()
      .queueTable('workspace_members', ok([{
        workspace_id: workspaceId,
        user_id: userId,
        role: 'student',
        status: 'active',
      }]))
      .queueTable('consent_policies', ok({
        purpose: 'health_processing',
        policy_version: '2026-08-07-v1',
        published_at: timestamp,
      }))
      .queueTable('consent_events', ok({
        id: consentId,
        workspace_id: otherWorkspaceId,
        student_user_id: userId,
        purpose: 'health_processing',
        policy_version: '2026-08-07-v1',
        action: 'granted',
        created_at: timestamp,
      }))
    const service = createSignalService(fake.asClient())

    await expect(service.grantCurrentHealthConsent({
      idempotencyKey: key('consent-granted'),
    })).rejects.toMatchObject({ code: 'service_unavailable' })

    expect(fake.queryCalls.find((call) => call.table === 'consent_events')?.inserted).toEqual({
      workspace_id: workspaceId,
      purpose: 'health_processing',
      policy_version: '2026-08-07-v1',
      action: 'granted',
      idempotency_key: key('consent-granted'),
    })
  })
})

describe('signal read contracts', () => {
  it('rejects a membership row that is not bound to the authenticated user', async () => {
    const fake = new FakeSignalClient().queueTable('workspace_members', ok([{
      workspace_id: workspaceId,
      user_id: otherUserId,
      role: 'student',
      status: 'active',
    }]))

    await expect(createSignalService(fake.asClient()).fetchActiveStudentMembership()).rejects.toMatchObject({
      code: 'service_unavailable',
    })
  })

  it('returns a bounded minimal workspace page and records the exact range', async () => {
    const fake = new FakeSignalClient().queueTable('pain_reports', ok([
      reportRow(),
      reportRow({ id: '44444444-4444-4444-8444-444444444445', signal_sequence: 2 }),
      reportRow({ id: '44444444-4444-4444-8444-444444444446', signal_sequence: 3 }),
    ]))
    const service = createSignalService(fake.asClient())

    const page = await service.listWorkspaceReports(workspaceId, { limit: 2, offset: 5 })

    expect(page.items).toHaveLength(2)
    expect(page.nextOffset).toBe(7)
    expect(page.items[0]).not.toHaveProperty('detail')
    expect(fake.queryCalls[0]).toMatchObject({
      table: 'pain_reports',
      filters: [['workspace_id', workspaceId]],
      orders: [['created_at', false], ['id', false]],
      range: [5, 7],
    })
    expect(fake.queryCalls[0].selected).not.toContain('detail')
  })

  it('rejects cross-student and cross-workspace rows instead of partially rendering them', async () => {
    const ownFake = new FakeSignalClient().queueTable('pain_reports', ok([
      reportRow({ student_user_id: otherUserId }),
    ]))
    await expect(createSignalService(ownFake.asClient()).listOwnReports()).rejects.toMatchObject({
      code: 'service_unavailable',
    })

    const workspaceFake = new FakeSignalClient().queueTable('pain_reports', ok([
      reportRow({ workspace_id: otherWorkspaceId }),
    ]))
    await expect(
      createSignalService(workspaceFake.asClient()).listWorkspaceReports(workspaceId),
    ).rejects.toMatchObject({ code: 'service_unavailable' })
  })

  it('rejects timeline rows from another parent or mixed tenant', async () => {
    const fake = new FakeSignalClient().queueTable('pain_report_events', ok([
      eventRow(),
      eventRow({
        id: '55555555-5555-4555-8555-555555555556',
        event_sequence: 2,
        pain_report_id: otherReportId,
      }),
    ]))
    const service = createSignalService(fake.asClient())

    await expect(service.listPainReportTimeline(reportId)).rejects.toMatchObject({
      code: 'service_unavailable',
    })
  })

  it('rejects unknown, duplicated, or oversized returned red-flag codes', async () => {
    const fake = new FakeSignalClient().queueTable('pain_reports', ok([
      reportRow({ red_flags: ['unknown_signal'] }),
    ]))

    await expect(createSignalService(fake.asClient()).listOwnReports()).rejects.toBeInstanceOf(SignalDomainError)
  })

  it('rejects pagination outside the public bounds before querying health rows', async () => {
    const fake = new FakeSignalClient()
    const service = createSignalService(fake.asClient())

    await expect(service.listWorkspaceReports(workspaceId, { limit: 51 })).rejects.toMatchObject({
      code: 'validation',
    })
    expect(fake.queryCalls).toHaveLength(0)
  })

  it('binds a detailed response to the requested report and validates free-text bounds', async () => {
    const fake = new FakeSignalClient().queueTable('pain_reports', ok({
      ...reportRow(),
      detail: 'Contexto controlado',
    }))
    const service = createSignalService(fake.asClient())

    await expect(service.getPainReport(reportId)).resolves.toMatchObject({
      id: reportId,
      detail: 'Contexto controlado',
    })

    const mismatched = new FakeSignalClient().queueTable('pain_reports', ok({
      ...reportRow({ id: otherReportId }),
      detail: 'Outro registro',
    }))
    await expect(createSignalService(mismatched.asClient()).getPainReport(reportId)).rejects.toMatchObject({
      code: 'service_unavailable',
    })
  })
})
