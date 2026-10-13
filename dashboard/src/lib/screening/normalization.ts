import { z } from "zod";
import { httpsUrl } from "../workspace/schemas";

export function normalizeListing(
  raw: string,
  platform = "manual",
  externalId: string | null = null,
) {
  const url = new URL(httpsUrl.parse(raw));
  if (url.port === "443") url.port = "";
  let path = url.pathname.replace(/\/+$/, "") || "/";
  let inferred: { platform: string; id: string } | null = null;
  const host = url.hostname.toLowerCase();
  const linkedin = path.match(/^\/jobs\/view\/(?:[^/]*-)?(\d+)$/);
  const lever = path.match(/^\/([^/]+)\/([^/]+)(?:\/apply)?$/);
  const greenhouse = path.match(/^\/([^/]+)\/jobs\/(\d+)$/);
  const wellfound = path.match(/^\/jobs\/(\d+)(?:-[^/]*)?$/);
  if (
    ["www.linkedin.com", "linkedin.com", "m.linkedin.com"].includes(host) &&
    linkedin
  ) {
    url.hostname = "www.linkedin.com";
    path = `/jobs/view/${linkedin[1]}`;
    inferred = { platform: "linkedin", id: linkedin[1] };
  } else if (["jobs.lever.co", "jobs.eu.lever.co"].includes(host) && lever) {
    path = `/${lever[1]}/${lever[2]}`;
    inferred = { platform: "lever", id: `${lever[1]}:${lever[2]}` };
  } else if (
    ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(host)
  ) {
    const company =
      greenhouse?.[1] ??
      (path === "/embed/job_app" ? url.searchParams.get("for") : null);
    const id =
      greenhouse?.[2] ??
      (path === "/embed/job_app" ? url.searchParams.get("token") : null);
    if (company && /^[\w-]+$/.test(company) && id && /^\d+$/.test(id)) {
      url.hostname = "job-boards.greenhouse.io";
      path = `/${company}/jobs/${id}`;
      inferred = { platform: "greenhouse", id: `${company}:${id}` };
    }
  } else if (
    ["wellfound.com", "www.wellfound.com"].includes(host) &&
    wellfound
  ) {
    url.hostname = "wellfound.com";
    path = `/jobs/${wellfound[1]}`;
    inferred = { platform: "wellfound", id: wellfound[1] };
  }
  if (
    inferred &&
    externalId &&
    ![inferred.id, inferred.id.split(":").at(-1)].includes(externalId)
  )
    throw new Error("The supplied source ID disagrees with the listing URL.");
  if (inferred && !["manual", "other", inferred.platform].includes(platform))
    throw new Error(
      "The supplied source platform disagrees with the listing URL.",
    );
  if (inferred) url.search = "";
  else {
    for (const key of Array.from(url.searchParams.keys()))
      if (/^utm_/i.test(key) || /^(fbclid|gclid|msclkid)$/i.test(key))
        url.searchParams.delete(key);
    url.searchParams.sort();
  }
  // Hash routes may carry a distinct job identity. Ordinary page anchors do not.
  if (!/^#(?:\/|!\/)/.test(url.hash)) url.hash = "";
  url.pathname = path;
  return {
    canonical_url: url.toString(),
    source_platform: inferred?.platform ?? platform,
    external_job_id: inferred?.id ?? externalId,
  };
}

export const importRowSchema = z.strictObject({
  url: httpsUrl,
  company: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(100000),
  source: z
    .enum([
      "manual",
      "linkedin",
      "wellfound",
      "greenhouse",
      "lever",
      "career_page",
      "other",
    ])
    .default("manual"),
  source_id: z.string().trim().min(1).max(300).optional(),
});
export const importBatchSchema = z.array(importRowSchema).min(1).max(20);

export function importPayload(rows: z.infer<typeof importBatchSchema>) {
  return rows.map((row) => ({
    ...normalizeListing(row.url, row.source, row.source_id ?? null),
    original_url: new URL(row.url).toString(),
    company_name: row.company,
    job_title: row.title,
    description: row.description,
  }));
}
