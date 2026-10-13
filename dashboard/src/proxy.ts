import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabaseConfig } from "./lib/supabase/config";

export async function proxy(request: NextRequest) {
  const config = readSupabaseConfig(process.env);
  let response = NextResponse.next({ request });
  if (!config) return response;
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && config.url.startsWith("https:") },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });
  // Refresh tokens using verified identity. Actual authorization happens in each handler/page.
  try { await supabase.auth.getUser(); }
  catch { /* Handlers verify identity and fail closed if Auth is unavailable. */ }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/dashboard/:path*", "/jobs/:path*", "/review/:path*", "/applications/:path*", "/resumes/:path*", "/answers/:path*", "/settings/:path*", "/login", "/api/health/database"] };
