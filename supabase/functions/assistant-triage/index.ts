import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import {
  createSafetyIdentifier,
  saltedSha256Hex,
} from "../_shared/assistant-crypto.ts";
import { corsForRequest } from "../_shared/cors.ts";
import {
  declaredBodyTooLarge,
  isStrictJsonContentType,
  readBodyWithLimit,
  readIdempotencyKey,
} from "../_shared/assistant-http.ts";
import {
  type AssistantModelRequest,
  type AssistantProposal,
  type PainTriageRequest,
  validateAssistantProposal,
  validateAssistantRequest,
} from "../_shared/assistant-types.ts";
import {
  buildEmergencyProposal,
  enforceProposalBoundaries,
  evaluateSafety,
} from "../_shared/assistant-safety.ts";
import { createModelProposal, ProviderError } from "./openai.ts";

const MAX_BODY_BYTES = 32_768;
const DEFAULT_MODEL = "gpt-5.6-sol";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FailureCode =
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_authentication"
  | "provider_bad_request"
  | "provider_refusal"
  | "provider_incomplete"
  | "invalid_provider_output"
  | "persistence_failed"
  | "internal_error";

type PublicErrorCode =
  | "bad_request"
  | "payload_too_large"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "rate_limited"
  | "unavailable";

type Reservation = {
  runId: string;
  status: "processing" | "completed" | "failed";
  reused: boolean;
  proposalId: string | null;
  completionMode: "model" | "deterministic_safety" | null;
};

const env = (name: string) => Deno.env.get(name)?.trim() ?? "";
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  requestId: string,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": requestId,
    },
  });
}

function errorResponse(
  status: number,
  code: PublicErrorCode,
  requestId: string,
  corsHeaders: Record<string, string>,
) {
  const message = status >= 500
    ? "O assistente está indisponível no momento. Tente novamente."
    : code === "rate_limited"
    ? "Muitas solicitações em pouco tempo. Aguarde alguns minutos."
    : code === "conflict"
    ? "Esta solicitação já foi usada com dados diferentes."
    : code === "payload_too_large"
    ? "Os dados enviados ultrapassam o limite permitido."
    : code === "bad_request"
    ? "Não foi possível processar os dados enviados."
    : "Não foi possível autorizar esta solicitação.";
  const headers: Record<string, string> = code === "rate_limited"
    ? { "Retry-After": "60" }
    : {};
  return jsonResponse(
    status,
    { error: { code, message }, request_id: requestId },
    requestId,
    corsHeaders,
    headers,
  );
}

function logFailure(requestId: string, code: string, status: number) {
  // Never log user ids, secrets, bearer tokens, reports, model output, provider
  // response bodies, idempotency keys, or database error details.
  console.error(
    JSON.stringify({
      event: "assistant_request_failed",
      request_id: requestId,
      code,
      status,
    }),
  );
}

function parseReservation(value: unknown): Reservation | null {
  if (!isRecord(value)) return null;
  const runId = value.run_id;
  const status = value.status;
  const proposalId = value.proposal_id;
  const completionMode = value.completion_mode;
  if (typeof runId !== "string" || !UUID_PATTERN.test(runId)) return null;
  if (!["processing", "completed", "failed"].includes(String(status))) {
    return null;
  }
  if (typeof value.reused !== "boolean") return null;
  if (
    proposalId !== null &&
    (typeof proposalId !== "string" || !UUID_PATTERN.test(proposalId))
  ) return null;
  if (
    completionMode !== null && completionMode !== "model" &&
    completionMode !== "deterministic_safety"
  ) return null;
  return {
    runId,
    status: status as Reservation["status"],
    reused: value.reused,
    proposalId: proposalId as string | null,
    completionMode,
  };
}

function proposalFromRow(row: unknown): AssistantProposal | null {
  if (!isRecord(row)) return null;
  const proposal = {
    summary: row.summary,
    urgency: row.urgency,
    red_flags: row.red_flags,
    questions: row.questions,
    rationale: row.rationale,
    workout_changes: row.workout_changes,
    sources: row.sources,
    uncertainties: row.uncertainties,
    disclaimer: row.disclaimer,
  };
  return validateAssistantProposal(proposal) ? proposal : null;
}

