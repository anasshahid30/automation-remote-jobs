"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { mutationContext } from "@/lib/workspace/auth";
import { inspectDocument, MAX_RESUME_SIZE } from "@/lib/workspace/documents";
import {
  failure,
  listText,
  resumeSchema,
  uuid,
  values,
  type ActionState,
} from "@/lib/workspace/schemas";

export async function uploadResume(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext("upload");
    const parsed = resumeSchema.safeParse({
      ...values(form, ["role_category", "version_name", "experience_summary"]),
      skills: listText(String(form.get("skills") ?? "")),
    });
    if (!parsed.success) return failure(parsed.error);
    const { data: profile, error: profileError } = await client
      .from("candidate_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError || !profile)
      return {
        message:
          "Save your candidate profile in Settings before uploading a resume.",
      };
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_RESUME_SIZE)
      return { message: "Choose a resume file between 1 byte and 10 MiB." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    let document;
    try {
      document = inspectDocument(file.name, bytes);
    } catch {
      return {
        message:
          "The resume file is invalid. Choose a PDF, UTF-8 text file, or DOCX up to 10 MiB.",
      };
    }
    const id = randomUUID(),
      path = `${user.id}/${id}.${document.extension}`;
    const { error: storageError } = await client.storage
      .from("resumes")
      .upload(path, bytes, { contentType: document.mime_type, upsert: false });
    if (storageError)
      return {
        message:
          "The private upload failed. Please check your connection and try again.",
      };
    const { extension: _extension, ...metadata } = document;
    void _extension;
    const { error: insertError } = await client
      .from("resumes")
      .insert({
        id,
        user_id: user.id,
        profile_id: profile.id,
        storage_path: path,
        ...parsed.data,
        ...metadata,
        is_master: false,
      });
    if (insertError) {
      const { error: cleanupError } = await client.storage
        .from("resumes")
        .remove([path]);
      return {
        message: cleanupError
          ? "Metadata was not saved. The private upload may remain orphaned; retry with a unique version name and check Storage privately."
          : insertError.code === "23505"
            ? "That version name already exists for this role. Use a new version name."
            : "Resume metadata could not be saved. The new upload was removed.",
      };
    }
    revalidatePath("/resumes");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message:
        "Private resume version uploaded. Choose ‘Use as master’ to select it for this role.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Upload not completed. Check your connection or wait before trying again. No master document is overwritten.",
    };
  }
}

export async function selectMaster(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client } = await mutationContext();
    const parsed = uuid.safeParse(form.get("resume_id"));
    if (!parsed.success) return { message: "Invalid resume selection." };
    const { error } = await client.rpc("select_resume_master", {
      p_resume_id: parsed.data,
    });
    if (error)
      return {
        message: "The master resume could not be changed. Please try again.",
      };
    revalidatePath("/resumes");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message:
        "Master selection updated. Previous files and application resume versions are preserved.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return { message: "Master selection not saved. Please try again later." };
  }
}
