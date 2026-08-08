import { describe, expect, it } from 'vitest'
import purposeMigration from '../../../supabase/migrations/20260807245000_nutrition_consent_purpose.sql?raw'
import consentMigration from '../../../supabase/migrations/20260807245100_nutrition_consent_policy.sql?raw'
import nutritionMigration from '../../../supabase/migrations/20260807250000_partner_nutrition.sql?raw'

describe('partner nutrition migrations static safety contract', () => {
  it('commits the new consent enum before the policy and consent RPC use it', () => {
    expect(purposeMigration).toContain("add value if not exists 'nutrition_processing'")
    expect(consentMigration).toContain("values ('nutrition_processing', '2026-08-07-v1', true)")
    expect(consentMigration).toContain('create or replace function public.record_current_nutrition_consent')
    expect(consentMigration).toContain('caller_id uuid := (select auth.uid())')
    expect(consentMigration).not.toMatch(/p_(?:workspace|student|user)_id/i)
  })

  it('limits plan ingestion to a consent-bound service-role partner boundary', () => {
    const ingestPermissions = nutritionMigration.match(
      /revoke all on function public\.ingest_partner_nutrition_plan[\s\S]*?create or replace function public\.record_nutrition_meal_state/,
    )?.[0] ?? ''
    expect(nutritionMigration).toContain("if (select auth.role()) <> 'service_role'")
    expect(nutritionMigration).toContain('from private.current_nutrition_consent_evidence')
    expect(ingestPermissions).toContain(') to service_role;')
    expect(ingestPermissions).toContain(') from public, anon, authenticated;')
    expect(ingestPermissions).not.toContain('to authenticated')
    expect(nutritionMigration).not.toMatch(/create or replace function public\.(?:publish|create|update)_nutrition/i)
  })

  it('keeps all direct writes unavailable and scopes all nutrition reads with RLS', () => {
    expect(nutritionMigration.match(/enable row level security/g)).toHaveLength(3)
    expect(nutritionMigration.match(/private\.can_read_nutrition_subject\(workspace_id, student_user_id\)/g)).toHaveLength(3)
    expect(nutritionMigration).toContain('revoke all on public.nutrition_plan_versions, public.nutrition_meal_events,')
    expect(nutritionMigration).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.nutrition_/i)
    expect(nutritionMigration).not.toMatch(/grant\s+select\s+on\s+public\.nutrition_/i)
  })

  it('uses append-only daily tracking with stable workspace-bound retries', () => {
    expect(nutritionMigration).toContain('nutrition_plans_are_immutable')
    expect(nutritionMigration).toContain('nutrition_meal_events_are_append_only')
    expect(nutritionMigration).toContain('nutrition_hydration_events_are_append_only')
    expect(nutritionMigration).toContain('new.recorded_on := current_date')
    expect(nutritionMigration.match(/unique \(workspace_id, student_user_id, idempotency_key\)/g)).toHaveLength(2)
    expect(nutritionMigration).toContain("'recorded_on', current_date")
    expect(nutritionMigration).not.toMatch(/random\s*\(/i)
  })

  it('rate-limits fresh mutations and preserves replay before budget consumption', () => {
    expect(nutritionMigration).toContain('create table private.nutrition_mutation_budgets')
    expect(nutritionMigration.match(/perform private\.consume_nutrition_mutation_budget/g)).toHaveLength(2)
    const mealRpc = nutritionMigration.match(/create or replace function public\.record_nutrition_meal_state[\s\S]*?create or replace function public\.record_nutrition_hydration_total/)?.[0] ?? ''
    expect(mealRpc.indexOf('if found then')).toBeLessThan(mealRpc.indexOf("consume_nutrition_mutation_budget(target.workspace_id, caller_id, 'meal_state'"))
  })

  it('supports restricted retention pseudonymization without weakening immutability', () => {
    expect(nutritionMigration).toContain('create or replace function private.redact_nutrition_subject_payloads')
    expect(nutritionMigration).toContain("current_user not in ('postgres','supabase_admin')")
    expect(nutritionMigration).toContain("current_setting('elo.nutrition_redaction', true) = 'enabled'")
    expect(nutritionMigration).toContain('from public, anon, authenticated;')
    expect(nutritionMigration).toContain('create table private.nutrition_redaction_events')
  })
})