function painReportToModelRequest(
  request: PainTriageRequest,
  row: Record<string, unknown>,
): { request: AssistantModelRequest; structuredRedFlags: string[] } | null {
  const requiredStrings = ["region", "side", "movement", "timing", "onset"];
  if (
    requiredStrings.some((key) =>
      typeof row[key] !== "string" || (row[key] as string).length === 0
    )
  ) return null;
  if (
    !Number.isInteger(row.intensity) || (row.intensity as number) < 0 ||
    (row.intensity as number) > 10
  ) return null;
  if (row.detail !== null && typeof row.detail !== "string") return null;
  if (
    !Array.isArray(row.red_flags) || row.red_flags.length > 12 ||
    row.red_flags.some((flag) =>
      typeof flag !== "string" || !/^[a-z][a-z0-9_]{1,47}$/.test(flag)
    )
  ) return null;

  const report = JSON.stringify({
    region: row.region,
    side: row.side,
    movement: row.movement,
    timing: row.timing,
    intensity: row.intensity,
    onset: row.onset,
    detail: row.detail,
  });
  return {
    request: {
      kind: "pain_triage",
      locale: request.locale,
      report,
      context: {},
    },
    structuredRedFlags: [...row.red_flags] as string[],
  };
}

async function loadExistingProposal(
  supabase: ReturnType<typeof createClient<any>>,
  reservation: Reservation,
) {
  if (!reservation.proposalId) return null;
  const { data, error } = await supabase
    .from("ai_proposals")
    .select(
      "id, run_id, summary, urgency, red_flags, questions, rationale, workout_changes, sources, uncertainties, disclaimer",
    )
    .eq("id", reservation.proposalId)
    .eq("run_id", reservation.runId)
    .maybeSingle();
  if (error || !data) return null;
  return proposalFromRow(data);
}

