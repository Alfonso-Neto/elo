# Assistant triage deployment

The function deliberately uses the caller's JWT for RLS and membership checks.
It does **not** use `service_role`. Run lifecycle RPCs additionally require a
server-only executor secret, so a browser cannot forge a model completion.

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
time-bounded workspace exception inserted by an administrator:

```sql
insert into private.ai_workspace_access (workspace_id, reason, expires_at)
values ('<workspace-uuid>', 'Homologation cohort', now() + interval '14 days')
on conflict (workspace_id) do update
set enabled = true,
    reason = excluded.reason,
    expires_at = excluded.expires_at;
```

Remove or disable the row when homologation ends. Students may request pain
triage only for their own authoritative pain report and still need current
health consent.

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
client-authored pain text or red flags for this path. Trainer copilot remains a
minimized free-text path until authoritative workout tables exist.

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
