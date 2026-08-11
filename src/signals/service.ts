import type { SupabaseClient } from '@supabase/supabase-js'
import { parseIsoTimestamp } from '../lib/iso-timestamp'
import { hasUnsafeDisplayCharacters } from '../lib/safe-text'
import { requireSupabase } from '../lib/supabase'
import { SignalDomainError, toSignalDomainError } from './errors'
import { idempotencyKeyPattern } from './idempotency'
import { mapPainReportDraft } from './mapping'
import {
  bodySides,
  knownRedFlagCodes,
  symptomTimings,
  type AcknowledgePainReportCommand,
  type ActiveStudentMembership,
  type BodySide,
  type ConsentEvent,
  type ConsentPolicy,
  type CreatePainReportCommand,
  type IdempotentSignalCommand,
  type KnownRedFlagCode,
  type PainReport,
  type PainReportEvent,
  type PainReportLifecycleSummary,
  type PainReportSummary,
  type RecordHealthConsentCommand,
  type ResolvePainReportCommand,
  type SignalPage,
  type SignalPageOptions,
  type SymptomTiming,
  type TrainerPainReportPageOptions,
} from './types'

export type SignalSupabaseClient = Pick<SupabaseClient, 'auth' | 'from' | 'rpc'>

export type SignalService = ReturnType<typeof createSignalService>

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const policyVersionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/
const bodySideSet = new Set<string>(bodySides)
const symptomTimingSet = new Set<string>(symptomTimings)
const knownRedFlagSet = new Set<string>(knownRedFlagCodes)
const defaultPageSize = 25
export const MAX_SIGNAL_PAGE_SIZE = 50
const maximumPageOffset = 100_000

const painReportSummaryColumns = [
  'id',
  'signal_sequence',
  'workspace_id',
  'student_user_id',
  'region',
  'side',
  'movement',
  'timing',
  'intensity',
  'onset',
  'red_flags',
  'created_at',
].join(', ')

const painReportColumns = `${painReportSummaryColumns}, detail`

const painReportEventColumns = [
  'id',
  'event_sequence',
  'pain_report_id',
  'workspace_id',
  'student_user_id',
  'actor_user_id',
  'action',
  'note',
  'created_at',
].join(', ')

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(row: Record<string, unknown>, key: string) {
  const value = row[key]
  if (typeof value !== 'string' || value.length === 0) throw new SignalDomainError('service_unavailable')
  return value
}

function requiredUuid(row: Record<string, unknown>, key: string) {
  const value = requiredString(row, key)
  if (!uuidPattern.test(value)) throw new SignalDomainError('service_unavailable')
  return value
}

function boundedString(row: Record<string, unknown>, key: string, minimum: number, maximum: number) {
  const value = requiredString(row, key)
  if (value.length < minimum || value.length > maximum || hasUnsafeDisplayCharacters(value)) throw new SignalDomainError('service_unavailable')
  return value
}

function timestampString(row: Record<string, unknown>, key: string) {
  const value = requiredString(row, key)
  if (parseIsoTimestamp(value) === null) throw new SignalDomainError('service_unavailable')
  return value
}

function nullableTimestampString(row: Record<string, unknown>, key: string) {
  if (row[key] === null) return null
  return timestampString(row, key)
}

function safeSequence(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw new SignalDomainError('service_unavailable')
  }
  return parsed
}

function rowsFrom(data: unknown) {
  if (!Array.isArray(data)) throw new SignalDomainError('service_unavailable')
  return data.map((row) => {
    if (!isRecord(row)) throw new SignalDomainError('service_unavailable')
    return row
  })
}

function parsePageOptions(options: SignalPageOptions = {}) {
  if (!isRecord(options)) throw new SignalDomainError('validation')
  const limit = options.limit ?? defaultPageSize
  const offset = options.offset ?? 0
  if (
    !Number.isSafeInteger(limit)
    || limit < 1
    || limit > MAX_SIGNAL_PAGE_SIZE
    || !Number.isSafeInteger(offset)
    || offset < 0
    || offset > maximumPageOffset
  ) {
    throw new SignalDomainError('validation', {
      fieldErrors: { pagination: `Use limite de 1 a ${MAX_SIGNAL_PAGE_SIZE} e deslocamento válido.` },
    })
  }
  return { limit, offset }
}

