import Link from "next/link";
import { notFound } from "next/navigation";
import { profileContext } from "@/lib/workspace/auth";
import {
  dateTimeForInput,
  eventLabel,
  formatDate,
} from "@/lib/workspace/format";
import { statuses, statusLabels, uuid } from "@/lib/workspace/schemas";
import { FormPanel } from "@/components/form-panel";
import { SelectField, TextField, TextArea } from "@/components/fields";
import { deleteApplication, saveApplication } from "../actions";

export default async function ApplicationDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, user, profile } = await profileContext();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const { data: app, error } = await client
    .from("applications")
    .select("*,jobs!inner(id,company_name,job_title,description,canonical_url)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Application could not be loaded.");
  if (!app) notFound();
  const [
    { data: resumes, error: resumeError },
    { data: events, error: eventError },
  ] = await Promise.all([
    client
      .from("resumes")
      .select("id,version_name,role_category")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    client
      .from("application_events")
      .select("id,event_type,details,occurred_at")
      .eq("application_id", id)
      .eq("user_id", user.id)
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);
  if (resumeError || eventError)
    throw new Error("Application details could not be loaded.");
  const timezone = profile?.timezone ?? "Asia/Karachi";
  return (
    <>
      <p className="text-sm text-slate-600">{app.jobs.company_name}</p>
      <h1 className="page-title mt-2">{app.jobs.job_title}</h1>
      <p className="mt-4 text-slate-600">
        {app.submission_method === "human_assisted"
          ? "Human-assisted record"
          : "Integration record"}{" "}
        · Eligibility not assessed · Times use {timezone}
      </p>
      <div className="my-6 flex flex-wrap gap-3">
        <a
          href={app.jobs.canonical_url}
          target="_blank"
          rel="noopener noreferrer"
          className="button-secondary"
        >
          Open original application form
        </a>
        <Link href={`/jobs/${app.job_id}`} className="button-secondary">
          Saved job details
        </Link>
        {app.resume_id && (
          <Link
            href={`/resumes/${app.resume_id}/file`}
            target="_blank"
            rel="noreferrer"
            className="button-secondary"
          >
            View selected resume
          </Link>
        )}
      </div>
      <details className="panel mb-6">
        <summary className="cursor-pointer font-semibold">
          Job description
        </summary>
        <p className="mt-4 whitespace-pre-wrap leading-7">
          {app.jobs.description}
        </p>
      </details>
      <section className="panel">
        <h2 className="mb-6 text-xl font-semibold">Update your record</h2>
        <FormPanel
          action={saveApplication}
          id="application-form"
          label="Save application record"
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="updated_at" value={app.updated_at} />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              name="status"
              label="Application status"
              value={app.status}
              options={statuses.map((status) => [status, statusLabels[status]])}
            />
            <SelectField
              name="resume_id"
              label="Resume version"
              value={app.resume_id ?? ""}
              options={[
                ["", "Not selected"],
                ...resumes.map(
                  (resume) =>
                    [
                      resume.id,
                      `${resume.version_name} (${resume.role_category})`,
                    ] as const,
                ),
              ]}
            />
          </div>
          <TextArea
            name="cover_letter"
            label="Your cover letter (optional)"
            value={app.cover_letter}
            maxLength={20000}
            help="Enter truthful text you prepared. This phase does not generate or submit it."
          />
          <TextArea
            name="notes"
            label="Response, interview and follow-up notes"
            value={app.notes}
            maxLength={20000}
          />
          <TextField
            name="follow_up_at"
            label={`Next follow-up (${timezone})`}
            type="datetime-local"
            value={dateTimeForInput(app.follow_up_at, timezone)}
          />
          <fieldset className="rounded-lg border border-slate-200 p-5">
            <legend className="px-2 font-semibold">
              Record an actual manual submission
            </legend>
            <p className="mb-5 text-sm leading-6 text-slate-600">
              Complete the employer’s official form yourself, then record the
              actual result here. Your report is not a provider-verified
              confirmation.
            </p>
            <div className="space-y-5">
              <TextField
                name="applied_at"
                label={`Actual submission time (${timezone})`}
                type="datetime-local"
                value={dateTimeForInput(app.applied_at, timezone)}
              />
              <TextArea
                name="confirmation_note"
                label="Actual receipt/reference or confirmation note"
                value={app.submission_reference}
                maxLength={2000}
              />
              <label id="manual_confirm" className="flex gap-3 text-sm">
                <input
                  type="checkbox"
                  name="manual_confirm"
                  value="yes"
                  defaultChecked={Boolean(app.applied_at)}
                />
                I confirm that I actually completed this application and the
                details above are accurate.
              </label>
            </div>
          </fieldset>
          <TextArea
            name="last_error"
            label="Actual failure details (required for Failed)"
            value={app.last_error}
            maxLength={3000}
          />
        </FormPanel>
      </section>
      <section className="panel mt-8">
        <h2 className="text-xl font-semibold">Activity history</h2>
        <ol className="mt-5 space-y-4">
          {events.map((event) => (
            <li key={event.id} className="border-l-2 border-emerald-200 pl-4">
              <p className="text-sm font-semibold">{eventLabel(event)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {formatDate(event.occurred_at, timezone)}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-slate-500">
          Most recent 50 events. Saving a record and recording its activity
          happen together.
        </p>
      </section>
      <section className="panel mt-8">
        <h2 className="mb-4 font-semibold">Delete this application record</h2>
        <FormPanel
          action={deleteApplication}
          id="delete-application"
          label="Delete application record"
          confirm="Permanently remove this application record and its activity history? Your resume files and saved job will remain."
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="updated_at" value={app.updated_at} />
          <label className="flex gap-3 text-sm">
            <input type="checkbox" name="confirm_delete" value="yes" required />
            I understand this deletes the application record and its activity
            history.
          </label>
        </FormPanel>
      </section>
    </>
  );
}
