type EnvironmentReader = (name: string) => string | undefined;

const isPublishableKey = (value: unknown): value is string =>
  typeof value === "string" &&
  /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value);

export function readSupabasePublishableKey(
  readEnvironment: EnvironmentReader,
): string {
  const namedKeys = readEnvironment("SUPABASE_PUBLISHABLE_KEYS")?.trim() ?? "";
  if (namedKeys) {
    try {
      const parsed: unknown = JSON.parse(namedKeys);
      if (
        parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
        isPublishableKey((parsed as Record<string, unknown>).default)
      ) {
        return (parsed as Record<string, string>).default;
      }
    } catch {
      return "";
    }
    return "";
  }

  const localKey = readEnvironment("SUPABASE_PUBLISHABLE_KEY")?.trim() ?? "";
  return isPublishableKey(localKey) ? localKey : "";
}
