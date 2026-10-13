"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mutationContext } from "@/lib/workspace/auth";
import { toDatabaseTime } from "@/lib/workspace/data";
import { uuid, type ActionState } from "@/lib/workspace/schemas";
import { loadSubmission } from "@/lib/submission/load";
import { validateSubmission } from "@/lib/submission/validation";
import { humanAssistedAdapter } from "@/lib/submission/adapters";

export async function checkSubmission(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const id = uuid.parse(form.get("id")),
      packageId = uuid.parse(form.get("package_id")),
      requestId = uuid.parse(form.get("request_id"));
    const mode = z.enum(["dry_run", "human_assisted"]).parse(form.get("mode"));
    if (mode === "human_assisted" && form.get("handoff_confirm") !== "yes")
      return {
        message:
          "Confirm that you will complete the official form and check its remaining questions yourself.",
      };
    const { data: existing, error: existingError } = await client
      .from("submission_runs")
      .select("id,application_id,package_id,mode")
      .eq("request_id", requestId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingError)
      return { message: "Existing attempt could not be checked." };
    if (existing) {
      if (
        existing.application_id !== id ||
        existing.package_id !== packageId ||
        existing.mode !== mode
      )
        return {
          message: "Request identity changed. Reload before trying again.",
        };
      redirect(`/applications/${id}/submission?run=${existing.id}`);
    }
    const { context, snapshot } = await loadSubmission(
      client,
      user.id,
      id,
      packageId,
    );
    if (context.application.updated_at !== String(form.get("updated_at")))
      return {
        message:
          "The application changed. Reload and validate the current record.",
      };
    const report = validateSubmission(context);
    const errors = humanAssistedAdapter.validate_application({
      applicationId: id,
      jobId: context.job.id,
      packageId,
      sourceUrl: context.job.canonical_url,
      digest: report.payload_digest ?? "",
    });
    if (errors.length) return { message: errors[0] };
    if (mode === "human_assisted" && !report.ready)
      return {
        message:
          "Handoff blocked. Run a dry check and resolve every failed item; an open or uncertain handoff must be resolved first.",
      };
    const { data: runId, error } = await client.rpc("record_submission_run", {
      p_application_id: id,
      p_package_id: packageId,
      p_request_id: requestId,
      p_mode: mode,
      p_snapshot: snapshot,
      p_report: report,
    });
    if (error || !runId)
      return {
        message:
          "Run not saved. Check global/source pause controls and current eligibility, or reload changed inputs.",
      };
    revalidatePath(`/applications/${id}`);
    revalidatePath(`/applications/${id}/submission`);
    redirect(`/applications/${id}/submission?run=${runId}`);
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Submission check did not complete. Reload changed inputs or check your connection and request limit.",
    };
  }
}

export async function setSubmissionPause(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const scope = z
      .string()
      .regex(/^(global|source:[a-z][a-z0-9_]{0,40})$/)
      .parse(form.get("scope"));
    const paused = z.enum(["yes", "no"]).parse(form.get("paused")) === "yes";
    const { error } = await client
      .from("submission_controls")
      .upsert(
        { user_id: user.id, scope, paused },
        { onConflict: "user_id,scope" },
      );
    if (error) return { message: "Pause setting not saved." };
    revalidatePath("/applications", "layout");
    return {
      ok: true,
      message: paused
        ? "New handoffs paused. You can still record the actual outcome of an existing handoff."
        : "Human-assisted handoffs enabled for this scope. No API submission route is configured.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Pause setting not saved. Check your connection or request limit.",
    };
  }
}

export async function finishHandoff(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client } = await mutationContext();
    const id = uuid.parse(form.get("id")),
      runId = uuid.parse(form.get("run_id"));
    const outcome = z
      .enum(["uncertain", "candidate_reported", "cancelled"])
      .parse(form.get("outcome"));
    const note = z.string().trim().min(3).max(3000).parse(form.get("note"));
    if (form.get("outcome_confirm") !== "yes")
      return {
        message:
          "Confirm that the selected outcome accurately describes what happened on the employer’s form.",
      };
    const appliedAt =
      outcome === "candidate_reported"
        ? await toDatabaseTime(client, String(form.get("applied_at") ?? ""))
        : null;
    const { error } = await client.rpc("finish_submission_handoff", {
      p_run_id: runId,
      p_outcome: outcome,
      p_note: note,
      p_applied_at: appliedAt ?? undefined,
    });
    if (error)
      return {
        message:
          "Outcome not saved. Check the actual time and receipt, or reload an outcome already recorded in another tab.",
      };
    revalidatePath(`/applications/${id}/submission`);
    revalidatePath(`/applications/${id}`);
    revalidatePath("/applications");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message:
        outcome === "candidate_reported"
          ? "Actual manual submission recorded as candidate-reported confirmation."
          : outcome === "uncertain"
            ? "Outcome marked uncertain. A second handoff is blocked until you verify what happened."
            : "Handoff cancelled after your confirmation that no application was submitted.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message: "Outcome not saved. Enter the actual outcome and try again.",
    };
  }
}