function pageFrom<T>(rows: T[], limit: number, offset: number): SignalPage<T> {
  const hasNextPage = rows.length > limit
  return {
    items: rows.slice(0, limit),
    nextOffset: hasNextPage ? offset + limit : null,
  }
}

function assertIdempotencyKey(value: unknown) {
  if (typeof value !== 'string' || !idempotencyKeyPattern.test(value)) {
    throw new SignalDomainError('validation', {
      fieldErrors: { idempotency: 'A identificação desta solicitação é inválida.' },
    })
  }
  return value
}

function commandKey(command: unknown) {
  if (!isRecord(command)) throw new SignalDomainError('validation')
  return assertIdempotencyKey(command.idempotencyKey)
}

function rpcRow(data: unknown) {
  if (!Array.isArray(data)) return data
  if (data.length !== 1) throw new SignalDomainError('service_unavailable')
  return data[0]
}

function parseMembership(row: unknown): ActiveStudentMembership {
  if (!isRecord(row) || row.role !== 'student' || row.status !== 'active') {
    throw new SignalDomainError('service_unavailable')
  }
  return {
    workspaceId: requiredUuid(row, 'workspace_id'),
    userId: requiredUuid(row, 'user_id'),
    role: 'student',
    status: 'active',
  }
}

function parseConsentPolicy(row: unknown): ConsentPolicy {
  if (!isRecord(row) || row.purpose !== 'health_processing') {
    throw new SignalDomainError('consent_policy_unavailable')
  }
  const policyVersion = requiredString(row, 'policy_version')
  if (!policyVersionPattern.test(policyVersion)) throw new SignalDomainError('consent_policy_unavailable')
  return {
    purpose: 'health_processing',
    policyVersion,
    publishedAt: timestampString(row, 'published_at'),
  }
}

function parseConsentEvent(row: unknown): ConsentEvent {
  if (
    !isRecord(row)
    || row.purpose !== 'health_processing'
    || (row.action !== 'granted' && row.action !== 'withdrawn')
  ) throw new SignalDomainError('service_unavailable')

  const policyVersion = requiredString(row, 'policy_version')
  if (!policyVersionPattern.test(policyVersion)) throw new SignalDomainError('service_unavailable')
  return {
    id: requiredUuid(row, 'id'),
    workspaceId: requiredUuid(row, 'workspace_id'),
    studentUserId: requiredUuid(row, 'student_user_id'),
    purpose: 'health_processing',
    policyVersion,
    action: row.action,
    createdAt: timestampString(row, 'created_at'),
  }
}

function parseRedFlags(value: unknown): KnownRedFlagCode[] {
  if (
    !Array.isArray(value)
    || value.length > 12
    || value.some((code) => typeof code !== 'string' || !knownRedFlagSet.has(code))
    || new Set(value).size !== value.length
  ) throw new SignalDomainError('service_unavailable')
  return [...value] as KnownRedFlagCode[]
}

function parsePainReportSummary(row: unknown): PainReportSummary {
  if (!isRecord(row)) throw new SignalDomainError('service_unavailable')
  if (!bodySideSet.has(String(row.side)) || !symptomTimingSet.has(String(row.timing))) {
    throw new SignalDomainError('service_unavailable')
  }
  if (!Number.isInteger(row.intensity) || (row.intensity as number) < 0 || (row.intensity as number) > 10) {
    throw new SignalDomainError('service_unavailable')
  }

  return {
    id: requiredUuid(row, 'id'),
    sequence: safeSequence(row.signal_sequence),
    workspaceId: requiredUuid(row, 'workspace_id'),
    studentUserId: requiredUuid(row, 'student_user_id'),
    region: boundedString(row, 'region', 2, 64),
    side: row.side as BodySide,
    movement: boundedString(row, 'movement', 1, 120),
    timing: row.timing as SymptomTiming,
    intensity: row.intensity as number,
    onset: timestampString(row, 'onset'),
    redFlags: parseRedFlags(row.red_flags),
    createdAt: timestampString(row, 'created_at'),
  }
}

function parsePainReport(row: unknown): PainReport {
  if (!isRecord(row)) throw new SignalDomainError('service_unavailable')
  const summary = parsePainReportSummary(row)
  if (row.detail !== null && (typeof row.detail !== 'string' || row.detail.length < 1 || row.detail.length > 2000 || hasUnsafeDisplayCharacters(row.detail, true))) {
    throw new SignalDomainError('service_unavailable')
  }
  return { ...summary, detail: row.detail as string | null }
}

