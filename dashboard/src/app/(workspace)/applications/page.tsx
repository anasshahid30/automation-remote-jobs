import Link from "next/link";
import { profileContext } from "@/lib/workspace/auth";
import { pageHref, pageNumber, searchTerm } from "@/lib/workspace/data";
import { formatDate } from "@/lib/workspace/format";
import { statuses, statusLabels } from "@/lib/workspace/schemas";

export default async function Applications({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { client, user, profile } = await profileContext();
  const params = await searchParams,
    page = pageNumber(params.page),
    q = searchTerm(params.q);
  let query = client
    .from("applications")
    .select(
      "id,status,applied_at,follow_up_at,jobs!inner(company_name,job_title),resumes(version_name)",
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (statuses.includes(params.status as (typeof statuses)[number]))
    query = query.eq("status", params.status!);
  if (q) query = query.ilike("jobs.job_title", `%${q}%`);
  const {
    data: applications,
    count,
    error,
  } = await query.range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error("Applications could not be loaded.");
  return (
    <>
      <h1 className="page-title">Application tracker</h1>
      <p className="mt-3 text-slate-600">
        {count ?? 0} matching records · submissions are reported by you, not
        automatically verified
      </p>
      <form className="panel my-8 flex flex-wrap items-end gap-4">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="mb-2 block text-sm font-semibold">
            Search job title
          </label>
          <input
            id="q"
            name="q"
            className="input"
            defaultValue={q}
            maxLength={100}
          />
        </div>
        <div>
          <label htmlFor="status" className="mb-2 block text-sm font-semibold">
            Status
          </label>
          <select
            className="input"
            id="status"
            name="status"
            defaultValue={params.status ?? ""}
          >
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </div>
        <button className="button-secondary">Filter records</button>
      </form>
      {!applications.length ? (
        <div className="panel">
          <h2 className="font-semibold">No applications in this view</h2>
          <p className="mt-3 text-slate-600">
            Start from a saved job to create a draft, or adjust your filters.
          </p>
          <Link className="button-secondary mt-5" href="/jobs">
            Browse saved jobs
          </Link>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">
              Your application records, resume versions and follow-up dates
            </caption>
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                {[
                  "Role / company",
                  "Status",
                  "Resume version",
                  "Submitted",
                  "Follow-up",
                ].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="px-3 py-4 font-semibold"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr
                  key={app.id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-3 py-5">
                    <Link
                      href={`/applications/${app.id}`}
                      className="font-semibold text-emerald-900 hover:underline"
                    >
                      {app.jobs.job_title}
                    </Link>
                    <p className="mt-2 text-slate-500">
                      {app.jobs.company_name}
                    </p>
                  </td>
                  <td className="px-3 py-5">
                    <span className="badge">
                      {statusLabels[app.status] ?? app.status}
                    </span>
                  </td>
                  <td className="px-3 py-5">
                    {app.resumes?.version_name ?? "Not selected"}
                  </td>
                  <td className="px-3 py-5">
                    {formatDate(app.applied_at, profile?.timezone)}
                  </td>
                  <td className="px-3 py-5">
                    {formatDate(app.follow_up_at, profile?.timezone)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="mt-6 flex gap-4" aria-label="Application pages">
        {page > 1 && (
          <Link
            className="button-secondary"
            href={pageHref("/applications", params, page - 1)}
          >
            Previous
          </Link>
        )}
        {page * 25 < (count ?? 0) && (
          <Link
            className="button-secondary"
            href={pageHref("/applications", params, page + 1)}
          >
            Next
          </Link>
        )}
      </nav>
    </>
  );
}
