export type CorsDecision = {
  allowed: boolean;
  headers: Record<string, string>;
};

export function corsForRequest(
  request: Request,
  configuredOrigins: string | undefined,
): CorsDecision {
  const origin = request.headers.get("origin");
  if (!origin) return { allowed: true, headers: { Vary: "Origin" } };

  const allowedOrigins = (configuredOrigins ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowedOrigins.includes(origin)) {
    return { allowed: false, headers: { Vary: "Origin" } };
  }

  return {
    allowed: true,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, idempotency-key, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  };
}