function parsePainReportLifecycleSummary(row: unknown): PainReportLifecycleSummary {
  if (!isRecord(row)) throw new SignalDomainError('service_unavailable')
  const summary = parsePainReportSummary(row)
  const status = row.lifecycle_status
  if (status !== 'open' && status !== 'acknowledged' && status !== 'resolved') {
    throw new SignalDomainError('service_unavailable')
  }
  const acknowledgedAt = nullableTimestampString(row, 'acknowledged_at')
  const resolvedAt = nullableTimestampString(row, 'resolved_at')
  const resolutionNote = row.resolution_note === null
    ? null
    : boundedString(row, 'resolution_note', 1, 1000)
  if (
    (status === 'open' && (acknowledgedAt !== null || resolvedAt !== null || resolutionNote !== null))
    || (status === 'acknowledged' && (acknowledgedAt === null || resolvedAt !== null || resolutionNote !== null))
    || (status === 'resolved' && (resolvedAt === null || resolutionNote === null))
  ) throw new SignalDomainError('service_unavailable')
  return { ...summary, status, acknowledgedAt, resolvedAt, resolutionNote }
}

function parsePainReportEvent(row: unknown): PainReportEvent {
  if (
    !isRecord(row)
    || (row.action !== 'acknowledged' && row.action !== 'resolved')
    || (
      row.note !== null
      && (typeof row.note !== 'string' || row.note.length < 1 || row.note.length > 1000 || hasUnsafeDisplayCharacters(row.note, true))
    )
  ) throw new SignalDomainError('service_unavailable')

  return {
    id: requiredUuid(row, 'id'),
    sequence: safeSequence(row.event_sequence),
    painReportId: requiredUuid(row, 'pain_report_id'),
    workspaceId: requiredUuid(row, 'workspace_id'),
    studentUserId: requiredUuid(row, 'student_user_id'),
    actorUserId: requiredUuid(row, 'actor_user_id'),
    action: row.action,
    note: row.note as string | null,
    createdAt: timestampString(row, 'created_at'),
  }
}

function assertUuid(value: string, field: string) {
  if (!uuidPattern.test(value)) {
    throw new SignalDomainError('validation', { fieldErrors: { [field]: 'Identificador inválido.' } })
  }
}

function normalizeActionNote(note: string | null | undefined, required: boolean) {
  if (note !== null && note !== undefined && typeof note !== 'string') {
    throw new SignalDomainError('validation', { fieldErrors: { note: 'Use um texto válido.' } })
  }
  const normalized = note?.trim() || null
  if ((required && !normalized) || (normalized && (normalized.length > 1000 || hasUnsafeDisplayCharacters(normalized, true)))) {
    throw new SignalDomainError('validation', {
      fieldErrors: { note: required ? 'Informe a resolução em até 1.000 caracteres.' : 'Use até 1.000 caracteres.' },
    })
  }
  return normalized
}

async function runSafely<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toSignalDomainError(error)
  }
}

