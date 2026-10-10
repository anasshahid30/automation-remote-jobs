import Link from "next/link";
import { profileContext } from "@/lib/workspace/auth";
import { pageHref, pageNumber, searchTerm } from "@/lib/workspace/data";
import { compensation } from "@/lib/workspace/format";
import { roles, roleLabels } from "@/lib/workspace/schemas";

export default async function Jobs({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const { client, user } = await profileContext();
  const params = await searchParams,
    page = pageNumber(params.page),
    q = searchTerm(params.q);
  let query = client
    .from("jobs")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (q) query = query.ilike("job_title", `%${q}%`);
  if ([...roles, "other"].includes(params.role ?? ""))
    query = query.eq("role_category", params.role!);
  if (["active", "closed", "expired", "unknown"].includes(params.status ?? ""))
    query = query.eq("listing_status", params.status!);
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
            {count ?? 0} matching listings · manually saved · screening starts
            in Phase 3
          </p>
        </div>
        <Link href="/jobs/new" className="button-primary self-start">
          Add a listing
        </Link>
      </div>
      <form className="panel my-8 grid gap-4 sm:grid-cols-4" method="get">
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
        <div>
          <label htmlFor="role" className="mb-2 block text-sm font-semibold">
            Role
          </label>
          <select
            className="input"
            id="role"
            name="role"
            defaultValue={params.role ?? ""}
          >
            <option value="">All roles</option>
            {[...roles, "other"].map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="mb-2 block text-sm font-semibold">
            Listing status
          </label>
          <select
            className="input"
            id="status"
            name="status"
            defaultValue={params.status ?? ""}
          >
            <option value="">All statuses</option>
            {["active", "closed", "expired", "unknown"].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>
        <button className="button-secondary self-end">Filter listings</button>
      </form>
      {!jobs.length ? (
        <section className="panel">
          <h2 className="font-semibold">No listings here yet</h2>
          <p className="mt-3 text-slate-600">
            Add an actual listing, or adjust your filters. No sample
            opportunities are added to your account.
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
                  <p className="mt-3 text-sm">{compensation(job)}</p>
                </div>
                <span className="badge">{job.listing_status}</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="badge">
                  {roleLabels[job.role_category ?? "other"]}
                </span>
                <span className="badge">{job.workplace_type}</span>
                <span className="badge">Eligibility not assessed</span>
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
