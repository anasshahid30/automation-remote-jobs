import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const client = await createSupabaseServerClient();
    if (!client) return Response.json({ status: "not_configured" }, { status: 503 });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return Response.json({ status: "unauthorized" }, { status: 401 });
    const { data, error } = await client.rpc("database_health");
    if (error || data !== "ok") return Response.json({ status: "unavailable" }, { status: 503 });
    return Response.json({ status: "ok", component: "database" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ status: "unavailable" }, { status: 503 }); }
}
