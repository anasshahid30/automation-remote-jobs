import "server-only";
import type { UserClient } from "../workspace/data";
import { inspectDocument } from "../workspace/documents";
import { canonical, type SubmissionContext } from "./validation";

export async function loadSubmission(
  client: UserClient,
  userId: string,
  applicationId: string,
  packageId: string,
) {
  const { data: snapshot, error: snapshotError } = await client.rpc(
    "submission_snapshot",
    { p_application_id: applicationId, p_package_id: packageId },
  );
  if (snapshotError || !snapshot)
    throw new Error("Submission inputs unavailable.");
  const [
    { data: application, error: applicationError },
    { data: pack, error: packageError },
    { data: profile, error: profileError },
    { data: answers, error: answerError },
    { data: masters, error: mastersError },
    { data: reviews, error: reviewError },
    { data: runs, error: runsError },
  ] = await Promise.all([
    client
      .from("applications")
      .select("*")
      .eq("id", applicationId)
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("application_packages")
      .select("*")
      .eq("id", packageId)
      .eq("application_id", applicationId)
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("candidate_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    client.from("answer_library").select("*").eq("user_id", userId),
    client
      .from("resumes")
      .select("id,skills,updated_at")
      .eq("user_id", userId)
      .eq("is_master", true)
      .order("id"),
    client
      .from("package_reviews")
      .select("id")
      .eq("package_id", packageId)
      .eq("user_id", userId)
      .limit(1),
    client
      .from("submission_runs")
      .select("state")
      .eq("application_id", applicationId)
      .eq("user_id", userId)
      .eq("mode", "human_assisted")
      .in("state", ["handoff_ready", "uncertain", "candidate_reported"]),
  ]);
  if (
    applicationError ||
    packageError ||
    profileError ||
    answerError ||
    mastersError ||
    reviewError ||
    runsError ||
    snapshotError ||
    !application ||
    !pack ||
    !profile ||
    !answers ||
    !masters ||
    !reviews ||
    !runs ||
    !snapshot
  )
    throw new Error("Submission inputs unavailable.");
  const [
    { data: job, error: jobError },
    { data: resume, error: resumeError },
    { data: facts, error: factsError },
    { data: review, error: evidenceError },
    { data: screening, error: screenError },
  ] = await Promise.all([
    client
      .from("jobs")
      .select("*")
      .eq("id", application.job_id)
      .eq("user_id", userId)
      .single(),
    client
      .from("resumes")
      .select("*")
      .eq("id", pack.resume_id)
      .eq("user_id", userId)
      .single(),
    client
      .from("resume_facts")
      .select("*")
      .eq("resume_id", pack.resume_id)
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("job_reviews")
      .select("*")
      .eq("job_id", application.job_id)
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("job_screening_summary")
      .select("effective_decision,screening_stale")
      .eq("id", application.job_id)
      .eq("user_id", userId)
      .single(),
  ]);
  if (
    jobError ||
    resumeError ||
    factsError ||
    evidenceError ||
    screenError ||
    !job ||
    !resume ||
    !screening
  )
    throw new Error("Source facts unavailable.");
  let fileVerified = false;
  const { data: file, error: fileError } = await client.storage
    .from("resumes")
    .download(resume.storage_path);
  if (!fileError && file) {
    try {
      const inspected = inspectDocument(
        resume.original_filename ?? resume.storage_path,
        new Uint8Array(await file.arrayBuffer()),
      );
      fileVerified =
        inspected.sha256 === resume.sha256 &&
        inspected.file_size === resume.file_size &&
        inspected.mime_type === resume.mime_type;
    } catch {
      /* Missing or changed files cannot pass validation. */
    }
  }
  const context: SubmissionContext = {
    application,
    package: pack,
    profile,
    job,
    resume,
    facts,
    answers,
    masters,
    review,
    reviewed: reviews.length > 0,
    screening_current:
      screening.effective_decision === "ELIGIBLE" && !screening.screening_stale,
    file_verified: fileVerified,
    previous_handoff: runs.length > 0,
  };
  const { data: after, error: afterError } = await client.rpc(
    "submission_snapshot",
    { p_application_id: applicationId, p_package_id: packageId },
  );
  if (afterError || canonical(after) !== canonical(snapshot))
    throw new Error("Submission inputs changed during validation.");
  return { context, snapshot };
}
