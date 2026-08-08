import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/20260807254000_trainer_verification.sql?raw'

function functionBody(name: string, nextMarker: string) {
  const start = migration.indexOf(`create or replace function ${name}`)
  const end = migration.indexOf(nextMarker, start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return migration.slice(start, end)
}

describe('trainer verification migration contract', () => {
  it('backfills explicit lifecycle evidence without claiming imported states were reviewed', () => {
    expect(migration).toContain('add column verification_submitted_at timestamptz')
    expect(migration).toContain('add column verification_decided_at timestamptz')
    expect(migration).toContain('trainer_profiles_verification_lifecycle_check')
    expect(migration).toContain("action text not null check (action in ('baseline','submitted','verified','rejected'))")
    expect(migration).toContain("'Imported state; not evidence of a review by this workflow'")
    expect(migration).toContain('create trigger trainer_verification_events_append_only')
    expect(migration).toContain('references public.trainer_profiles(user_id) on delete cascade')
    expect(migration).toContain("tg_op = 'DELETE' and not exists")
    const appendOnlyGuard = functionBody(
      'private.prevent_trainer_verification_event_mutation',
      '$$;',
    )
    expect(appendOnlyGuard).toContain('security definer')
    expect(appendOnlyGuard).toContain('from public.trainer_profiles')
    expect(appendOnlyGuard).toContain('from public.profiles')
    expect(appendOnlyGuard).toContain('from auth.users')
    expect(migration).toContain('alter table private.trainer_verification_events enable row level security')
    expect(migration).toContain('revoke all on private.trainer_verification_events from public, anon, authenticated')
  })

  it('prevents duplicate approved credentials and browser-side credential edits', () => {
    expect(migration).toContain('create unique index trainer_profiles_one_verified_cref_idx')
    expect(migration).toContain("where verification_status = 'verified'")
    expect(migration).toContain('trainer_profiles_cref_canonical_check')
    expect(migration).toContain('revoke update (cref_number, cref_state, studio_name) on public.trainer_profiles from authenticated')
  })

  it('keeps verification lifecycle feedback private to the affected professional', () => {
    const privilegesStart = migration.indexOf('revoke select on public.trainer_profiles from authenticated')
    const privilegesEnd = migration.indexOf(
      'create or replace function public.submit_trainer_verification',
      privilegesStart,
    )
    expect(privilegesStart).toBeGreaterThanOrEqual(0)
    expect(privilegesEnd).toBeGreaterThan(privilegesStart)
    const privileges = migration.slice(privilegesStart, privilegesEnd)
    expect(privileges).toContain('grant select (')
    expect(privileges).toContain('cref_number')
    expect(privileges).not.toContain('verification_status')
    expect(privileges).not.toContain('verification_submitted_at')
    expect(privileges).not.toContain('verification_decided_at')
    expect(privileges).not.toContain('verification_rejection_reason')
    const access = functionBody('public.get_my_professional_access', '$$;')
    expect(access).toContain('member.user_id = (select auth.uid())')
  })

  it('serializes submission and replays the exact immutable intent before lifecycle checks', () => {
    const body = functionBody(
      'public.submit_trainer_verification',
      'revoke all on function public.submit_trainer_verification',
    )
    const firstReplay = body.indexOf("stored.actor_scope = 'trainer:'")
    const rowLock = body.indexOf('for update of stored')
    const secondReplay = body.indexOf("stored.actor_scope = 'trainer:'", firstReplay + 1)
    const lifecycleCheck = body.indexOf("trainer.verification_status not in ('unverified','rejected')")
    expect(firstReplay).toBeGreaterThanOrEqual(0)
    expect(firstReplay).toBeLessThan(rowLock)
    expect(secondReplay).toBeGreaterThan(rowLock)
    expect(secondReplay).toBeLessThan(lifecycleCheck)
    expect(body).toContain("verification_status = 'pending'")
    expect(body).toContain("action,\n    previous_status,\n    next_status")
  })

  it('keeps review service-role-only, attributable, idempotent, and row locked', () => {
    const body = functionBody(
      'public.review_trainer_verification',
      'revoke all on function public.review_trainer_verification',
    )
    expect(body).toContain("coalesce((select auth.role()), '') <> 'service_role'")
    expect(body).toContain('p_reviewer_reference text')
    expect(body).toContain("stored.actor_scope = 'service_role'")
    expect(body).toContain('for update of stored')
    const rowLock = body.indexOf('for update of stored')
    const postLockReplay = body.indexOf("stored.actor_scope = 'service_role'", rowLock)
    const lifecycleCheck = body.indexOf("trainer.verification_status <> 'pending'")
    expect(postLockReplay).toBeGreaterThan(rowLock)
    expect(postLockReplay).toBeLessThan(lifecycleCheck)
    const privilegesStart = migration.indexOf(
      'revoke all on function public.review_trainer_verification',
    )
    const privilegesEnd = migration.indexOf(
      '-- The browser can no longer mutate',
      privilegesStart,
    )
    expect(privilegesStart).toBeGreaterThanOrEqual(0)
    expect(privilegesEnd).toBeGreaterThan(privilegesStart)
    const privileges = migration.slice(privilegesStart, privilegesEnd)
    expect(privileges).toContain('from public, anon, authenticated')
    expect(privileges).toContain('to service_role')
    expect(privileges).not.toContain('to authenticated')
  })

  it('derives every professional gate from one verified-or-temporary decision', () => {
    expect(migration).toContain('create or replace function private.professional_access_mode(')
    expect(migration).toContain("then 'temporary_homologation'")
    expect(migration).toContain("else 'blocked'")
    for (const helper of [
      'private.is_training_professional',
      'private.is_trainer_ai_enabled',
      'private.is_workspace_trainer',
    ]) {
      const body = functionBody(helper, '$$;')
      expect(body).toContain('private.professional_access_mode')
      expect(body).not.toContain('private.ai_workspace_access')
    }
    const ownedWorkspace = functionBody('private.current_owned_workspace', '$$;')
    expect(ownedWorkspace).toContain('private.professional_access_mode')
    const profileGate = functionBody('private.can_view_profile', '$$;')
    expect(profileGate).toContain('target_user_id = (select auth.uid())')
    expect(profileGate).toContain('private.professional_access_mode')
  })

  it('requires a fresh attributable grant for temporary full access', () => {
    expect(migration).toContain('create table private.temporary_professional_access_grants')
    expect(migration).toContain('create table private.temporary_professional_access_revocations')
    expect(migration).toContain('trainer_user_id uuid not null')
    expect(migration).toContain("check (expires_at <= created_at + interval '7 days')")
    expect(migration).toContain('reviewer_reference text not null')
    expect(migration).toContain('temporary_professional_access_grants_append_only')
    expect(migration).toContain('temporary_professional_access_revocations_append_only')
    const privilegesStart = migration.indexOf(
      'revoke all on private.temporary_professional_access_grants',
    )
    const privilegesEnd = migration.indexOf(
      'create or replace function private.prepare_temporary_professional_access_grant',
      privilegesStart,
    )
    expect(privilegesStart).toBeGreaterThanOrEqual(0)
    expect(privilegesEnd).toBeGreaterThan(privilegesStart)
    const privileges = migration.slice(privilegesStart, privilegesEnd)
    expect(privileges).toContain('from public, anon, authenticated, service_role')
    expect(privileges).toContain('grant select, insert on private.temporary_professional_access_grants')
    expect(privileges).not.toContain('grant update')
    expect(privileges).not.toContain('grant delete')
    expect(privileges).not.toContain('grant truncate')
    expect(migration).toContain('grant execute on function private.valid_training_idempotency_key(text) to service_role')
    const accessMode = functionBody('private.professional_access_mode', '$$;')
    expect(accessMode).toContain('private.temporary_professional_access_grants')
    expect(accessMode).toContain('private.temporary_professional_access_revocations')
    expect(accessMode).toContain('access.trainer_user_id = member.user_id')
    expect(accessMode).not.toContain('private.ai_workspace_access')
  })

  it('exposes only a self-scoped access row and invalidates old invitations after access loss', () => {
    const access = functionBody('public.get_my_professional_access', '$$;')
    expect(access).toContain('member.user_id = (select auth.uid())')
    expect(access).toContain('member.workspace_id = p_workspace_id')
    expect(access).not.toContain('access.reason')
    expect(access).toContain('temporary_access_expires_at')
    expect(access).toContain('private.temporary_professional_access_grants')
    expect(access).toContain('temporary_access.trainer_user_id = member.user_id')
    expect(access).not.toContain('private.ai_workspace_access')
    const invitation = functionBody('public.accept_workspace_invitation', '$$;')
    expect(invitation).toContain('not private.is_training_professional(invitation.invited_by, invitation.workspace_id)')
  })
})
