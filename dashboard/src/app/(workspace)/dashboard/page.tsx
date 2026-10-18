import Link from "next/link";
import { z } from "zod";
import { profileContext } from "@/lib/workspace/auth";
import { eventLabel, formatDate } from "@/lib/workspace/format";

const metricsSchema = z.object({
  jobs: z.number(),
  eligible_jobs: z.number(),
  review_jobs: z.number(),
  unassessed_jobs: z.number(),
  applications: z.number(),
  needs_review: z.number(),
  failed: z.number(),
  responses: z.number(),
  interviews: z.number(),
  manual_today: z.number(),
  follow_ups_due: z.number(),
  masters: z.number(),
  timezone: z.string(),
});
export default async function Dashboard() {
  const { client, user, profile } = await profileContext();
  const [{ data, error }, { data: events, error: eventError }] =
    await Promise.all([
      client.rpc("dashboard_metrics"),
      client
        .from("application_events")
        .select("id,application_id,event_type,details,occurred_at")
        .eq("user_id", user.id)
        .order("occurred_at", { ascending: false })
        .limit(8),
    ]);
  const parsed = metricsSchema.safeParse(data);
  if (error || eventError || !parsed.success)
    throw new Error("Dashboard data could not be loaded.");
  const metrics = parsed.data;
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-widest text-emerald-800">
        Your workspace
      </p>
      <h1 className="page-title mt-3">A clear view of your search</h1>
      <p className="mt-3 text-slate-600">
        Real records from your account. Daily totals use {metrics.timezone}.
      </p>
      <Link className="button-secondary mt-5" href="/schedule">
        Daily quota, schedule and follow-ups
      </Link>
      {!profile && (
        <section className="panel mt-8 border-amber-200">
          <h2 className="font-semibold">Start with your candidate profile</h2>
          <p className="mt-3 text-slate-600">
            Save your real contact details and location, then upload your three
            master resumes.
          </p>
          <Link href="/settings" className="button-primary mt-5">
            Set up your profile
          </Link>
        </section>
      )}
      <section
        className="my-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Account statistics"
      >
        {[
          ["Saved jobs", metrics.jobs],
          ["Jobs eligible", metrics.eligible_jobs],
          ["Jobs needing review", metrics.review_jobs],
          ["Jobs unassessed", metrics.unassessed_jobs],
          ["Application records", metrics.applications],
          ["Needs review", metrics.needs_review],
          ["Manual submissions today", metrics.manual_today],
          ["Failed records", metrics.failed],
          ["Responses recorded", metrics.responses],
          ["Interviews", metrics.interviews],
          ["Follow-ups due", metrics.follow_ups_due],
        ].map(([label, value]) => (
          <article className="panel" key={label}>
            <h2 className="text-sm text-slate-600">{label}</h2>
            <p data-metric={label} className="mt-3 text-3xl font-semibold">
              {value}
            </p>
          </article>
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel">
          <h2 className="text-xl font-semibold">Prepared for the next step</h2>
          <p className="mt-4 text-slate-600">
            {metrics.masters} of 3 role-specific master resumes selected.
          </p>
          <p className="mt-3 text-slate-600">
            {profile
              ? `Your daily goal is ${profile.daily_target}.`
              : "Set your daily goal in Settings."}{" "}
            Source verification and automatic submissions are not enabled.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/resumes" className="button-secondary">
              Manage resumes
            </Link>
            <Link href="/jobs/new" className="button-primary">
              Save a real job
            </Link>
          </div>
        </section>
        <section className="panel">
          <h2 className="text-xl font-semibold">Recent activity</h2>
          {!events.length ? (
            <p className="mt-4 text-slate-600">
              No application activity yet. Create a draft from a saved job to
              get started.
            </p>
          ) : (
            <ol className="mt-5 space-y-4">
              {events.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/applications/${event.application_id}`}
                    className="text-sm font-semibold text-emerald-900 underline"
                  >
                    {eventLabel(event)}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(event.occurred_at, metrics.timezone)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
