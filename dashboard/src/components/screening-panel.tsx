import Link from "next/link";
import { z } from "zod";
import { requireUser } from "@/lib/workspace/auth";
import { formatDate } from "@/lib/workspace/format";
import {
  evidenceKinds,
  reviewSchema,
  classificationSchema,
} from "@/lib/screening/schema";
import { classifierConfig } from "@/lib/screening/ai-config";
import type { Tables } from "@/types/database";
import { FormPanel } from "./form-panel";
import { Field, SelectField, TextArea, TextField } from "./fields";
import {
  applyClassification,
  classifyJob,
  saveDisposition,
  screenJob,
} from "@/app/(workspace)/jobs/screening-actions";

const labels = {
  remote: "Fully remote / office attendance",
  country: "Country and international arrangement",
  salary: "Published compensation",
  employment: "Employment arrangement",
  seniority: "Seniority",
  role: "Role relevance",
  region: "Employer region",
  skills: "Mandatory skills",
  authorization: "Residency / authorization / sponsorship",
};
export async function ScreeningPanel({
  job,
  profile,
}: {
  job: Tables<"jobs">;
  profile: Tables<"candidate_profiles"> | null;
}) {
  const { client, user } = await requireUser();
  const [
    { data: checks, error: checkError },
    { data: saved, error: reviewError },
    { data: summary, error: summaryError },
    { data: ai, error: aiError },
    { data: duplicates, error: duplicateError },
  ] = await Promise.all([
    client
      .from("eligibility_checks")
      .select("*")
      .eq("user_id", user.id)
      .eq("job_id", job.id)
      .order("checked_at", { ascending: false })
      .limit(5),
    client
      .from("job_reviews")
      .select("review")
      .eq("user_id", user.id)
      .eq("job_id", job.id)
      .maybeSingle(),
    client
      .from("job_screening_summary")
      .select("effective_decision,screening_stale")
      .eq("id", job.id)
      .eq("user_id", user.id)
      .single(),
    client
      .from("job_classifications")
      .select("*")
      .eq("user_id", user.id)
      .eq("job_id", job.id)
      .eq("job_updated_at", job.updated_at)
      .order("created_at", { ascending: false })
      .limit(1),
    client
      .from("jobs")
      .select("id,job_title,canonical_url")
      .eq("user_id", user.id)
      .eq("duplicate_key", job.duplicate_key ?? "__missing__")
      .neq("id", job.id)
      .limit(10),
  ]);
  if (checkError || reviewError || summaryError || aiError || duplicateError)
    throw new Error("Screening evidence could not be loaded.");
  const parsed = reviewSchema.safeParse(saved?.review),
    review = parsed.success ? parsed.data : null;
  const latest = checks[0],
    aiRow = ai[0],
    suggestion = classificationSchema.safeParse(aiRow?.suggestion);
  const factors = z
    .object({
      checks: z.record(z.string(), z.enum(["pass", "fail", "unknown"])),
      weights: z.record(z.string(), z.number()),
      components: z.record(z.string(), z.number()),
      monthly_min: z.number().nullable(),
      currency: z.string(),
      valid_until: z.string().optional(),
    })
    .safeParse(latest?.factors);
  const expired =
    job.listing_status === "closed" ||
    job.listing_status === "expired" ||
    Boolean(job.expires_at && new Date(job.expires_at) <= new Date());
  const timezone = profile?.timezone ?? "Asia/Karachi";
  return (
    <>
      <section className="panel mb-6" id="screening-result">
        <h2 className="text-xl font-semibold">Eligibility and match</h2>
        <p className="mt-4">
          <span
            data-screening-decision
            className={`badge ${summary.effective_decision === "INELIGIBLE" ? "border-red-200 bg-red-50 text-red-900" : summary.effective_decision === "NEEDS_REVIEW" ? "border-amber-200 bg-amber-50 text-amber-900" : ""}`}
          >
            {summary.effective_decision?.replaceAll("_", " ") ?? "Not assessed"}
          </span>
          {latest && (
            <span className="ml-3 text-sm">
              Match {latest.match_score}/100 · confidence{" "}
              {Math.round(latest.confidence * 100)}%
            </span>
          )}
        </p>
        <p className="mt-4 text-sm text-slate-600">
          A score cannot override a failed requirement. Evidence is checked by
          you against public sources; the app does not verify employer
          acceptance.
        </p>
        {expired && (
          <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm">
            This listing is closed or its closing date has passed. A previous
            positive check cannot make it eligible now.
          </p>
        )}
        {summary.screening_stale && (
          <p role="status" className="mt-4 rounded-lg bg-amber-50 p-4 text-sm">
            Inputs changed or the check is older than seven days. Review the
            source and screen again.
          </p>
        )}
        {latest && (
          <>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
              {latest.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              {latest.evaluation_version} ·{" "}
              {formatDate(latest.checked_at, timezone)} ·{" "}
              {summary.screening_stale
                ? "Historical result"
                : "Most recent check"}
            </p>
          </>
        )}
        {factors.success && (
          <details className="mt-5">
            <summary className="cursor-pointer font-semibold">
              Individual gates and score factors
            </summary>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <ul className="space-y-2 text-sm">
                {Object.entries(factors.data.checks).map(([key, value]) => (
                  <li key={key}>
                    {key.replaceAll("_", " ")}: <strong>{value}</strong>
                  </li>
                ))}
              </ul>
              <div>
                <table className="w-full text-left text-sm">
                  <caption className="mb-3 text-left font-semibold">
                    Weighted match contributions
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Factor</th>
                      <th scope="col">Weight</th>
                      <th scope="col">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(factors.data.components).map(
                      ([key, value]) => (
                        <tr key={key}>
                          <td className="py-2">{key}</td>
                          <td>{factors.data.weights[key]}%</td>
                          <td>
                            {(value * factors.data.weights[key]).toFixed(2)}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
                <p className="mt-4 text-sm">
                  Screened monthly equivalent:{" "}
                  {factors.data.monthly_min == null
                    ? "Unknown"
                    : `${factors.data.currency} ${factors.data.monthly_min.toFixed(2)}`}
                </p>
                {factors.data.valid_until && (
                  <p className="mt-2 text-xs text-slate-500">
                    Refresh by {formatDate(factors.data.valid_until, timezone)},
                    or sooner if inputs change.
                  </p>
                )}
              </div>
            </div>
          </details>
        )}
        {duplicates.length > 0 && (
          <div className="mt-5 rounded-lg border border-amber-200 p-4">
            <h3 className="font-semibold">Possible duplicate listings</h3>
            <p className="mt-2 text-sm">
              Same company/title can describe different openings. These records
              were kept separately.
            </p>
            <ul className="mt-3 space-y-2">
              {duplicates.map((d) => (
                <li key={d.id}>
                  <Link className="text-sm underline" href={`/jobs/${d.id}`}>
                    {d.job_title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold">
            Search disposition
          </summary>
          <div className="mt-4">
            <FormPanel
              action={saveDisposition}
              id="disposition-form"
              label="Save disposition"
            >
              <input type="hidden" name="job_id" value={job.id} />
              <input
                type="hidden"
                name="job_updated_at"
                value={job.updated_at}
              />
              <SelectField
                name="disposition"
                label="Your shortlist choice"
                value={job.disposition}
                options={[
                  ["saved", "Saved"],
                  ["shortlisted", "Shortlisted manually"],
                  ["rejected", "Rejected from my search"],
                ]}
              />
            </FormPanel>
          </div>
        </details>
      </section>
      <section className="panel mb-6">
        <h2 className="mb-4 text-xl font-semibold">
          Review evidence and screen
        </h2>
        <p className="mb-6 text-sm leading-6 text-slate-600">
          First save the published job details below. Then copy exact quotes
          from the saved title/description into the categories they support.
          URLs default to the original listing. Missing proof stays unknown.
        </p>
        {!profile ? (
          <p>
            <Link className="underline" href="/settings">
              Save your profile
            </Link>{" "}
            before screening.
          </p>
        ) : (
          <FormPanel
            action={screenJob}
            key={`${job.updated_at}-${profile.updated_at}`}
            id="screening-form"
            label="Save evidence and screen"
          >
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="job_updated_at" value={job.updated_at} />
            <input
              type="hidden"
              name="profile_updated_at"
              value={profile.updated_at}
            />
            <div className="space-y-3">
              {evidenceKinds.map((kind) => {
                const citation = review?.citations.find((c) => c.kind === kind);
                return (
                  <details
                    className="rounded-lg border border-slate-200 p-4"
                    key={kind}
                  >
                    <summary className="cursor-pointer text-sm font-semibold">
                      {labels[kind]}
                      {citation ? " · evidence saved" : ""}
                    </summary>
                    <div className="mt-4 space-y-4">
                      <TextArea
                        name={`quote_${kind}`}
                        label="Exact source quote"
                        value={citation?.quote}
                        maxLength={3000}
                      />
                      <TextField
                        name={`url_${kind}`}
                        label="Public evidence URL"
                        type="url"
                        value={
                          citation?.url ?? job.original_url ?? job.canonical_url
                        }
                        maxLength={2048}
                      />
                    </div>
                  </details>
                );
              })}
            </div>
            <TextArea
              name="required_skills"
              label="Explicitly required skills"
              value={review?.required_skills.join(", ")}
              maxLength={5000}
              help="Comma-separated. Each must occur in the description. Compared with verified skills on your current masters; absent skills need review."
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                name="qualifications"
                label="All mandatory qualifications / experience"
                value={review?.qualifications ?? "unknown"}
                options={[
                  ["unknown", "Not fully verified"],
                  ["met", "Verified against my real qualifications"],
                  ["not_met", "I cannot meet a mandatory requirement"],
                ]}
              />
              <SelectField
                name="authorization"
                label="Residency, authorization and sponsorship"
                value={review?.authorization ?? "unknown"}
                options={[
                  ["unknown", "Needs clarification"],
                  ["met", "Verified position; explain below"],
                  ["not_met", "I cannot meet the stated requirement"],
                ]}
              />
            </div>
            <TextArea
              name="authorization_note"
              label="Verified authorization position"
              value={review?.authorization_note}
              maxLength={4000}
              help="Explain what the source requires and your actual position. Do not infer a legal right from the word remote."
            />
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-semibold">
                Optional hourly and exchange-rate assumptions
              </summary>
              <div className="mt-5 space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  {[
                    [
                      "hours_per_week",
                      "Hours per week",
                      review?.hours_per_week,
                      80,
                    ],
                    [
                      "weeks_per_year",
                      "Weeks per year",
                      review?.weeks_per_year,
                      52,
                    ],
                  ].map(([name, label, value, max]) => (
                    <Field
                      key={String(name)}
                      name={String(name)}
                      label={String(label)}
                    >
                      <input
                        className="input"
                        name={String(name)}
                        id={String(name)}
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={Number(max)}
                        defaultValue={value == null ? "" : Number(value)}
                      />
                    </Field>
                  ))}
                </div>
                <TextArea
                  name="hours_note"
                  label="Source/assumption for hours"
                  value={review?.hours_note}
                  maxLength={2000}
                />
                <Field
                  name="fx_rate"
                  label={`One unit of published currency in ${profile.salary_currency}`}
                >
                  <input
                    className="input"
                    id="fx_rate"
                    name="fx_rate"
                    type="number"
                    min="0.000001"
                    step="any"
                    max="1000000"
                    defaultValue={review?.fx_rate ?? ""}
                  />
                </Field>
                <TextField
                  name="fx_date"
                  label="Exchange-rate date (within 7 days)"
                  type="date"
                  value={review?.fx_date}
                />
                <TextField
                  name="fx_url"
                  label="Public exchange-rate source"
                  type="url"
                  value={review?.fx_url}
                  maxLength={2048}
                />
                <TextArea
                  name="fx_note"
                  label="Exchange-rate explanation"
                  value={review?.fx_note}
                  maxLength={2000}
                />
                <p className="text-sm text-slate-600">
                  No working hours or exchange rates are invented. Hourly
                  equivalents are projections based on your explicit
                  assumptions, not guaranteed offers.
                </p>
              </div>
            </details>
            <label className="flex gap-3 text-sm">
              <input type="checkbox" name="source_checked" value="yes" />I
              checked these quotes, restrictions and compensation against the
              actual public source.
            </label>
            <label className="flex gap-3 text-sm">
              <input type="checkbox" name="listing_checked" value="yes" />I
              checked that applications are currently open. I saved the
              published closing date if known.
            </label>
          </FormPanel>
        )}
      </section>
      <section className="panel mb-6">
        <h2 className="text-xl font-semibold">Optional AI classification</h2>
        <p className="my-4 text-sm text-slate-600">
          Suggests role, seniority and arrangement only. Never decides country,
          salary, legal or overall eligibility. Only the public title and first
          16,000 description characters are sent; your profile and resumes are
          excluded.
        </p>
        {!classifierConfig() ? (
          <p className="text-sm text-slate-600">
            Disabled: no enabled provider configuration. Manual review and
            screening work without an AI key.
          </p>
        ) : (
          <FormPanel
            action={classifyJob}
            id="classify-form"
            label="Request AI suggestions"
          >
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="job_updated_at" value={job.updated_at} />
            <label className="flex gap-3 text-sm">
              <input type="checkbox" name="ai_consent" value="yes" required />
              Send this public listing text to my configured AI provider.
            </label>
          </FormPanel>
        )}
        {suggestion.success && aiRow && (
          <div className="mt-5 rounded-lg border p-5">
            <p className="font-semibold">
              Unconfirmed suggestions · {aiRow.model}
            </p>
            <p className="mt-3 text-sm">
              Role: {suggestion.data.role_category} · Seniority:{" "}
              {suggestion.data.seniority} · Arrangement:{" "}
              {suggestion.data.employment_type} · Confidence:{" "}
              {Math.round(suggestion.data.confidence * 100)}%
            </p>
            <ul className="my-4 space-y-2 text-sm">
              {suggestion.data.citations.map((c) => (
                <li key={c.field}>
                  {c.field.replaceAll("_", " ")}: “{c.quote}”
                </li>
              ))}
            </ul>
            <FormPanel
              action={applyClassification}
              id="apply-classification"
              label="Copy reviewed fields"
            >
              <input type="hidden" name="job_id" value={job.id} />
              <input
                type="hidden"
                name="job_updated_at"
                value={job.updated_at}
              />
              <input type="hidden" name="classification_id" value={aiRow.id} />
              <label className="flex gap-3 text-sm">
                <input
                  type="checkbox"
                  name="confirm_classification"
                  value="yes"
                  required
                />
                I checked each suggested field against the source. Screening
                must still be run.
              </label>
            </FormPanel>
          </div>
        )}
      </section>
      {checks.length > 0 && (
        <details className="panel mb-6">
          <summary className="cursor-pointer font-semibold">
            Screening history (latest five)
          </summary>
          <ol className="mt-5 space-y-5">
            {checks.map((check) => (
              <li key={check.id}>
                <p className="font-semibold">
                  {check.decision.replaceAll("_", " ")} · {check.match_score}
                  /100
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDate(check.checked_at, timezone)} ·{" "}
                  {check.evaluation_version}
                </p>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {check.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-slate-500">
            Complete evidence snapshots and score factors are retained in the
            database.
          </p>
        </details>
      )}
    </>
  );
}