export function createSignalService(client: SignalSupabaseClient = requireSupabase()) {
  async function currentUserId() {
    const { data, error } = await client.auth.getUser()
    if (error) throw error
    if (!data.user) throw new SignalDomainError('authentication_required')
    if (!uuidPattern.test(data.user.id)) throw new SignalDomainError('service_unavailable')
    return data.user.id
  }

  async function fetchActiveStudentMembership(): Promise<ActiveStudentMembership> {
    return runSafely(async () => {
      const userId = await currentUserId()
      const { data, error } = await client
        .from('workspace_members')
        .select('workspace_id, user_id, role, status')
        .eq('user_id', userId)
        .eq('role', 'student')
        .eq('status', 'active')
        .limit(2)

      if (error) throw error
      const memberships = rowsFrom(data).map(parseMembership)
      if (memberships.length === 0) throw new SignalDomainError('student_workspace_required')
      if (memberships.length > 1) throw new SignalDomainError('ambiguous_student_workspace')
      if (memberships[0].userId !== userId) throw new SignalDomainError('service_unavailable')
      return memberships[0]
    })
  }

  async function fetchCurrentConsentPolicy(): Promise<ConsentPolicy> {
    return runSafely(async () => {
      const { data, error } = await client
        .from('consent_policies')
        .select('purpose, policy_version, published_at')
        .eq('purpose', 'health_processing')
        .eq('is_current', true)
        .maybeSingle()

      if (error) throw error
      if (!data) throw new SignalDomainError('consent_policy_unavailable')
      return parseConsentPolicy(data)
    })
  }

  async function recordCurrentHealthConsent(command: RecordHealthConsentCommand): Promise<ConsentEvent> {
    return runSafely(async () => {
      const idempotencyKey = commandKey(command)
      if (command.action !== 'granted' && command.action !== 'withdrawn') {
        throw new SignalDomainError('validation', { fieldErrors: { action: 'Ação de consentimento inválida.' } })
      }
      const userId = await currentUserId()
      const { data, error } = await client.rpc('record_current_health_consent', {
        p_action: command.action,
        p_idempotency_key: idempotencyKey,
      })

      if (error) throw error
      const event = parseConsentEvent(rpcRow(data))
      if (
        event.studentUserId !== userId
        || event.purpose !== 'health_processing'
        || event.action !== command.action
      ) throw new SignalDomainError('service_unavailable')
      return event
    })
  }

  async function createPainReport(command: CreatePainReportCommand): Promise<string> {
    return runSafely(async () => {
      const idempotencyKey = commandKey(command)
      const payload = mapPainReportDraft(command.draft)
      const { data, error } = await client.rpc('create_pain_report', {
        p_region: payload.region,
        p_side: payload.side,
        p_movement: payload.movement,
        p_timing: payload.timing,
        p_intensity: payload.intensity,
        p_onset: payload.onset,
        p_detail: payload.detail,
        p_red_flags: payload.redFlags,
        p_idempotency_key: idempotencyKey,
      })

      if (error) throw error
      if (typeof data !== 'string' || !uuidPattern.test(data)) throw new SignalDomainError('service_unavailable')
      return data
    })
  }

  async function listOwnReports(options: SignalPageOptions = {}): Promise<SignalPage<PainReportSummary>> {
    return runSafely(async () => {
      const page = parsePageOptions(options)
      const userId = await currentUserId()
      const { data, error } = await client
        .from('pain_reports')
        .select(painReportSummaryColumns)
        .eq('student_user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page.offset, page.offset + page.limit)

      if (error) throw error
      const reports = rowsFrom(data).map(parsePainReportSummary)
      if (reports.some((report) => report.studentUserId !== userId)) {
        throw new SignalDomainError('service_unavailable')
      }
      return pageFrom(reports, page.limit, page.offset)
    })
  }

  async function listWorkspaceReports(
    workspaceId: string,
    options: SignalPageOptions = {},
  ): Promise<SignalPage<PainReportSummary>> {
    return runSafely(async () => {
      assertUuid(workspaceId, 'workspaceId')
      const page = parsePageOptions(options)
      const { data, error } = await client
        .from('pain_reports')
        .select(painReportSummaryColumns)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page.offset, page.offset + page.limit)

      if (error) throw error
      const reports = rowsFrom(data).map(parsePainReportSummary)
      if (reports.some((report) => report.workspaceId !== workspaceId)) {
        throw new SignalDomainError('service_unavailable')
      }
      return pageFrom(reports, page.limit, page.offset)
    })
  }

  async function listStudentReports(
    workspaceId: string,
    studentUserId: string,
    options: SignalPageOptions = {},
  ): Promise<SignalPage<PainReportSummary>> {
    return runSafely(async () => {
      assertUuid(workspaceId, 'workspaceId')
      assertUuid(studentUserId, 'studentUserId')
      const page = parsePageOptions(options)
      const { data, error } = await client
        .from('pain_reports')
        .select(painReportSummaryColumns)
        .eq('workspace_id', workspaceId)
        .eq('student_user_id', studentUserId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page.offset, page.offset + page.limit)

      if (error) throw error
      const reports = rowsFrom(data).map(parsePainReportSummary)
      if (reports.some((report) => report.workspaceId !== workspaceId || report.studentUserId !== studentUserId)) {
        throw new SignalDomainError('service_unavailable')
      }
      return pageFrom(reports, page.limit, page.offset)
    })
  }

  async function listTrainerPainReports(
    workspaceId: string,
    options: TrainerPainReportPageOptions = {},
  ): Promise<SignalPage<PainReportLifecycleSummary>> {
    return runSafely(async () => {
      assertUuid(workspaceId, 'workspaceId')
      if (!isRecord(options)) throw new SignalDomainError('validation')
      const page = parsePageOptions(options)
      const studentUserId = options.studentUserId
      if (studentUserId !== undefined) {
        if (typeof studentUserId !== 'string') throw new SignalDomainError('validation')
        assertUuid(studentUserId, 'studentUserId')
      }
      const unresolvedOnly = options.unresolvedOnly ?? true
      if (typeof unresolvedOnly !== 'boolean') throw new SignalDomainError('validation')
      const { data, error } = await client.rpc('list_trainer_pain_reports', {
        p_workspace_id: workspaceId,
        p_student_user_id: studentUserId ?? null,
        p_only_unresolved: unresolvedOnly,
        p_limit: page.limit,
        p_offset: page.offset,
      })

      if (error) throw error
      const reports = rowsFrom(data).map(parsePainReportLifecycleSummary)
      if (reports.some((report) =>
        report.workspaceId !== workspaceId
        || (studentUserId !== undefined && report.studentUserId !== studentUserId))) {
        throw new SignalDomainError('service_unavailable')
      }
      return pageFrom(reports, page.limit, page.offset)
    })
  }

  async function getPainReport(painReportId: string): Promise<PainReport | null> {
    return runSafely(async () => {
      assertUuid(painReportId, 'painReportId')
      const { data, error } = await client
        .from('pain_reports')
        .select(painReportColumns)
        .eq('id', painReportId)
        .maybeSingle()

      if (error) throw error
      if (!data) return null
      const report = parsePainReport(data)
      if (report.id !== painReportId) throw new SignalDomainError('service_unavailable')
      return report
    })
  }

  async function listPainReportTimeline(
    painReportId: string,
    options: SignalPageOptions = {},
  ): Promise<SignalPage<PainReportEvent>> {
    return runSafely(async () => {
      assertUuid(painReportId, 'painReportId')
      const page = parsePageOptions(options)
      const { data, error } = await client
        .from('pain_report_events')
        .select(painReportEventColumns)
        .eq('pain_report_id', painReportId)
        .order('event_sequence', { ascending: true })
        .order('id', { ascending: true })
        .range(page.offset, page.offset + page.limit)

      if (error) throw error
      const events = rowsFrom(data).map(parsePainReportEvent)
      const first = events[0]
      if (events.some((event) =>
        event.painReportId !== painReportId
        || (first && (event.workspaceId !== first.workspaceId || event.studentUserId !== first.studentUserId)))) {
        throw new SignalDomainError('service_unavailable')
      }
      return pageFrom(events, page.limit, page.offset)
    })
  }

  async function acknowledgePainReport(command: AcknowledgePainReportCommand): Promise<string> {
    return runSafely(async () => {
      const idempotencyKey = commandKey(command)
      assertUuid(command.painReportId, 'painReportId')
      const { data, error } = await client.rpc('acknowledge_pain_report', {
        p_pain_report_id: command.painReportId,
        p_idempotency_key: idempotencyKey,
        p_note: normalizeActionNote(command.note, false),
      })

      if (error) throw error
      if (typeof data !== 'string' || !uuidPattern.test(data)) throw new SignalDomainError('service_unavailable')
      return data
    })
  }

  async function resolvePainReport(command: ResolvePainReportCommand): Promise<string> {
    return runSafely(async () => {
      const idempotencyKey = commandKey(command)
      assertUuid(command.painReportId, 'painReportId')
      const { data, error } = await client.rpc('resolve_pain_report', {
        p_pain_report_id: command.painReportId,
        p_idempotency_key: idempotencyKey,
        p_resolution_note: normalizeActionNote(command.resolutionNote, true),
      })

      if (error) throw error
      if (typeof data !== 'string' || !uuidPattern.test(data)) throw new SignalDomainError('service_unavailable')
      return data
    })
  }

  return {
    fetchActiveStudentMembership,
    fetchCurrentConsentPolicy,
    recordCurrentHealthConsent,
    grantCurrentHealthConsent: (command: IdempotentSignalCommand) => recordCurrentHealthConsent({
      ...command,
      action: 'granted',
    }),
    withdrawCurrentHealthConsent: (command: IdempotentSignalCommand) => recordCurrentHealthConsent({
      ...command,
      action: 'withdrawn',
    }),
    createPainReport,
    listOwnReports,
    listWorkspaceReports,
    listStudentReports,
    listTrainerPainReports,
    getPainReport,
    listPainReportTimeline,
    acknowledgePainReport,
    resolvePainReport,
  }
}
