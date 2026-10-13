"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mutationContext } from "@/lib/workspace/auth";
import { preparationSchema, generatePackage } from "@/lib/preparation/engine";
import { failure, uuid, type ActionState } from "@/lib/workspace/schemas";

export async function prepareApplication(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const id = uuid.parse(form.get("id")),
      requestId = uuid.parse(form.get("request_id"));
    const parsed = preparationSchema.safeParse({
      resume_id: form.get("resume_id"),
      job_excerpt: form.get("job_excerpt"),
      resume_excerpt: form.get("resume_excerpt"),
      questions: String(form.get("questions") ?? "")
        .split(/\r?\n/)
        .map((q) => q.trim())
        .filter(Boolean),
    });
    if (!parsed.success) return failure(parsed.error);
    const { data: existing } = await client
      .from("application_packages")
      .select("id")
      .eq("request_id", requestId)
      .eq("application_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) redirect(`/applications/${id}/packages/${existing.id}`);
    const [
      { data: app, error: appError },
      { data: profile, error: profileError },
      { data: resume, error: resumeError },
      { data: facts, error: factsError },
      { data: library, error: answerError },
      { data: answerSnapshot, error: snapshotError },
    ] = await Promise.all([
      client
        .from("applications")
        .select("*,jobs!inner(*)")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      client
        .from("candidate_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      client
        .from("resumes")
        .select("*")
        .eq("id", parsed.data.resume_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      client
        .from("resume_facts")
        .select("*")
        .eq("resume_id", parsed.data.resume_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      client.from("answer_library").select("*").eq("user_id", user.id),
      client.rpc("answer_version_snapshot"),
    ]);
    if (
      appError ||
      profileError ||
      resumeError ||
      factsError ||
      answerError ||
      snapshotError ||
      !app ||
      !profile ||
      !resume ||
      !facts?.verified_by_candidate ||
      !library ||
      !answerSnapshot
    )
      return {
        message:
          "Save your profile and verify the selected resume text before preparing a package.",
      };
    if (
      app.updated_at !== form.get("updated_at") ||
      app.jobs.updated_at !== form.get("job_updated_at") ||
      profile.updated_at !== form.get("profile_updated_at")
    )
      return {
        message:
          "Application, listing or profile changed. Reload before preparing.",
      };
    // Pair the answer bodies with the same revision read by the independent snapshot RPC.
    const expected = library
      .map((r) => ({ id: r.id, updated_at: r.updated_at }))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (JSON.stringify(expected) !== JSON.stringify(answerSnapshot))
      return { message: "Answer library changed. Reload before preparing." };
    if (form.get("facts_confirm") !== "yes")
      return {
        message:
          "Confirm the selected version and source excerpts before preparation.",
      };
    let content;
    try {
      content = generatePackage({
        company: app.jobs.company_name,
        title: app.jobs.job_title,
        profile,
        resume_version: resume.version_name,
        resume_text: facts.text_content,
        job_title: app.jobs.job_title,
        job_description: app.jobs.description,
        job_excerpt: parsed.data.job_excerpt,
        resume_excerpt: parsed.data.resume_excerpt,
        questions: parsed.data.questions,
        library,
        role_matches: resume.role_category === app.jobs.role_category,
      });
    } catch (error) {
      return {
        message:
          error instanceof Error
            ? error.message
            : "Source excerpts could not be validated.",
      };
    }
    const { data: packageId, error } = await client.rpc(
      "record_application_package",
      {
        p_application_id: id,
        p_resume_id: resume.id,
        p_request_id: requestId,
        p_application_updated_at: app.updated_at,
        p_job_updated_at: app.jobs.updated_at,
        p_profile_updated_at: profile.updated_at,
        p_facts_updated_at: facts.updated_at,
        p_answer_snapshot: answerSnapshot,
        p_content: content,
      },
    );
    if (error || !packageId)
      return {
        message:
          "Package not saved. Inputs may have changed; reload and try again.",
      };
    revalidatePath(`/applications/${id}`);
    redirect(`/applications/${id}/packages/${packageId}`);
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Preparation did not complete. Check your connection or request limit.",
    };
  }
}

export async function reviewPackage(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client } = await mutationContext();
    const id = uuid.parse(form.get("id")),
      packageId = uuid.parse(form.get("package_id"));
    if (
      form.get("review_confirm") !== "yes" ||
      form.get("sensitive_confirm") !== "yes"
    )
      return {
        message:
          "Review all document claims and every screening answer, including sensitive questions, before confirming.",
      };
    const { error } = await client.rpc("review_application_package", {
      p_package_id: packageId,
      p_application_updated_at: String(form.get("updated_at")),
    });
    if (error)
      return {
        message:
          "Package cannot be applied. Resolve unanswered questions, regenerate stale inputs, or reload the application record.",
      };
    revalidatePath(`/applications/${id}`);
    revalidatePath("/applications");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message:
        "Reviewed package applied to your record. Eligibility still controls the review status. No application was submitted.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return { message: "Package review not saved. Please try again later." };
  }
}
