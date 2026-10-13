import Link from "next/link";
import { profileContext } from "@/lib/workspace/auth";
import { pageHref, pageNumber, searchTerm } from "@/lib/workspace/data";
import { compensation } from "@/lib/workspace/format";
import { roleLabels } from "@/lib/workspace/schemas";

export default async function Jobs({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    status?: string;
    source?: string;
    region?: string;
    decision?: string;
    disposition?: string;
    min_monthly?: string;
    page?: string;
  }>;
}) {
  const { client, user, profile } = await profileContext();
  const params = await searchParams,
    page = pageNumber(params.page),
    q = searchTerm(params.q);
  let query = client
    .from("job_screening_summary")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (q) query = query.ilike("job_title", `%${q}%`);
  const filters = {
    role: ["backend", "ai_automation", "full_stack", "other"],
    status: ["active", "closed", "expired", "unknown"],
    source: [
      "manual",
      "linkedin",
      "wellfound",
      "greenhouse",
      "lever",
      "career_page",
      "other",
    ],
    region: ["USA", "UK", "Europe", "Australia", "other", "unknown"],
    decision: ["ELIGIBLE", "INELIGIBLE", "NEEDS_REVIEW"],
    disposition: ["saved", "shortlisted", "rejected"],
  };
  const columns = {
    role: "role_category",
    status: "listing_status",
    source: "source_platform",
    region: "employer_region",
    decision: "effective_decision",
    disposition: "disposition",
  } as const;
  for (const key of Object.keys(filters) as (keyof typeof filters)[])
    if (filters[key].includes(params[key] ?? ""))
      query = query.eq(columns[key], params[key]!);
  const pay = Number(params.min_monthly);
  if (params.min_monthly && Number.isFinite(pay) && pay >= 0)
    query = query
      .gte("monthly_min_candidate", pay)
      .eq("screening_currency", profile?.salary_currency ?? "USD")
      .eq("screening_stale", false);
  const {
    data: jobs,
    count,
    error,
  } = await query.range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error("Listings could not be loaded.");
  return (
    <>
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="page-title">Saved jobs</h1>
          <p className="mt-3 text-slate-600">
            {count ?? 0} matching listings · evidence-backed screening
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/jobs/import" className="button-primary self-start">
            Import listings
          </Link>
          <Link href="/jobs/new" className="button-secondary self-start">
            Add a listing
          </Link>
        </div>
      </div>
      <form className="panel my-8 grid gap-4 sm:grid-cols-3" method="get">
        <div>
          <label htmlFor="q" className="mb-2 block text-sm font-semibold">
            Search job title
          </label>
          <input
            className="input"
            id="q"
            name="q"
            defaultValue={q}
            maxLength={100}
          />
        </div>
        {Object.entries(filters).map(([key, options]) => (
          <div key={key}>
            <label htmlFor={key} className="mb-2 block text-sm font-semibold">
              {
                (
                  {
                    role: "Role",
                    status: "Listing status",
                    source: "Source",
                    region: "Employer region",
                    decision: "Eligibility",
                    disposition: "Search disposition",
                  } as Record<string, string>
                )[key]
              }
            </label>
            <select
              className="input"
              id={key}
              name={key}
              defaultValue={params[key as keyof typeof params] ?? ""}
            >
              <option value="">All</option>
              {options.map((value) => (
                <option key={value} value={value}>
                  {key === "role"
                    ? roleLabels[value]
                    : value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="min_monthly"
          >
            Minimum screened monthly ({profile?.salary_currency ?? "USD"})
          </label>
          <input
            className="input"
            id="min_monthly"
            name="min_monthly"
            type="number"
            min="0"
            step="0.01"
            defaultValue={params.min_monthly ?? ""}
          />
        </div>
        <button className="button-secondary self-end">Filter listings</button>
      </form>
      {!jobs.length ? (
        <section className="panel">
          <h2 className="font-semibold">No listings in this view</h2>
          <p className="mt-3 text-slate-600">
            Import actual listings or adjust the filters. Unknown and stale
            compensation is excluded from minimum-pay filters.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <article key={job.id} className="panel">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-600">{job.company_name}</p>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="mt-2 inline-block text-xl font-semibold text-emerald-900 hover:underline"
                  >
                    {job.job_title}
                  </Link>
                  <p className="mt-3 text-sm">
                    {compensation({
                      salary_min_original: job.salary_min_original,
                      salary_max_original: job.salary_max_original,
                      salary_min_annual: job.salary_min_annual,
                      salary_max_annual: job.salary_max_annual,
                      salary_period: job.salary_period ?? "unknown",
                      salary_currency: job.salary_currency,
                    })}
                  </p>
                </div>
                <span className="badge">{job.listing_status}</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="badge">
                  {roleLabels[job.role_category ?? "other"]}
                </span>
                <span className="badge">{job.source_platform}</span>
                <span className="badge">
                  {job.effective_decision?.replaceAll("_", " ") ??
                    "Not assessed"}
                </span>
                {job.match_score != null && (
                  <span className="badge">Match {job.match_score}/100</span>
                )}
                {job.screening_stale && (
                  <span className="badge">Recheck required</span>
                )}
                {Boolean(job.possible_duplicates) && (
                  <span className="badge">Possible duplicate</span>
                )}
                <span className="badge">{job.disposition}</span>
              </div>
            </article>
          ))}
        </div>
      )}
      <nav className="mt-6 flex gap-4" aria-label="Listing pages">
        {page > 1 && (
          <Link
            className="button-secondary"
            href={pageHref("/jobs", params, page - 1)}
          >
            Previous
          </Link>
        )}
        {page * 25 < (count ?? 0) && (
          <Link
            className="button-secondary"
            href={pageHref("/jobs", params, page + 1)}
          >
            Next
          </Link>
        )}
      </nav>
    </>
  );
}
