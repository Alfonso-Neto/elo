import { createClient } from '@supabase/supabase-js'

const REQUIRED_ENV = [
  'PILOT_SUPABASE_URL',
  'PILOT_SUPABASE_PUBLISHABLE_KEY',
  'PILOT_TRAINER_EMAIL',
  'PILOT_TRAINER_PASSWORD',
  'PILOT_TRAINER_USER_ID',
  'PILOT_TRAINER_EXPECTED_ROLE',
  'PILOT_TRAINER_EXPECTED_ACCESS_MODE',
  'PILOT_STUDENT_EMAIL',
  'PILOT_STUDENT_PASSWORD',
  'PILOT_STUDENT_USER_ID',
  'PILOT_WORKSPACE_ID',
  'PILOT_FOREIGN_WORKSPACE_ID',
  'PILOT_FOREIGN_WORKSPACE_NAME',
  'PILOT_FOREIGN_STUDENT_USER_ID',
  'PILOT_FOREIGN_SCHEDULE_SLOT_ID',
]

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_ENV = [
  'PILOT_TRAINER_USER_ID',
  'PILOT_STUDENT_USER_ID',
  'PILOT_WORKSPACE_ID',
  'PILOT_FOREIGN_WORKSPACE_ID',
  'PILOT_FOREIGN_STUDENT_USER_ID',
  'PILOT_FOREIGN_SCHEDULE_SLOT_ID',
]

const results = []

function record(name, passed, category = passed ? 'passed' : 'unexpected_response') {
  results.push({ name, status: passed ? 'passed' : 'failed', category })
  console.log(JSON.stringify({ test: name, status: passed ? 'passed' : 'failed', category }))
}

function failConfiguration(message) {
  record('configuration', false, message)
  finish(2)
  process.exit(2)
}

function finish(forcedExitCode) {
  const failed = results.filter((result) => result.status === 'failed').length
  console.log(JSON.stringify({
    type: 'remote_acceptance_summary',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    passed: results.length - failed,
    failed,
    secrets_redacted: true,
  }))
  process.exitCode = forcedExitCode ?? (failed === 0 ? 0 : 1)
}

function client(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'elo-remote-acceptance' } },
  })
}

async function authenticate(label, email, password, expectedUserId, url, key) {
  const supabase = client(url, key)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  const passed = !error && data.user?.id === expectedUserId && Boolean(data.session?.access_token)
  record(`${label}.authentication`, passed, passed ? 'passed' : error ? 'authentication_rejected' : 'identity_mismatch')
  return passed ? supabase : null
}

async function expectRows(name, request, predicate) {
  const { data, error } = await request
  const passed = !error && Array.isArray(data) && predicate(data)
  record(name, passed, passed ? 'passed' : error ? 'query_rejected' : 'row_mismatch')
}

async function expectNoRows(name, request) {
  const { data, error } = await request
  const passed = !error && Array.isArray(data) && data.length === 0
  record(name, passed, passed ? 'passed' : error ? 'query_rejected' : 'foreign_rows_visible')
}

async function expectRejected(name, request) {
  const { error } = await request
  if (!error) {
    record(name, false, 'unauthorized_rpc_succeeded')
    return
  }
  if (error.code !== '42501') {
    record(name, false, 'unexpected_rpc_error')
    return
  }
  record(name, true, 'expected_access_rejection')
}

const startedAt = new Date().toISOString()
let runtimeFailureHandled = false
function handleRuntimeFailure() {
  if (runtimeFailureHandled) return
  runtimeFailureHandled = true
  record('runtime', false, 'unexpected_exception')
  finish(1)
}
process.on('uncaughtException', handleRuntimeFailure)
process.on('unhandledRejection', handleRuntimeFailure)

const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim())
if (missing.length > 0) failConfiguration(`missing_${missing.length}_required_variables`)

for (const name of UUID_ENV) {
  if (!UUID_PATTERN.test(process.env[name])) failConfiguration(`invalid_uuid_variable_${UUID_ENV.indexOf(name) + 1}`)
}

let parsedUrl
try {
  parsedUrl = new URL(process.env.PILOT_SUPABASE_URL)
} catch {
  failConfiguration('invalid_supabase_url')
}
if (parsedUrl.protocol !== 'https:') failConfiguration('supabase_url_must_use_https')
const publicKey = process.env.PILOT_SUPABASE_PUBLISHABLE_KEY
if (!publicKey.startsWith('sb_publishable_')) failConfiguration('publishable_key_is_required')
if (!['owner', 'trainer'].includes(process.env.PILOT_TRAINER_EXPECTED_ROLE)) {
  failConfiguration('invalid_trainer_expected_role')
}
if (!['verified', 'temporary_homologation'].includes(process.env.PILOT_TRAINER_EXPECTED_ACCESS_MODE)) {
  failConfiguration('invalid_trainer_expected_access_mode')
}
if (process.env.PILOT_WORKSPACE_ID === process.env.PILOT_FOREIGN_WORKSPACE_ID) {
  failConfiguration('foreign_workspace_must_differ')
}
if (process.env.PILOT_STUDENT_USER_ID === process.env.PILOT_FOREIGN_STUDENT_USER_ID) {
  failConfiguration('foreign_student_must_differ')
}
if (process.env.PILOT_TRAINER_EMAIL.toLowerCase() === process.env.PILOT_STUDENT_EMAIL.toLowerCase()) {
  failConfiguration('trainer_and_student_accounts_must_differ')
}

