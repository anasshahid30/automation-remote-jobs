import Link from "next/link";
import { profileContext } from "@/lib/workspace/auth";
import { pageHref, pageNumber } from "@/lib/workspace/data";
export default async function ReviewQueue({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; state?: string }>;
}) {
  const { client, user } = await profileContext();
  const params = await searchParams,
    page = pageNumber(params.page);
  let query = client
    .from("job_screening_summary")
    .select(
      "id,company_name,job_title,effective_decision,screening_stale,match_score,reasons",
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .neq("disposition", "rejected")
    .order("created_at", { ascending: false });
  if (params.state === "unassessed")
    query = query.is("effective_decision", null);
  else
    query = query.or(
      "effective_decision.eq.NEEDS_REVIEW,effective_decision.is.null",
    );
  const {
    data: jobs,
    error,
    count,
  } = await query.range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error("Review queue could not be loaded.");
  return (
    <>
      <h1 className="page-title">Evidence review queue</h1>
      <p className="mt-3 text-slate-600">
        {count ?? 0} listings need source evidence, clarification or a fresh
        check. Rejected search records are hidden here.
      </p>
      <div className="my-6 flex flex-wrap gap-3">
        <Link className="button-secondary" href="/review">
          All unresolved
        </Link>
        <Link className="button-secondary" href="/review?state=unassessed">
          Not assessed
        </Link>
        <Link className="button-primary" href="/jobs/import">
          Import listings
        </Link>
      </div>
      {!jobs.length ? (
        <p className="panel text-slate-600">
          No unresolved listings in this view. Import an actual listing or
          inspect all saved jobs.
        </p>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <article className="panel" key={job.id}>
              <p className="text-sm text-slate-600">{job.company_name}</p>
              <Link
                className="mt-2 inline-block text-xl font-semibold text-emerald-900 underline"
                href={`/jobs/${job.id}#screening-result`}
              >
                {job.job_title}
              </Link>
              <p className="mt-3 text-sm">
                {job.screening_stale
                  ? "Inputs changed or evidence is stale"
                  : (job.effective_decision?.replaceAll("_", " ") ??
                    "Evidence not assessed")}
              </p>
              {job.reasons && (
                <ul className="mt-3 list-disc pl-5 text-sm">
                  {job.reasons.slice(0, 3).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
      <nav className="mt-6 flex gap-4" aria-label="Review pages">
        {page > 1 && (
          <Link
            className="button-secondary"
            href={pageHref("/review", params, page - 1)}
          >
            Previous
          </Link>
        )}
        {page * 25 < (count ?? 0) && (
          <Link
            className="button-secondary"
            href={pageHref("/review", params, page + 1)}
          >
            Next
          </Link>
        )}
      </nav>
    </>
  );
}
