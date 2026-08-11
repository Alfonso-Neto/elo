import { readSupabasePublishableKey } from "./supabase-key.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

const validKey = `sb_publishable_${"a".repeat(24)}`;

Deno.test("uses the default named publishable key in hosted Edge Functions", () => {
  const values: Record<string, string> = {
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: validKey }),
  };
  assertEquals(readSupabasePublishableKey((name) => values[name]), validKey);
});

Deno.test("supports the documented single publishable key in local development", () => {
  const values: Record<string, string> = { SUPABASE_PUBLISHABLE_KEY: validKey };
  assertEquals(readSupabasePublishableKey((name) => values[name]), validKey);
});

Deno.test("fails closed for malformed, missing, legacy, or secret keys", () => {
  const invalidEnvironments: Array<Record<string, string>> = [
    {},
    { SUPABASE_PUBLISHABLE_KEYS: "not-json" },
    { SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ secondary: validKey }) },
    {
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
        default: "sb_secret_not_allowed_here_123456",
      }),
    },
    { SUPABASE_PUBLISHABLE_KEY: "legacy-anon-jwt" },
  ];
  for (const values of invalidEnvironments) {
    assertEquals(readSupabasePublishableKey((name) => values[name]), "");
  }
});
