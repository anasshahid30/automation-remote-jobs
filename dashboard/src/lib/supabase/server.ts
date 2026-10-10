import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readSupabaseConfig } from "./config";
import type { Database } from "@/types/database";

export async function createSupabaseServerClient() {
  const config = readSupabaseConfig(process.env);
  if (!config) return null;
  const store = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && config.url.startsWith("https:") },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try { for (const { name, value, options } of items) store.set(name, value, options); }
        catch { /* Server components cannot write cookies; proxy refreshes them. */ }
      },
    },
  });
}
