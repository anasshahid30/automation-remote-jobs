import { describe, expect, it } from "vitest";
import { generatePackage } from "../preparation/engine";
import { validateSubmission, type SubmissionContext } from "./validation";
import { job, profile, review } from "./screening-fixture";
const timestamp = "2026-10-13T12:00:00.000Z",
  now = new Date("2026-10-13T14:00:00Z");
function fixture(): SubmissionContext {
  const candidate = {
    ...profile,
    full_name: "Synthetic Candidate",
    email: "fixture@example.test",
    city: "Karachi",
    phone: null,
    updated_at: timestamp,
  };
  const text =
    "Built Python APIs at Actual Employer in 2023.\nEducation and experience retained in full.";
  const content = generatePackage({
    company: "Synthetic Employer",
    title: job.job_title,
    profile: candidate,
    resume_version: "Master v1",
    resume_text: text,
    job_description: job.description,
    job_title: job.job_title,
    job_excerpt: "Python required",
    resume_excerpt: "Built Python APIs at Actual Employer in 2023.",
    questions: ["Full name?"],
    library: [],
    role_matches: true,
  });
  return {
    application: {
      id: "app",
      resume_id: "resume",
      cover_letter: content.cover_letter,
      answers: { package_id: "pack", questions: content.answers },
      status: "prepared",
      submission_method: "human_assisted",
      applied_at: null,
    },
    job: {
      ...job,
      id: "job",
      canonical_url: "https://example.test/job",
      company_name: "Synthetic Employer",
      updated_at: timestamp,
    },
    profile: candidate,
    package: {
      id: "pack",
      application_id: "app",
      resume_id: "resume",
      job_updated_at: timestamp,
      profile_updated_at: timestamp,
      facts_updated_at: timestamp,
      answer_snapshot: [],
      content,
    },
    resume: {
      id: "resume",
      version_name: "Master v1",
      role_category: "backend",
      sha256: "abc",
    },
    facts: {
      text_content: text,
      verified_by_candidate: true,
      updated_at: timestamp,
    },
    answers: [],
    masters: [{ id: "resume", skills: ["Python"], updated_at: timestamp }],
    review: { review, reviewed_at: timestamp },
    reviewed: true,
    screening_current: true,
    file_verified: true,
    previous_handoff: false,
  } as unknown as SubmissionContext;
}
describe("handoff validation from current facts", () => {
  it("passes a current reviewed factual package and produces a stable digest", () => {
    const c = fixture(),
      r = validateSubmission(c, now);
    expect(r.checks.filter((c) => !c.passed)).toEqual([]);
    expect(r.ready).toBe(true);
    expect(r.payload_digest).toHaveLength(64);
    expect(validateSubmission(c, now).payload_digest).toBe(r.payload_digest);
  });
  it.each<[string, (c: SubmissionContext) => void]>([
    [
      "changed listing",
      (c) => {
        c.job.updated_at = "2026-10-13T13:00:00Z";
      },
    ],
    [
      "changed profile",
      (c) => {
        c.profile.updated_at = "2026-10-13T13:00:00Z";
      },
    ],
    [
      "changed verified facts",
      (c) => {
        c.facts!.updated_at = "2026-10-13T13:00:00Z";
      },
    ],
    [
      "missing private file",
      (c) => {
        c.file_verified = false;
      },
    ],
    [
      "unverified source",
      (c) => {
        c.facts!.verified_by_candidate = false;
      },
    ],
    [
      "wrong role",
      (c) => {
        c.resume.role_category = "full_stack";
      },
    ],
    [
      "unreviewed package",
      (c) => {
        c.reviewed = false;
      },
    ],
    [
      "changed application letter",
      (c) => {
        c.application.cover_letter = "Unsupported experience";
      },
    ],
    [
      "changed application answers",
      (c) => {
        c.application.answers = {};
      },
    ],
    [
      "stale eligibility",
      (c) => {
        c.screening_current = false;
      },
    ],
    [
      "expired evidence",
      (c) => {
        c.review!.reviewed_at = "2026-10-01T12:00:00Z";
      },
    ],
    [
      "future evidence",
      (c) => {
        c.review!.reviewed_at = "2030-10-01T12:00:00Z";
      },
    ],
    [
      "country restriction despite claimed summary",
      (c) => {
        c.job.restricted_countries = ["Pakistan"];
      },
    ],
    [
      "closed listing",
      (c) => {
        c.job.listing_status = "closed";
      },
    ],
    [
      "prior or uncertain handoff",
      (c) => {
        c.previous_handoff = true;
      },
    ],
    [
      "actual previous submission",
      (c) => {
        c.application.applied_at = timestamp;
      },
    ],
    [
      "missing approval",
      (c) => {
        c.application.status = "draft";
      },
    ],
    [
      "unconfigured API route",
      (c) => {
        c.application.submission_method = "api";
      },
    ],
    [
      "invalid email",
      (c) => {
        c.profile.email = "invalid";
      },
    ],
    [
      "injected package claims",
      (c) => {
        const p = c.package.content as Record<string, unknown>;
        p.cover_letter = "I have an invented PhD.";
      },
    ],
  ])("blocks %s", (_, mutate) => {
    const c = fixture();
    mutate(c);
    const r = validateSubmission(c, now);
    expect(r.ready).toBe(false);
    expect(r.payload_digest).toBeNull();
  });
});
