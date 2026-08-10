import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/20260807252000_notification_feed.sql?raw'

describe('notification feed migration static safety contract', () => {
  it('stores only private read receipts and exposes writes through one RPC', () => {
    expect(migration).toContain('create table private.notification_read_receipts')
    expect(migration).toContain('revoke all on private.notification_read_receipts from public, anon, authenticated')
    expect(migration).not.toMatch(/grant\s+(?:select|insert|update|delete|all)\s+on\s+private\.notification_read_receipts/i)
    expect(migration).toContain('create or replace function public.mark_my_notifications_read(p_item_keys text[])')
    expect(migration).not.toMatch(/mark_my_notifications_read\([^)]*workspace/i)
    expect(migration).not.toMatch(/mark_my_notifications_read\([^)]*user/i)
  })

  it('derives one active workspace from auth and verifies professionals', () => {
    expect(migration).toContain('caller_id uuid := (select auth.uid())')
    expect(migration).toContain("member.status = 'active'")
    expect(migration).toContain("raise exception using errcode = '21000', message = 'notification_scope_ambiguous'")
    expect(migration).toContain('private.is_training_professional(caller_id, notification_workspace_id)')
    expect(migration).toContain('where member.workspace_id = notification_workspace_id')
  })

  it('requires current consent for professional health notifications', () => {
    expect(migration.match(/private\.has_current_health_processing_consent/g)).toHaveLength(3)
    expect(migration).toContain('submission.redacted_at is null')
    expect(migration).toContain('completion.redacted_at is null')
    expect(migration).toContain("scope.resolved_role in ('owner','trainer')")
  })

  it('keeps message bodies out of the feed and scopes student sources to self', () => {
    expect(migration).not.toContain('message.body')
    expect(migration).toContain("'Conversa privada atualizada'")
    expect((migration.match(/scope\.resolved_user_id/g) ?? []).length).toBeGreaterThanOrEqual(8)
    expect(migration).toContain('plan.student_user_id = scope.resolved_user_id')
    expect(migration).toContain('event.student_user_id = scope.resolved_user_id')
  })

  it('bounds history and only marks currently visible stable items', () => {
    expect((migration.match(/now\(\) - interval '90 days'/g) ?? []).length).toBeGreaterThanOrEqual(10)
    expect(migration).toContain('p_limit not between 1 and 50')
    expect(migration).toContain('from public.list_my_notifications(50) as feed')
    expect(migration).toContain('available_count <> requested_count')
    expect(migration).toContain('on conflict (workspace_id, user_id, item_key)')
  })

  it('provides restricted receipt retention cleanup', () => {
    expect(migration).toContain('create or replace function private.prune_notification_read_receipts')
    expect(migration).toContain("current_user not in ('postgres','supabase_admin')")
    expect(migration).toContain('retain_since > clock_timestamp() - interval \'30 days\'')
    expect(migration).toContain('from public, anon, authenticated;')
  })
})
