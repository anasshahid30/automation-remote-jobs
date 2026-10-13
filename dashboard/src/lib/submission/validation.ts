import { createHash } from "node:crypto";
import { z } from "zod";
import type { Tables } from "../../types/database";
import { evaluate } from "../screening/engine";
import { reviewSchema } from "../screening/schema";
import { generatePackage, packageSchema } from "../preparation/engine";

export const reportSchema = z.object({
  version: z.literal("phase5.1"),
  ready: z.boolean(),
  evaluated_at: z.iso.datetime(),
  decision: z.enum(["ELIGIBLE", "INELIGIBLE", "NEEDS_REVIEW"]),
  checks: z
    .array(
      z.object({ name: z.string(), passed: z.boolean(), detail: z.string() }),
    )
    .max(20),
  payload_digest: z.string().nullable(),
});
export type ValidationReport = z.infer<typeof reportSchema>;
export type SubmissionContext = {
  application: Tables<"applications">;
  job: Tables<"jobs">;
  profile: Tables<"candidate_profiles">;
  package: Tables<"application_packages">;
  resume: Tables<"resumes">;
  facts: Tables<"resume_facts"> | null;
  answers: Tables<"answer_library">[];
  masters: Pick<Tables<"resumes">, "id" | "skills" | "updated_at">[];
  review: Tables<"job_reviews"> | null;
  reviewed: boolean;
  screening_current: boolean;
  file_verified: boolean;
  previous_handoff: boolean;
};
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function fingerprint(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function validateSubmission(
  context: SubmissionContext,
  now = new Date(),
): ValidationReport {
  const c = context,
    checks: ValidationReport["checks"] = [];
  const check = (name: string, passed: boolean, detail: string) =>
    checks.push({ name, passed, detail });
  const pack = packageSchema.safeParse(c.package.content);
  check(
    "Package format",
    pack.success,
    "Use a supported private package generated from your verified source text.",
  );
  const versions = c.answers
    .map((a) => ({ id: a.id, updated_at: a.updated_at }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const fresh =
    c.package.application_id === c.application.id &&
    c.package.resume_id === c.resume.id &&
    c.package.job_updated_at === c.job.updated_at &&
    c.package.profile_updated_at === c.profile.updated_at &&
    c.package.facts_updated_at === c.facts?.updated_at &&
    canonical(c.package.answer_snapshot) === canonical(versions);
  check(
    "Current source versions",
    fresh,
    "Changes to profile, listing, transcript or verified answers require a new package.",
  );
  check(
    "Verified resume file",
    !!c.facts?.verified_by_candidate && c.file_verified,
    "The selected private file must exist, match its recorded checksum and have verified text.",
  );
  check(
    "Correct role resume",
    c.resume.role_category === c.job.role_category,
    "Select the resume version matching this job’s role.",
  );
  let grounded = false;
  if (pack.success && c.facts?.verified_by_candidate) {
    try {
      const expected = generatePackage({
        company: c.job.company_name,
        title: c.job.job_title,
        profile: c.profile,
        resume_version: c.resume.version_name,
        resume_text: c.facts.text_content,
        job_description: c.job.description,
        job_title: c.job.job_title,
        job_excerpt: pack.data.job_excerpt,
        resume_excerpt: pack.data.resume_excerpt,
        questions: pack.data.answers.map((a) => a.question),
        library: c.answers,
        role_matches: c.resume.role_category === c.job.role_category,
      });
      grounded = canonical(expected) === canonical(pack.data);
    } catch {
      /* Source mismatch is a validation failure, never a generated replacement claim. */
    }
  }
  check(
    "Factual documents and answers",
    grounded,
    "Documents and answer provenance must exactly match regeneration from the current verified facts.",
  );
  const applied =
    pack.success &&
    c.application.resume_id === c.resume.id &&
    c.application.cover_letter === pack.data.cover_letter &&
    canonical(c.application.answers) ===
      canonical({ package_id: c.package.id, questions: pack.data.answers });
  check(
    "Reviewed package applied",
    c.reviewed && applied,
    "Review this version and apply its exact resume, cover letter and answers to the application record.",
  );
  check(
    "Every supplied question answered",
    pack.success && pack.data.answers.every((a) => !!a.answer?.trim()),
    "Resolve every supplied question and review all employer-specific declarations; check the official form for additional fields.",
  );
  let decision: ValidationReport["decision"] = "NEEDS_REVIEW";
  const review = reviewSchema.safeParse(c.review?.review);
  const reviewTime = c.review ? new Date(c.review.reviewed_at).valueOf() : NaN;
  const recent =
    Number.isFinite(reviewTime) &&
    reviewTime <= now.valueOf() &&
    now.valueOf() - reviewTime <= 7 * 86400000;
  if (review.success && recent) {
    try {
      decision = reportSchema.shape.decision.parse(
        evaluate(
          c.job,
          c.profile,
          review.data,
          c.masters.flatMap((r) => r.skills),
          now,
        ).decision,
      );
    } catch {
      /* Invalid evidence cannot authorize a handoff. */
    }
  }
  check(
    "Eligibility re-evaluated",
    decision === "ELIGIBLE" && recent && c.screening_current,
    "Recheck source evidence: current remote, geography, compensation and qualification rules must all pass.",
  );
  check(
    "No previous submission",
    !c.application.applied_at &&
      !c.previous_handoff &&
      ["approved", "prepared"].includes(c.application.status),
    "A prior, open or uncertain handoff blocks a duplicate. Resolve it before trying again.",
  );
  check(
    "Human-assisted route",
    c.application.submission_method === "human_assisted",
    "Only the candidate-operated official form is configured for this workspace.",
  );
  const email = z.email().safeParse(c.profile.email);
  check(
    "Candidate contact details",
    !!c.profile.full_name.trim() && email.success,
    "Use your real name and a valid candidate email address.",
  );
  const ready = checks.every((c) => c.passed);
  return reportSchema.parse({
    version: "phase5.1",
    ready,
    evaluated_at: now.toISOString(),
    decision,
    checks,
    payload_digest: ready
      ? fingerprint({
          application: c.application.id,
          package: c.package.id,
          source: c.job.canonical_url,
          profile: c.profile.updated_at,
          resume: c.resume.sha256,
          content: pack.success ? pack.data : null,
        })
      : null,
  });
}
