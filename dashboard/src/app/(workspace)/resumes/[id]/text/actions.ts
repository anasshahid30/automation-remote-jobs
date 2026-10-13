"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { mutationContext } from "@/lib/workspace/auth";
import { extractResumeText } from "@/lib/preparation/extraction";
import { uuid, type ActionState } from "@/lib/workspace/schemas";

export async function saveResumeText(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const id = uuid.parse(form.get("resume_id"));
    const { data: resume, error } = await client
      .from("resumes")
      .select("storage_path,original_filename")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !resume) return { message: "Resume unavailable." };
    const { data: existing, error: lookupError } = await client
      .from("resume_facts")
      .select("updated_at")
      .eq("resume_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (
      lookupError ||
      (existing?.updated_at ?? "") !== String(form.get("updated_at") ?? "")
    )
      return { message: "Resume text changed. Reload before editing." };
    const extracting = form.get("mode") === "extract";
    let text: string;
    if (extracting) {
      if (existing && form.get("replace_confirm") !== "yes")
        return {
          message:
            "Confirm replacing the current transcript before extracting again.",
        };
      const { data, error: downloadError } = await client.storage
        .from("resumes")
        .download(resume.storage_path);
      if (downloadError || !data)
        return { message: "Private source file could not be retrieved." };
      text = await extractResumeText(
        resume.original_filename ?? resume.storage_path,
        new Uint8Array(await data.arrayBuffer()),
      );
    } else {
      const parsed = z
        .string()
        .trim()
        .min(1)
        .max(60000)
        .safeParse(form.get("text_content"));
      if (!parsed.success || form.get("verified") !== "yes")
        return {
          message: "Provide resume text and confirm every claim is accurate.",
        };
      text = parsed.data;
    }
    const row = {
      resume_id: id,
      user_id: user.id,
      text_content: text,
      verified_by_candidate: !extracting,
      verified_at: extracting ? null : new Date().toISOString(),
    };
    const result = existing
      ? await client
          .from("resume_facts")
          .update(row)
          .eq("resume_id", id)
          .eq("user_id", user.id)
          .eq("updated_at", existing.updated_at)
          .select("resume_id")
      : await client.from("resume_facts").insert(row).select("resume_id");
    if (result.error || !result.data?.length)
      return {
        message:
          "Text was not saved. Another edit may have changed it; reload.",
      };
    revalidatePath(`/resumes/${id}/text`);
    revalidatePath("/applications", "layout");
    return {
      ok: true,
      message: extracting
        ? "Text extracted as an unverified draft. Reload, compare it with the original file, then verify it below."
        : "Resume text verified. Existing master files are preserved.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Text not saved. Extraction may be unsupported, empty (scanned PDF), or exceed the size limit. Paste and verify a transcript instead.",
    };
  }
}
