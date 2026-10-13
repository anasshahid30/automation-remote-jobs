"use server";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mutationContext } from "@/lib/workspace/auth";
import { evidenceKinds, reviewSchema } from "@/lib/screening/schema";
import { evaluate } from "@/lib/screening/engine";
import { classifierConfig } from "@/lib/screening/ai-config";
import {
  createOpenAIClassifier,
  validateClassification,
} from "@/lib/screening/ai";
import { listText, uuid, type ActionState } from "@/lib/workspace/schemas";

function number(form: FormData, key: string) {
  const value = String(form.get(key) ?? "");
  return value.trim() ? Number(value) : null;
}
function refresh(id: string) {
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
  revalidatePath("/review");
  revalidatePath("/dashboard");
  revalidatePath("/applications");
}

export async function screenJob(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const id = uuid.safeParse(form.get("job_id"));
    if (!id.success) return { message: "Invalid listing." };
    const [
      { data: job, error: jobError },
      { data: profile, error: profileError },
      { data: masters, error: resumeError },
    ] = await Promise.all([
      client
        .from("jobs")
        .select("*")
        .eq("id", id.data)
        .eq("user_id", user.id)
        .maybeSingle(),
      client
        .from("candidate_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      client
        .from("resumes")
        .select("id,updated_at,skills")
        .eq("user_id", user.id)
        .eq("is_master", true)
        .order("id"),
    ]);
    if (jobError || profileError || resumeError || !job || !profile || !masters)
      return {
        message:
          "Save your candidate profile and reload this listing before screening.",
      };
    if (
      String(form.get("job_updated_at")) !== job.updated_at ||
      String(form.get("profile_updated_at")) !== profile.updated_at
    )
      return {
        message:
          "The listing or profile changed. Reload before screening again.",
      };
    const parsed = reviewSchema.safeParse({
      citations: evidenceKinds.flatMap((kind) => {
        const quote = String(form.get(`quote_${kind}`) ?? "").trim(),
          url = String(form.get(`url_${kind}`) ?? "").trim();
        return quote
          ? [{ kind, quote, url: url || job.original_url || job.canonical_url }]
          : [];
      }),
      source_checked: form.get("source_checked") === "yes",
      listing_checked: form.get("listing_checked") === "yes",
      qualifications: String(form.get("qualifications") ?? "unknown"),
      authorization: String(form.get("authorization") ?? "unknown"),
      authorization_note: String(form.get("authorization_note") ?? ""),
      required_skills: listText(String(form.get("required_skills") ?? "")),
      hours_per_week: number(form, "hours_per_week"),
      weeks_per_year: number(form, "weeks_per_year"),
      hours_note: String(form.get("hours_note") ?? ""),
      fx_rate: number(form, "fx_rate"),
      fx_date: String(form.get("fx_date") ?? ""),
      fx_url: String(form.get("fx_url") ?? ""),
      fx_note: String(form.get("fx_note") ?? ""),
    });
    if (!parsed.success)
      return {
        message:
          "Check evidence URLs/quotes, qualification and authorization review, and any hours/FX assumptions. Authorization marked verified needs an explanation.",
      };
    parsed.data.citations = parsed.data.citations.map((c) => ({
      ...c,
      url: new URL(c.url).toString(),
    }));
    let result;
    try {
      result = evaluate(
        job,
        profile,
        parsed.data,
        masters.flatMap((r) => r.skills),
      );
    } catch {
      return {
        message:
          "Every source quote and required skill must appear in the saved title/description. Check the quotes and scoring weights.",
      };
    }
    const { error } = await client.rpc("record_job_screening", {
      p_job_id: job.id,
      p_job_updated_at: job.updated_at,
      p_profile_updated_at: profile.updated_at,
      p_resume_snapshot: masters.map((r) => ({
        id: r.id,
        updated_at: r.updated_at,
      })),
      p_review: parsed.data,
      p_result: result,
    });
    if (error)
      return {
        message:
          error.code === "40001"
            ? "Screening inputs changed. Reload before trying again."
            : "The screening could not be saved. Check your source review and connection.",
      };
    refresh(job.id);
    return {
      ok: true,
      message: `Screening saved: ${result.decision.replaceAll("_", " ")} · match ${result.match_score}/100. No application was submitted.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Screening not saved. Check your connection or wait before trying again.",
    };
  }
}

export async function classifyJob(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext("classification");
    const id = uuid.safeParse(form.get("job_id"));
    if (!id.success || form.get("ai_consent") !== "yes")
      return {
        message:
          "Confirm that this public title and description may be sent to your configured AI provider.",
      };
    const config = classifierConfig();
    if (!config)
      return {
        message:
          "AI classification is disabled or unconfigured. Import, editing and deterministic screening still work.",
      };
    const { data: job, error } = await client
      .from("jobs")
      .select("id,job_title,description,updated_at")
      .eq("id", id.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !job || job.updated_at !== form.get("job_updated_at"))
      return {
        message:
          "This listing changed or is unavailable. Reload before classifying.",
      };
    const suggestion = await createOpenAIClassifier(config).classify(
      job.job_title,
      job.description,
    );
    const { error: saveError } = await client
      .from("job_classifications")
      .insert({
        user_id: user.id,
        job_id: job.id,
        job_updated_at: job.updated_at,
        provider: "openai",
        model: config.model,
        suggestion,
      });
    if (saveError)
      return {
        message:
          "Classification could not be saved. Your listing and eligibility are unchanged.",
      };
    refresh(job.id);
    return {
      ok: true,
      message:
        "AI suggestions saved for your review. They have not changed the listing or decided eligibility.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "AI classification failed or returned invalid evidence. Your listing and eligibility are unchanged. Use the manual review instead.",
    };
  }
}

export async function applyClassification(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const id = uuid.safeParse(form.get("job_id")),
      suggestionId = uuid.safeParse(form.get("classification_id"));
    if (
      !id.success ||
      !suggestionId.success ||
      form.get("confirm_classification") !== "yes"
    )
      return {
        message:
          "Verify the suggested fields against the source before copying them.",
      };
    const [
      { data: job, error: jobError },
      { data: suggestion, error: suggestionError },
    ] = await Promise.all([
      client
        .from("jobs")
        .select("*")
        .eq("id", id.data)
        .eq("user_id", user.id)
        .maybeSingle(),
      client
        .from("job_classifications")
        .select("*")
        .eq("id", suggestionId.data)
        .eq("job_id", id.data)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    if (
      jobError ||
      suggestionError ||
      !job ||
      !suggestion ||
      job.updated_at !== form.get("job_updated_at") ||
      job.updated_at !== suggestion.job_updated_at
    )
      return {
        message:
          "These inputs changed. Reload and request a fresh classification.",
      };
    const result = validateClassification(
      suggestion.suggestion,
      `${job.job_title}\n${job.description}`,
    );
    const { data, error } = await client
      .from("jobs")
      .update({
        role_category:
          result.role_category === "unknown"
            ? job.role_category
            : result.role_category,
        seniority:
          result.seniority === "unknown" ? job.seniority : result.seniority,
        employment_type:
          result.employment_type === "unknown"
            ? job.employment_type
            : result.employment_type,
      })
      .eq("id", job.id)
      .eq("user_id", user.id)
      .eq("updated_at", job.updated_at)
      .select("id")
      .maybeSingle();
    if (error || !data)
      return {
        message:
          "The listing changed or could not be saved. Reload before retrying.",
      };
    refresh(job.id);
    return {
      ok: true,
      message:
        "Reviewed classification fields copied. Re-run screening; geographic, salary and legal restrictions remain independently enforced.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message: "Suggestions were not applied. Review the source and retry.",
    };
  }
}

export async function saveDisposition(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const id = uuid.safeParse(form.get("job_id")),
      disposition = String(form.get("disposition"));
    if (
      !id.success ||
      !["saved", "shortlisted", "rejected"].includes(disposition)
    )
      return { message: "Invalid shortlist action." };
    const { data, error } = await client
      .from("jobs")
      .update({ disposition })
      .eq("id", id.data)
      .eq("user_id", user.id)
      .eq("updated_at", String(form.get("job_updated_at") ?? ""))
      .select("id")
      .maybeSingle();
    if (error || !data)
      return {
        message:
          "This listing changed or is unavailable. Reload before saving.",
      };
    refresh(id.data);
    return {
      ok: true,
      message:
        "Saved your search disposition. This does not approve eligibility or submit an application.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return { message: "Disposition not saved. Please retry later." };
  }
}
