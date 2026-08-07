import {
  declaredBodyTooLarge,
  isStrictJsonContentType,
  readBodyWithLimit,
  readIdempotencyKey,
} from "../_shared/assistant-http.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("http: media type is exact and idempotency keys are bounded", () => {
  assert(
    isStrictJsonContentType("application/json; charset=utf-8"),
    "valid JSON media type should pass",
  );
  assert(
    !isStrictJsonContentType("application/jsonp"),
    "lookalike media type must fail",
  );
  assert(
    !isStrictJsonContentType("application/json; charset=iso-8859-1"),
    "non-UTF-8 JSON must fail because the body decoder is UTF-8-only",
  );
  assert(
    !isStrictJsonContentType("application/json; boundary=smuggled"),
    "unexpected media-type parameters must fail",
  );

  const headers = new Headers({
    "Idempotency-Key": "pain-report:1234567890abcdef",
  });
  assert(
    readIdempotencyKey(headers) === "pain-report:1234567890abcdef",
    "valid key should pass",
  );
  assert(
    readIdempotencyKey(new Headers({ "Idempotency-Key": "short" })) === null,
    "short key must fail",
  );
});

Deno.test("http: declared and streamed body limits fail before unbounded buffering", async () => {
  assert(
    declaredBodyTooLarge(new Headers({ "Content-Length": "32769" }), 32_768),
    "large declaration must fail",
  );
  assert(
    declaredBodyTooLarge(
      new Headers({ "Content-Length": "not-a-number" }),
      32_768,
    ),
    "invalid declaration fails closed",
  );

  const request = new Request("http://local.test", {
    method: "POST",
    body: "x".repeat(128),
  });
  const result = await readBodyWithLimit(request, 64);
  assert(
    !result.ok && result.reason === "too_large",
    "chunked/actual bytes must be capped while reading",
  );
});

Deno.test("http: valid UTF-8 body is returned unchanged", async () => {
  const text = JSON.stringify({ mensagem: "olá" });
  const result = await readBodyWithLimit(
    new Request("http://local.test", { method: "POST", body: text }),
    1024,
  );
  assert(result.ok && result.text === text, "valid body should round-trip");
});
