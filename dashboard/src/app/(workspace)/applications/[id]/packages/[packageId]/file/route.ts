import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/workspace/schemas";
import { packageSchema } from "@/lib/preparation/engine";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; packageId: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  try {
    const client = await createSupabaseServerClient();
    if (!client) return new Response("Unavailable", { status: 503, headers });
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user)
      return new Response("Unauthorized", { status: 401, headers });
    const { id, packageId } = await params;
    if (!uuid.safeParse(id).success || !uuid.safeParse(packageId).success)
      return new Response("Not found", { status: 404, headers });
    const kind = new URL(request.url).searchParams.get("kind") ?? "resume";
    if (!["resume", "cover-letter", "answers"].includes(kind))
      return new Response("Unknown document", { status: 400, headers });
    const { data: pack, error } = await client
      .from("application_packages")
      .select("content,created_at")
      .eq("id", packageId)
      .eq("application_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !pack)
      return new Response("Not found", { status: 404, headers });
    const parsed = packageSchema.safeParse(pack.content);
    if (!parsed.success)
      return new Response("Unsupported document", { status: 422, headers });
    const p = parsed.data;
    const text =
      kind === "resume"
        ? p.resume_text
        : kind === "cover-letter"
          ? p.cover_letter
          : p.answers
              .map(
                (a) =>
                  `${a.question}\n${a.answer ?? "UNANSWERED — candidate input required"}\n${a.requires_review ? "Review required" : "Verified routine answer"}\nSource: ${a.source.startsWith("Verified answer ") ? "Candidate-verified answer library" : a.source}`,
              )
              .join("\n\n");
    const slug =
      p.company.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 60) || "application";
    return new Response(text, {
      headers: {
        ...headers,
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-${id.slice(0, 8)}-${packageId}-${kind}.txt"`,
      },
    });
  } catch {
    return new Response("Document unavailable", { status: 503, headers });
  }
}
