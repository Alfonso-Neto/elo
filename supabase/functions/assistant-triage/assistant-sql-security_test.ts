const migrationUrl = new URL(
  "../../migrations/20260807210000_ai_assistant_audit.sql",
  import.meta.url,
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("static SQL: run lifecycle requires executor attestation", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const edge = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(
    sql.includes("private.is_ai_executor_attested(p_executor_secret)"),
    "RPCs must check attestation",
  );
  assert(
    (sql.match(/private\.is_ai_executor_attested\(p_executor_secret\)/g) ?? [])
      .length >= 3,
    "reserve, complete, and fail must each attest",
  );
  assert(
    sql.includes("private.ai_executor_config"),
    "database must retain only executor hash configuration",
  );
  assert(
    sql.includes("secret_hash bytea"),
    "raw executor secret must not be stored",
  );
  assert(
    edge.includes('env("AI_EXECUTOR_SECRET")') &&
      !edge.includes("SUPABASE_SERVICE_ROLE_KEY"),
    "Edge execution must attest without broad service-role authority",
  );
});

Deno.test("static SQL: consent evidence and idempotency are database invariants", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  assert(
    sql.includes("consent_event_id uuid not null"),
    "run must persist exact consent evidence",
  );
  assert(
    sql.includes("consent_event.action = 'granted'"),
    "reservation must require the latest grant",
  );
  assert(
    sql.includes("unique (requested_by, idempotency_key_hash)"),
    "idempotency must be principal-scoped",
  );
  assert(
    sql.includes("pg_advisory_xact_lock"),
    "concurrent retries and budgets must serialize",
  );
  assert(
    sql.includes("input_digest <> p_input_digest"),
    "key reuse must be bound to canonical input",
  );
  assert(
    sql.includes("for update") &&
      sql.includes("existing_run.created_at <= now() - interval '2 minutes'"),
    "idempotent processing leases must serialize and expire safely",
  );
});

Deno.test("static SQL: trainer and resource budgets fail closed", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  assert(
    sql.includes("verification_status = 'verified'"),
    "verified trainer gate is required",
  );
  assert(
    sql.includes("private.ai_workspace_access"),
    "homologation exceptions must be explicit and expiring",
  );
  assert(
    sql.includes("private.ai_daily_user_usage"),
    "daily user budget is required",
  );
  assert(
    sql.includes("private.ai_daily_workspace_usage"),
    "daily workspace budget is required",
  );
  assert(
    sql.includes("concurrent user limit exceeded"),
    "per-user concurrency limit is required",
  );
  assert(
    sql.includes("concurrent workspace limit exceeded"),
    "per-workspace concurrency limit is required",
  );
});
