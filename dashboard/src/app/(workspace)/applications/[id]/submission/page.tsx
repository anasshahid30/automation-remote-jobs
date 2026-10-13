import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { profileContext } from "@/lib/workspace/auth";
import { uuid } from "@/lib/workspace/schemas";
import { formatDate } from "@/lib/workspace/format";
import { reportSchema } from "@/lib/submission/validation";
import { FormPanel } from "@/components/form-panel";
import { TextArea, TextField, SelectField } from "@/components/fields";
import { checkSubmission, finishHandoff, setSubmissionPause } from "./actions";

const stateLabels: Record<string, string> = {
  blocked: "Check needs attention",
  dry_run_passed: "Dry check passed",
  handoff_ready: "Awaiting your manual submission",
  uncertain: "Outcome uncertain — verify before retrying",
  candidate_reported: "Candidate-reported submission",
  cancelled: "Cancelled — candidate confirmed nothing was submitted",
};
export default async function Submission({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { client, user, profile } = await profileContext(),
    { id } = await params,
    { run: runId } = await searchParams;
  if (!uuid.safeParse(id).success) notFound();
  const [
    { data: app, error: appError },
    { data: packages, error: packageError },
    { data: runs, error: runError },
    { data: controls, error: controlError },
    { data: active, error: activeError },
  ] = await Promise.all([
    client
      .from("applications")
      .select(
        "*,jobs!inner(source_platform,company_name,job_title,canonical_url)",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    client
      .from("application_packages")
      .select("id,created_at")
      .eq("application_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("submission_runs")
      .select("*")
      .eq("application_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    client
      .from("submission_controls")
      .select("scope,paused")
      .eq("user_id", user.id),
    client
      .from("submission_runs")
      .select("*")
      .eq("application_id", id)
      .eq("user_id", user.id)
      .eq("mode", "human_assisted")
      .in("state", ["handoff_ready", "uncertain", "candidate_reported"])
      .maybeSingle(),
  ]);
  if (appError || packageError || runError || controlError || activeError)
    throw new Error("Submission workspace unavailable.");
  if (!app) notFound();
  let selected =
    runs.find((r) => r.id === runId) ?? (!runId ? runs[0] : undefined);
  if (runId && !selected) {
    if (!uuid.safeParse(runId).success) notFound();
    const { data, error } = await client
      .from("submission_runs")
      .select("*")
      .eq("id", runId)
      .eq("application_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error("Run unavailable.");
    if (!data) notFound();
    selected = data;
  }
  const globalPaused =
    controls.find((c) => c.scope === "global")?.paused ?? true;
  const sourceScope = `source:${app.jobs.source_platform}`,
    sourcePaused =
      controls.find((c) => c.scope === sourceScope)?.paused ?? false;
  const report = selected ? reportSchema.safeParse(selected.report) : null;
  const selectedPackage =
    typeof app.answers === "object" &&
    app.answers &&
    !Array.isArray(app.answers) &&
    typeof app.answers.package_id === "string"
      ? app.answers.package_id
      : packages[0]?.id;
  return (
    <>
      <h1 className="page-title">Submission handoff</h1>
      <p className="mt-3 mb-6 text-slate-600">
        {app.jobs.job_title} · {app.jobs.company_name}
      </p>
      <section className="panel mb-6">
        <h2 className="text-xl font-semibold">
          Official form · human-assisted
        </h2>
        <p className="mt-3 leading-7">
          Check your reviewed package, then complete the employer’s official
          form yourself. Record the real outcome here so an uncertain or
          completed attempt cannot start a duplicate handoff.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          No submission API is configured. Dry checks and handoff creation do
          not send an application. Confirm any additional questions on the
          employer’s form.
        </p>
        <Link href={`/applications/${id}`} className="button-secondary mt-4">
          Application record
        </Link>
      </section>
      <section className="panel mb-6">
        <h2 className="text-xl font-semibold mb-4">Pause controls</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {[
            ["global", globalPaused, "All handoffs"],
            [sourceScope, sourcePaused, `Source: ${app.jobs.source_platform}`],
          ].map(([scope, paused, label]) => (
            <FormPanel
              key={String(scope)}
              action={setSubmissionPause}
              id={scope === "global" ? "pause-global" : "pause-source"}
              label={paused ? "Enable handoffs" : "Pause handoffs"}
            >
              <input type="hidden" name="scope" value={String(scope)} />
              <input
                type="hidden"
                name="paused"
                value={paused ? "no" : "yes"}
              />
              <p className="font-semibold">
                {label} · {paused ? "Paused" : "Enabled"}
              </p>
            </FormPanel>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Pausing blocks new handoffs. Actual outcomes can still be recorded. It
          does not cancel a form already open with an employer.
        </p>
      </section>
      {!packages.length ? (
        <p className="panel">
          Generate and review an application package first.{" "}
          <Link className="underline" href={`/applications/${id}/prepare`}>
            Prepare a package
          </Link>
        </p>
      ) : (
        <section className="panel mb-6">
          <h2 className="mb-4 text-xl font-semibold">
            Validate before handoff
          </h2>
          <FormPanel
            action={checkSubmission}
            id="submission-check"
            label="Run dry check"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="updated_at" value={app.updated_at} />
            <input type="hidden" name="request_id" value={randomUUID()} />
            <input type="hidden" name="mode" value="dry_run" />
            <SelectField
              name="package_id"
              label="Reviewed package version"
              value={selectedPackage}
              options={packages.map((p) => [
                p.id,
                `${p.id.slice(0, 8)} · ${formatDate(p.created_at, profile?.timezone)}`,
              ])}
            />
            <p className="text-sm text-slate-600">
              Rechecks current eligibility, source facts, answers, private file
              integrity and prior attempts. Dry checks do not create submissions
              or use your daily submission count.
            </p>
          </FormPanel>
        </section>
      )}
      {selected && (
        <section className="panel mb-6" id="submission-result">
          <h2 className="text-xl font-semibold">
            {stateLabels[selected.state]}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {selected.mode === "dry_run" ? "Dry check" : "Manual handoff"} ·{" "}
            {formatDate(selected.created_at, profile?.timezone)}
          </p>
          <Link
            className="mt-4 inline-block underline"
            href={`/applications/${id}/packages/${selected.package_id}`}
          >
            Open this package and private downloads
          </Link>
          {report?.success && (
            <>
              <p className="mt-4 text-sm">
                Eligibility at check:{" "}
                {report.data.decision.replaceAll("_", " ")}. This is a
                historical result; starting a handoff reruns the checks.
              </p>
              <ul className="mt-4 space-y-3">
                {report.data.checks.map((c) => (
                  <li key={c.name}>
                    <p className="font-semibold">
                      {c.passed ? "Passed" : "Needs attention"} · {c.name}
                    </p>
                    {!c.passed && (
                      <p className="mt-1 text-sm text-slate-600">{c.detail}</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {selected.mode === "dry_run" &&
            selected.state === "dry_run_passed" &&
            !active &&
            !app.applied_at && (
              <div className="mt-6">
                <FormPanel
                  action={checkSubmission}
                  id="handoff-start"
                  label="Start manual handoff"
                >
                  <input type="hidden" name="id" value={id} />
                  <input
                    type="hidden"
                    name="updated_at"
                    value={app.updated_at}
                  />
                  <input type="hidden" name="request_id" value={randomUUID()} />
                  <input type="hidden" name="mode" value="human_assisted" />
                  <input
                    type="hidden"
                    name="package_id"
                    value={selected.package_id}
                  />
                  <label className="flex gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="handoff_confirm"
                      value="yes"
                      required
                    />
                    I will complete the official form myself, check its
                    additional questions, and report its actual outcome.
                  </label>
                  {(globalPaused || sourcePaused) && (
                    <p className="text-sm text-slate-600">
                      Enable both global and source handoffs before starting.
                    </p>
                  )}
                </FormPanel>
              </div>
            )}
          {selected.mode === "human_assisted" && (
            <>
              <p className="mt-5 whitespace-pre-wrap">
                {selected.outcome_note}
              </p>
              {["handoff_ready", "uncertain"].includes(selected.state) && (
                <div className="mt-5">
                  {selected.state === "handoff_ready" ? (
                    <a
                      className="button-primary"
                      href={selected.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open employer’s official form
                    </a>
                  ) : (
                    <p className="font-semibold">
                      Check the employer’s receipt or application history before
                      submitting anything again.
                    </p>
                  )}
                  <div className="mt-6">
                    <FormPanel
                      action={finishHandoff}
                      id="handoff-outcome"
                      label="Record actual outcome"
                    >
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="run_id" value={selected.id} />
                      <SelectField
                        name="outcome"
                        label="What actually happened?"
                        value="uncertain"
                        options={[
                          [
                            "uncertain",
                            "Uncertain — check receipt before retrying",
                          ],
                          [
                            "candidate_reported",
                            "I completed it and received confirmation",
                          ],
                          [
                            "cancelled",
                            "I verified that nothing was submitted",
                          ],
                        ]}
                      />
                      <TextArea
                        name="note"
                        label="Actual receipt/reference or outcome explanation"
                        maxLength={3000}
                        required
                      />
                      <TextField
                        name="applied_at"
                        label={`Actual submission time (${profile?.timezone ?? "Asia/Karachi"}, only if completed)`}
                        type="datetime-local"
                      />
                      <label className="flex gap-3 text-sm">
                        <input
                          type="checkbox"
                          name="outcome_confirm"
                          value="yes"
                          required
                        />
                        This describes the actual result. If cancelling, I
                        verified that no application was submitted.
                      </label>
                    </FormPanel>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
      {active && active.id !== selected?.id && (
        <p className="panel mb-6">
          An existing handoff blocks another attempt.{" "}
          <Link
            className="underline"
            href={`/applications/${id}/submission?run=${active.id}`}
          >
            Review its actual outcome
          </Link>
          .
        </p>
      )}
      <section className="panel">
        <h2 className="text-xl font-semibold">Check and handoff history</h2>
        <ol className="mt-4 space-y-3">
          {runs.map((r) => (
            <li key={r.id}>
              <Link
                className="underline"
                href={`/applications/${id}/submission?run=${r.id}`}
              >
                {stateLabels[r.state]} ·{" "}
                {formatDate(r.created_at, profile?.timezone)}
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-slate-600">
          Latest 30 runs. History is retained to prevent duplicates; application
          records with handoff history cannot be deleted individually.
        </p>
      </section>
    </>
  );
}
