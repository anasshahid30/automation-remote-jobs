import Link from "next/link";
import { notFound } from "next/navigation";
import { profileContext } from "@/lib/workspace/auth";
import { uuid } from "@/lib/workspace/schemas";
import { compensation } from "@/lib/workspace/format";
import { JobForm } from "@/components/job-form";
import { FormPanel } from "@/components/form-panel";
import { ScreeningPanel } from "@/components/screening-panel";
import { createApplication } from "@/app/(workspace)/applications/actions";
import { deleteJob } from "../actions";

export default async function JobDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, user, profile } = await profileContext();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const { data: job, error } = await client
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Listing could not be loaded.");
  if (!job) notFound();
  const { data: application, error: appError } = await client
    .from("applications")
    .select("id")
    .eq("job_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (appError) throw new Error("Application could not be loaded.");
  return (
    <>
      <p className="text-sm text-slate-600">{job.company_name}</p>
      <h1 className="page-title mt-2">{job.job_title}</h1>
      <p className="mt-4 text-slate-600">{compensation(job)}</p>
      <div className="my-6 flex flex-wrap items-start gap-4">
        <a
          href={job.canonical_url}
          target="_blank"
          rel="noopener noreferrer"
          className="button-secondary"
        >
          Open original listing
        </a>
        {application ? (
          <Link
            className="button-primary"
            href={`/applications/${application.id}`}
          >
            Open application record
          </Link>
        ) : (
          <FormPanel
            action={createApplication}
            label="Create application draft"
            id="create-application"
          >
            <input type="hidden" name="job_id" value={id} />
          </FormPanel>
        )}
      </div>
      <details className="panel mb-6">
        <summary className="cursor-pointer font-semibold">
          Read the saved description
        </summary>
        <p className="mt-5 whitespace-pre-wrap leading-7 text-slate-700">
          {job.description}
        </p>
      </details>
      <ScreeningPanel job={job} profile={profile} />
      <section className="panel">
        <h2 className="mb-6 text-xl font-semibold">Edit listing details</h2>
        <JobForm job={job} timezone={profile?.timezone ?? "Asia/Karachi"} />
      </section>
      <section className="panel mt-8">
        <h2 className="mb-4 font-semibold">Delete this listing</h2>
        <FormPanel
          action={deleteJob}
          id="delete-job"
          label="Delete listing"
          confirm="Permanently delete this saved listing? Listings with application history cannot be deleted."
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="updated_at" value={job.updated_at} />
          <label className="flex gap-3 text-sm">
            <input type="checkbox" name="confirm_delete" value="yes" required />
            I understand this removes the saved listing.
          </label>
        </FormPanel>
      </section>
    </>
  );
}
