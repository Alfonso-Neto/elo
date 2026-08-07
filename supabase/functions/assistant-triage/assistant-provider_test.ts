import { createModelProposal, ProviderError } from "./openai.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const options = {
  apiKey: "test-key",
  model: "test-model",
  reasoningEffort: "low" as const,
  safetyIdentifier: "safety-test",
  request: {
    kind: "pain_triage" as const,
    locale: "pt-BR" as const,
    report: "relato mínimo",
    context: {},
  },
  signal: new AbortController().signal,
};

async function captureProviderError(response: Response) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(response)) as typeof fetch;
  try {
    await createModelProposal(options);
  } catch (error) {
    assert(
      error instanceof ProviderError,
      "must expose only a typed provider outcome",
    );
    return error;
  } finally {
    globalThis.fetch = originalFetch;
  }
  throw new Error("provider response should have failed");
}

Deno.test("provider: HTTP outcomes remain distinguishable without response-body leakage", async () => {
  const cases = [
    [408, "provider_timeout"],
    [504, "provider_timeout"],
    [429, "provider_rate_limited"],
    [401, "provider_authentication"],
    [400, "provider_bad_request"],
    [500, "provider_unavailable"],
  ] as const;

  for (const [status, expectedCode] of cases) {
    const error = await captureProviderError(
      new Response("sensitive upstream detail", {
        status,
        headers: { "x-request-id": "req_provider-test" },
      }),
    );
    assert(
      error.code === expectedCode,
      `${status} must map to ${expectedCode}`,
    );
    assert(
      error.providerRequestId === "req_provider-test",
      "safe provider request id should be retained for audit",
    );
    assert(
      !error.message.includes("sensitive upstream detail"),
      "provider response body must not enter the error",
    );
  }
});

Deno.test("provider: incomplete and refusal outcomes fail closed", async () => {
  const incomplete = await captureProviderError(
    Response.json({ status: "incomplete" }),
  );
  assert(
    incomplete.code === "provider_incomplete",
    "incomplete generation must be explicit",
  );

  const refusal = await captureProviderError(
    Response.json({
      status: "completed",
      output: [{ content: [{ type: "refusal", refusal: "declined" }] }],
    }),
  );
  assert(refusal.code === "provider_refusal", "refusal must be explicit");
});