async function handleRequest(
  request: Request,
  requestId: string,
  cors: ReturnType<typeof corsForRequest>,
): Promise<Response> {
  if (!cors.allowed) {
    return errorResponse(403, "forbidden", requestId, cors.headers);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...cors.headers, "X-Request-Id": requestId },
    });
  }
  if (request.method !== "POST") {
    return errorResponse(405, "bad_request", requestId, cors.headers);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S{20,4096}$/i.test(authorization)) {
    return errorResponse(401, "unauthorized", requestId, cors.headers);
  }
  if (!isStrictJsonContentType(request.headers.get("content-type"))) {
    return errorResponse(400, "bad_request", requestId, cors.headers);
  }
  if (declaredBodyTooLarge(request.headers, MAX_BODY_BYTES)) {
    return errorResponse(413, "payload_too_large", requestId, cors.headers);
  }
  const idempotencyKey = readIdempotencyKey(request.headers);
  if (!idempotencyKey) {
    return errorResponse(400, "bad_request", requestId, cors.headers);
  }

  const supabaseUrl = env("SUPABASE_URL");
  const supabaseAnonKey = env("SUPABASE_ANON_KEY");
  const safetySalt = env("SAFETY_ID_SALT");
  const executorSecret = env("AI_EXECUTOR_SECRET");
  const apiKey = env("OPENAI_API_KEY");
  if (
    !supabaseUrl || !supabaseAnonKey || !apiKey || safetySalt.length < 32 ||
    !/^[0-9a-f]{64}$/.test(executorSecret)
  ) {
    logFailure(requestId, "server_configuration", 503);
    return errorResponse(503, "unavailable", requestId, cors.headers);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await supabase.auth.getUser(
    token,
  );
  if (userError || !userData.user) {
    return errorResponse(401, "unauthorized", requestId, cors.headers);
  }

  const bodyResult = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (!bodyResult.ok) {
    return errorResponse(
      bodyResult.reason === "too_large" ? 413 : 400,
      bodyResult.reason === "too_large" ? "payload_too_large" : "bad_request",
      requestId,
      cors.headers,
    );
  }

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(bodyResult.text);
  } catch {
    return errorResponse(400, "bad_request", requestId, cors.headers);
  }
  const validated = validateAssistantRequest(rawBody);
  if (!validated.ok) {
    return errorResponse(400, "bad_request", requestId, cors.headers);
  }

  let modelRequest: AssistantModelRequest;
  let structuredRedFlags: string[] = [];
  if (validated.value.kind === "pain_triage") {
    const { data, error } = await supabase
      .from("pain_reports")
      .select(
        "region, side, movement, timing, intensity, onset, detail, red_flags",
      )
      .eq("id", validated.value.pain_report_id)
      .eq("workspace_id", validated.value.workspace_id)
      .eq("student_user_id", validated.value.subject_student_id)
      .maybeSingle();
    if (error || !data) {
      return errorResponse(403, "forbidden", requestId, cors.headers);
    }
    const resolved = painReportToModelRequest(
      validated.value,
      data as Record<string, unknown>,
    );
    if (!resolved) {
      logFailure(requestId, "invalid_authoritative_report", 503);
      return errorResponse(503, "unavailable", requestId, cors.headers);
    }
    modelRequest = resolved.request;
    structuredRedFlags = resolved.structuredRedFlags;
  } else {
    modelRequest = {
      kind: validated.value.kind,
      locale: validated.value.locale,
      report: validated.value.report,
      context: validated.value.context,
    };
  }

  const canonicalModelInput = JSON.stringify(modelRequest);
  if (canonicalModelInput.length > 12_000) {
    return errorResponse(400, "bad_request", requestId, cors.headers);
  }

  const model = env("OPENAI_MODEL") || DEFAULT_MODEL;
  if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(model)) {
    logFailure(requestId, "server_configuration", 503);
    return errorResponse(503, "unavailable", requestId, cors.headers);
  }
  const reasoningValue = env("OPENAI_REASONING_EFFORT");
  const reasoningEffort: "low" | "medium" = reasoningValue === "medium"
    ? "medium"
    : "low";

  let inputDigest: string;
  let idempotencyKeyHash: string;
  let safetyIdentifier: string;
  try {
    [inputDigest, idempotencyKeyHash, safetyIdentifier] = await Promise.all([
      saltedSha256Hex(
        `audit-input:${validated.value.workspace_id}:${validated.value.subject_student_id}:${canonicalModelInput}`,
        safetySalt,
      ),
      saltedSha256Hex(
        `idempotency:${userData.user.id}:${validated.value.workspace_id}:${idempotencyKey}`,
        safetySalt,
      ),
      createSafetyIdentifier(userData.user.id, safetySalt),
    ]);
  } catch {
    logFailure(requestId, "server_configuration", 503);
    return errorResponse(503, "unavailable", requestId, cors.headers);
  }

  const { data: reservationData, error: reserveError } = await supabase.rpc(
    "reserve_ai_run",
    {
      p_executor_secret: executorSecret,
      p_request_id: requestId,
      p_workspace_id: validated.value.workspace_id,
      p_subject_user_id: validated.value.subject_student_id,
      p_kind: validated.value.kind,
      p_idempotency_key_hash: idempotencyKeyHash,
      p_input_digest: inputDigest,
      p_input_char_count: canonicalModelInput.length,
    },
  );
  if (reserveError) {
    if (reserveError.code === "P0001") {
      return errorResponse(429, "rate_limited", requestId, cors.headers);
    }
    if (reserveError.code === "22023") {
      return errorResponse(409, "conflict", requestId, cors.headers);
    }
    const serverFailure = reserveError.code === "55000";
    if (serverFailure) logFailure(requestId, "executor_attestation", 503);
    return errorResponse(
      serverFailure ? 503 : 403,
      serverFailure ? "unavailable" : "forbidden",
      requestId,
      cors.headers,
    );
  }
  const reservation = parseReservation(reservationData);
  if (!reservation) {
    logFailure(requestId, "invalid_reservation", 503);
    return errorResponse(503, "unavailable", requestId, cors.headers);
  }

  if (reservation.reused) {
    if (reservation.status === "processing") {
      return jsonResponse(
        202,
        {
          request_id: requestId,
          run_id: reservation.runId,
          state: "processing",
          reused: true,
        },
        requestId,
        cors.headers,
        { "Retry-After": "2" },
      );
    }
    if (reservation.status === "failed") {
      return errorResponse(503, "unavailable", requestId, cors.headers);
    }
    const existingProposal = await loadExistingProposal(supabase, reservation);
    if (
      !existingProposal || !reservation.proposalId ||
      !reservation.completionMode
    ) {
      logFailure(requestId, "reused_result_unavailable", 503);
      return errorResponse(503, "unavailable", requestId, cors.headers);
    }
    return jsonResponse(
      200,
      {
        request_id: requestId,
        run_id: reservation.runId,
        proposal_id: reservation.proposalId,
        completion_mode: reservation.completionMode,
        reused: true,
        proposal: existingProposal,
      },
      requestId,
      cors.headers,
    );
  }

  let proposal: AssistantProposal;
  let completionMode: "model" | "deterministic_safety";
  let usedModel: string;
  let providerRequestId: string | null = null;
  const evaluation = evaluateSafety(
    `${modelRequest.report}\n${JSON.stringify(modelRequest.context)}`,
    structuredRedFlags,
  );
  try {
    if (evaluation.emergencyFlags.length > 0) {
      proposal = buildEmergencyProposal(evaluation);
      completionMode = "deterministic_safety";
      usedModel = "elo-safety-v1";
    } else {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25_000);
      try {
        const result = await createModelProposal({
          apiKey,
          model,
          reasoningEffort,
          safetyIdentifier,
          request: modelRequest,
          signal: controller.signal,
        });
        proposal = result.proposal;
        providerRequestId = result.providerRequestId;
      } finally {
        clearTimeout(timeoutId);
      }
      completionMode = "model";
      usedModel = model;
    }
    proposal = enforceProposalBoundaries(proposal, modelRequest, evaluation);
    if (!validateAssistantProposal(proposal)) {
      throw new ProviderError("invalid_provider_output", providerRequestId);
    }
  } catch (error) {
    const failureCode: FailureCode = error instanceof ProviderError
      ? error.code
      : "internal_error";
    const failedProviderRequestId = error instanceof ProviderError
      ? error.providerRequestId
      : providerRequestId;
    await supabase.rpc("fail_ai_run", {
      p_executor_secret: executorSecret,
      p_run_id: reservation.runId,
      p_failure_code: failureCode,
      p_provider_request_id: failedProviderRequestId,
    });
    logFailure(requestId, failureCode, 503);
    return errorResponse(503, "unavailable", requestId, cors.headers);
  }

  const { data: proposalId, error: completionError } = await supabase.rpc(
    "complete_ai_run",
    {
      p_executor_secret: executorSecret,
      p_run_id: reservation.runId,
      p_model: usedModel,
      p_completion_mode: completionMode,
      p_proposal: proposal,
      p_provider_request_id: providerRequestId,
    },
  );
  if (
    completionError || typeof proposalId !== "string" ||
    !UUID_PATTERN.test(proposalId)
  ) {
    await supabase.rpc("fail_ai_run", {
      p_executor_secret: executorSecret,
      p_run_id: reservation.runId,
      p_failure_code: "persistence_failed",
      p_provider_request_id: providerRequestId,
    });
    logFailure(requestId, "persistence_failed", 503);
    return errorResponse(503, "unavailable", requestId, cors.headers);
  }

  return jsonResponse(
    200,
    {
      request_id: requestId,
      run_id: reservation.runId,
      proposal_id: proposalId,
      completion_mode: completionMode,
      reused: false,
      proposal,
    },
    requestId,
    cors.headers,
  );
}

Deno.serve(async (request: Request) => {
  const requestId = crypto.randomUUID();
  const cors = corsForRequest(request, env("ALLOWED_ORIGINS"));
  try {
    return await handleRequest(request, requestId, cors);
  } catch {
    logFailure(requestId, "unhandled", 500);
    return errorResponse(500, "unavailable", requestId, cors.headers);
  }
});