const url = process.env.PILOT_SUPABASE_URL
const key = process.env.PILOT_SUPABASE_PUBLISHABLE_KEY
const trainer = await authenticate(
  'trainer', process.env.PILOT_TRAINER_EMAIL, process.env.PILOT_TRAINER_PASSWORD,
  process.env.PILOT_TRAINER_USER_ID, url, key,
)
const student = await authenticate(
  'student', process.env.PILOT_STUDENT_EMAIL, process.env.PILOT_STUDENT_PASSWORD,
  process.env.PILOT_STUDENT_USER_ID, url, key,
)

if (!trainer || !student) {
  finish(1)
} else {
  await expectRows(
    'trainer.profile_role',
    trainer.from('profiles').select('id,account_role').eq('id', process.env.PILOT_TRAINER_USER_ID),
    (rows) => rows.length === 1 && rows[0].account_role === 'trainer',
  )
  await expectRows(
    'trainer.expected_membership',
    trainer.rpc('get_my_active_membership'),
    (rows) => rows.length === 1
      && rows[0].workspace_id === process.env.PILOT_WORKSPACE_ID
      && rows[0].membership_role === process.env.PILOT_TRAINER_EXPECTED_ROLE,
  )
  await expectRows(
    'trainer.professional_access',
    trainer.rpc('get_my_professional_access', { p_workspace_id: process.env.PILOT_WORKSPACE_ID }),
    (rows) => rows.length === 1
      && rows[0].user_id === process.env.PILOT_TRAINER_USER_ID
      && rows[0].workspace_id === process.env.PILOT_WORKSPACE_ID
      && rows[0].access_mode === process.env.PILOT_TRAINER_EXPECTED_ACCESS_MODE,
  )
  await expectRows(
    'student.profile_role',
    student.from('profiles').select('id,account_role').eq('id', process.env.PILOT_STUDENT_USER_ID),
    (rows) => rows.length === 1 && rows[0].account_role === 'student',
  )
  await expectRows(
    'student.expected_membership',
    student.rpc('get_my_active_membership'),
    (rows) => rows.length === 1
      && rows[0].workspace_id === process.env.PILOT_WORKSPACE_ID
      && rows[0].membership_role === 'student',
  )

  for (const [label, supabase] of [['trainer', trainer], ['student', student]]) {
    await expectNoRows(
      `${label}.foreign_workspace_read_denied`,
      supabase.from('workspaces').select('id').eq('id', process.env.PILOT_FOREIGN_WORKSPACE_ID),
    )
    await expectNoRows(
      `${label}.foreign_member_read_denied`,
      supabase.from('workspace_members').select('workspace_id,user_id')
        .eq('workspace_id', process.env.PILOT_FOREIGN_WORKSPACE_ID)
        .eq('user_id', process.env.PILOT_FOREIGN_STUDENT_USER_ID),
    )
    await expectNoRows(
      `${label}.foreign_workspace_update_denied`,
      supabase.from('workspaces')
        .update({ name: process.env.PILOT_FOREIGN_WORKSPACE_NAME })
        .eq('id', process.env.PILOT_FOREIGN_WORKSPACE_ID)
        .select('id'),
    )
    await expectNoRows(
      `${label}.foreign_access_rpc_denied`,
      supabase.rpc('get_my_professional_access', { p_workspace_id: process.env.PILOT_FOREIGN_WORKSPACE_ID }),
    )
  }

  await expectRejected(
    'trainer.foreign_health_rpc_denied',
    trainer.rpc('list_trainer_pain_reports', {
      p_workspace_id: process.env.PILOT_FOREIGN_WORKSPACE_ID,
      p_student_user_id: process.env.PILOT_FOREIGN_STUDENT_USER_ID,
      p_only_unresolved: true,
      p_limit: 1,
      p_offset: 0,
    }),
  )
  await expectRejected(
    'trainer.foreign_message_rpc_denied',
    trainer.rpc('send_trainer_thread_message', {
      p_student_user_id: process.env.PILOT_FOREIGN_STUDENT_USER_ID,
      p_body: 'Sonda sintetica de isolamento do piloto',
      p_idempotency_key: `pilot-foreign-${crypto.randomUUID()}`,
    }),
  )
  await expectRejected(
    'student.foreign_schedule_rpc_denied',
    student.rpc('request_schedule_slot', {
      p_slot_id: process.env.PILOT_FOREIGN_SCHEDULE_SLOT_ID,
      p_idempotency_key: `pilot-foreign-${crypto.randomUUID()}`,
    }),
  )

  await Promise.allSettled([trainer.auth.signOut({ scope: 'local' }), student.auth.signOut({ scope: 'local' })])
  finish()
}
