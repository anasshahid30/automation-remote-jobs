export type SupabaseConfig = { url: string; key: string };

// Kept separate from the server-only client so validation can be unit tested.
export function readSupabaseConfig(env: Record<string, string | undefined>): SupabaseConfig | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Invalid Supabase URL configuration."); }
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:"))) {
    throw new Error("Supabase must use HTTPS, except for local development.");
  }
  // Only publishable keys or legacy anon keys are accepted. No admin client exists.
  if (!key.startsWith("sb_publishable_")) {
    let role: unknown;
    try { role = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString()).role; }
    catch { throw new Error("Use a Supabase publishable or legacy anon key."); }
    if (role !== "anon") throw new Error("Privileged Supabase keys are forbidden in the dashboard.");
  }
  return { url: parsed.origin, key };
}
