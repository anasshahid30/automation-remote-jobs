import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/workspace/schemas";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const client = await createSupabaseServerClient();
    if (!client) return new Response("Not configured", { status: 503 });
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user)
      return new Response("Unauthorized", { status: 401 });
    const { id } = await params;
    if (!uuid.safeParse(id).success)
      return new Response("Not found", { status: 404 });
    const { data: resume, error } = await client
      .from("resumes")
      .select("storage_path,original_filename,mime_type")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !resume) return new Response("Not found", { status: 404 });
    const preview =
      resume.mime_type === "application/pdf" &&
      new URL(request.url).searchParams.get("download") !== "1";
    const { data, error: signError } = await client.storage
      .from("resumes")
      .createSignedUrl(
        resume.storage_path,
        60,
        preview
          ? undefined
          : { download: resume.original_filename ?? "resume" },
      );
    if (signError || !data)
      return new Response("File unavailable", { status: 503 });
    return new Response(null, {
      status: 302,
      headers: {
        Location: data.signedUrl,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return new Response("File unavailable", { status: 503 });
  }
}
