# Assistant triage deployment

No produto Elo, esta função medeia dois fluxos: a triagem estruturada do relato de dor do aluno e as propostas do Copiloto para o professor. Ela organiza contexto e produz propostas para revisão humana; nunca diagnostica nem altera ou publica treino, prescrição ou decisão profissional. A função persiste os registros de execução e proposta necessários ao ciclo de auditoria; a decisão é registrada separadamente por um usuário autorizado.

The function deliberately uses the caller's JWT for RLS and membership checks.
It does **not** use `service_role`. Run lifecycle RPCs additionally require a
server-only executor secret, so a browser cannot forge a model completion.
The Supabase client uses the hosted `SUPABASE_PUBLISHABLE_KEYS.default` value
(or the documented singular local-development fallback), never a legacy
`SUPABASE_ANON_KEY`.

## Current status

The function, shared validators, SQL lifecycle and Deno tests are versioned in
this repository. The function has been deployed and authenticated smoke-tested
in the dedicated Elo homologation project with a publishable key and caller
JWT. This evidence does not authorize production or replace provider, CORS,
cross-workspace and lifecycle acceptance for each released commit.

## Required secrets

Configure these only in the Supabase Edge secret store:

- `OPENAI_API_KEY`
- `AI_EXECUTOR_SECRET`: exactly 32 cryptographically random bytes encoded as 64
  lowercase hexadecimal characters
- `SAFETY_ID_SALT`: a separate high-entropy value of at least 32 characters
- `ALLOWED_ORIGINS`: comma-separated exact homologation/production origins
- optional `OPENAI_MODEL` and `OPENAI_REASONING_EFFORT`

Never put these values in `VITE_*`, repository files, SQL migrations, logs, or
client requests. `AI_EXECUTOR_SECRET` and `SAFETY_ID_SALT` must be independent
values.

## One-time database attestation configuration

1. Generate `AI_EXECUTOR_SECRET` in a secret manager/CSPRNG.
2. Hash the **decoded 32 secret bytes** with SHA-256 outside PostgreSQL.
3. Set the raw 64-character secret as the Edge `AI_EXECUTOR_SECRET`.
4. Through an administrative SQL connection, store only its 32-byte hash:

```sql
insert into private.ai_executor_config (singleton, secret_hash)
values (true, decode('<SHA256_OF_DECODED_SECRET_BYTES_HEX>', 'hex'))
on conflict (singleton) do update
set secret_hash = excluded.secret_hash,
    configured_at = now();
```

The placeholder is the hash, not the Edge secret. The function fails closed
until the database hash and Edge secret match. Rotate both immediately if the
raw secret could have reached logs or a client.

## Homologation access

Verified trainers are allowed automatically. An unverified trainer requires a
new, time-bounded full-professional-access grant inserted by an administrator.
Legacy rows in `private.ai_workspace_access` are retained only as migration
history and no longer authorize AI runs or any other professional workflow.

```sql
insert into private.temporary_professional_access_grants (
  workspace_id,
  trainer_user_id,
  reason,
  reviewer_reference,
  idempotency_key,
  expires_at
) values (
  '<workspace-uuid>',
  '<trainer-user-uuid>',
  'Coorte de homologação aprovada',
  'CHAMADO-OPS-1234',
  'temporary-access:550e8400-e29b-41d4-a716-446655440000',
  now() + interval '48 hours'
)
returning id, expires_at;
```

Grants last at most seven days and cannot be edited or deleted. Revoke one by
appending an attributable revocation (use a fresh idempotency key):

```sql
insert into private.temporary_professional_access_revocations (
  grant_id,
  reason,
  reviewer_reference,
  idempotency_key
) values (
  '<grant-uuid>',
  'Homologação encerrada',
  'CHAMADO-OPS-1234',
  'temporary-revoke:550e8400-e29b-41d4-a716-446655440000'
);
```

Students may request pain triage only for their own authoritative pain report
and still need current health consent.

## Client contract

Every `POST` requires `Content-Type: application/json`, a user bearer token, and
an `Idempotency-Key` of 16–128 allowlisted ASCII characters. Reuse the same key
only for the exact same logical request.

Pain triage accepts identifiers only:

```json
{
  "kind": "pain_triage",
  "workspace_id": "<uuid>",
  "subject_student_id": "<uuid>",
  "pain_report_id": "<uuid>",
  "locale": "pt-BR"
}
```

The function loads the immutable report through RLS. It never accepts
client-authored pain text or red flags for this path. Trainer copilot accepts
only the bounded, minimized report and workout context described by the shared
schema; that client context remains untrusted and can produce proposals only,
never a direct mutation or publication.

All accepted requests are bounded before contacting the model provider. Elo
keeps authorization identifiers in its own boundary, sends only the minimized
model request, and validates the provider's structured response before storing
it. A stored proposal is still inert until an authorized user records a
decision through the audited RPC.

## Deployment order

1. Apply the matching migrations to the intended homologation project.
2. Configure and attest `AI_EXECUTOR_SECRET` as described above.
3. Configure `SAFETY_ID_SALT`, `OPENAI_API_KEY` and exact `ALLOWED_ORIGINS`.
4. Run `deno check` and all Deno tests from the same commit.
5. Deploy with JWT verification enabled.
6. Exercise pain triage as a student and trainer copilot as an authorized
   professional, then verify the run, proposal and decision audit records.
7. Test an invalid origin, another workspace, expired consent, an unverified
   trainer and an executor-secret mismatch; each must fail closed.

## Verification

Run in an environment with Deno and a disposable Supabase database:

```text
deno check supabase/functions/assistant-triage/index.ts
deno test --allow-read supabase/functions/assistant-triage
supabase db reset
```

Also test concurrent identical idempotency keys, changed payload reuse,
cross-tenant IDs, withdrawn consent, unverified trainers, daily/concurrent
quotas, oversized chunked bodies, provider refusal/incomplete responses, and
executor-secret mismatch.

Do not mark the function accepted from HTTP status alone. Correlate the safe
`request_id` with the database lifecycle and confirm that logs contain no user
identifier, bearer token, report body, model response or idempotency key.
