export type BodyReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "read_failed" };

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

export function isStrictJsonContentType(value: string | null) {
  if (!value) return false;
  const parts = value.split(";").map((part) => part.trim());
  if (parts[0]?.toLowerCase() !== "application/json") return false;
  if (parts.length === 1) return true;
  return parts.length === 2 &&
    /^charset\s*=\s*(?:utf-8|"utf-8")$/i.test(parts[1]);
}

export function readIdempotencyKey(headers: Headers) {
  const value = headers.get("idempotency-key")?.trim() ?? "";
  return IDEMPOTENCY_PATTERN.test(value) ? value : null;
}

export function declaredBodyTooLarge(headers: Headers, maximumBytes: number) {
  const value = headers.get("content-length");
  if (value === null) return false;
  if (!/^\d+$/.test(value.trim())) return true;
  return Number(value) > maximumBytes;
}

export async function readBodyWithLimit(
  request: Request,
  maximumBytes: number,
): Promise<BodyReadResult> {
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("request body exceeds configured limit");
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "read_failed" };
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(joined),
    };
  } catch {
    return { ok: false, reason: "read_failed" };
  }
}
