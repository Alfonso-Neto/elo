const encoder = new TextEncoder();

export async function saltedSha256Hex(value: string, salt: string): Promise<string> {
  if (salt.length < 16) throw new Error("salt_not_configured");
  const payload = encoder.encode(`${salt.length}:${salt}:${value.length}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSafetyIdentifier(userId: string, salt: string): Promise<string> {
  const digest = await saltedSha256Hex(`safety-identifier:${userId}`, salt);
  return `elo_${digest.slice(0, 40)}`;
}
