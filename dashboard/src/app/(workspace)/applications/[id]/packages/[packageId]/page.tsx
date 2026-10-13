import Link from "next/link";
import { notFound } from "next/navigation";
import { profileContext } from "@/lib/workspace/auth";
import { uuid } from "@/lib/workspace/schemas";
import { packageSchema } from "@/lib/preparation/engine";
import { FormPanel } from "@/components/form-panel";
import { formatDate } from "@/lib/workspace/format";
import { reviewPackage } from "../../prepare/actions";

export default async function Preview({
  params,
}: {
  params: Promise<{ id: string; packageId: string }>;
}) {
  const { client, user, profile } = await profileContext(),
    { id, packageId } = await params;
  if (!uuid.safeParse(id).success || !uuid.safeParse(packageId).success)
    notFound();
  const { data: pack, error } = await client
    .from("application_packages")
    .select("*")
    .eq("id", packageId)
    .eq("application_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Package unavailable.");
  if (!pack) notFound();
  const content = packageSchema.safeParse(pack.content);
  if (!content.success) throw new Error("Package format is unsupported.");
  const [
    { data: app, error: appError },
    { data: facts, error: factsError },
    { data: versions, error: versionError },
    { data: reviews, error: reviewError },
  ] = await Promise.all([
    client
      .from("applications")
      .select("updated_at,job_id,jobs!inner(updated_at)")
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    client
      .from("resume_facts")
      .select("updated_at,verified_by_candidate")
      .eq("resume_id", pack.resume_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    client.rpc("answer_version_snapshot"),
    client
      .from("package_reviews")
      .select("reviewed_at")
      .eq("package_id", packageId)
      .eq("user_id", user.id)
      .order("reviewed_at", { ascending: false })
      .limit(1),
  ]);
  if (appError || factsError || versionError || reviewError || !app)
    throw new Error("Current package inputs unavailable.");
  const { data: screening, error: screeningError } = await client
    .from("job_screening_summary")
    .select("effective_decision")
    .eq("id", app.job_id)
    .eq("user_id", user.id)
    .single();
  if (screeningError) throw new Error("Eligibility unavailable.");
  const sameTime = (a: string | undefined, b: string) =>
    !!a && new Date(a).valueOf() === new Date(b).valueOf();
  const stale =
    !sameTime(app.jobs.updated_at, pack.job_updated_at) ||
    !sameTime(profile?.updated_at, pack.profile_updated_at) ||
    !sameTime(facts?.updated_at, pack.facts_updated_at) ||
    !facts?.verified_by_candidate ||
    JSON.stringify(versions) !== JSON.stringify(pack.answer_snapshot);
  const p = content.data,
    unanswered = p.answers.some((a) => !a.answer);
  return (
    <>
      <h1 className="page-title">Application preview</h1>
      <p className="mt-3 text-slate-600">
        {p.title} · {p.company} · Version {pack.id.slice(0, 8)} ·{" "}
        {formatDate(pack.created_at, profile?.timezone)}
      </p>
      <div className="panel mt-6">
        <p className="font-semibold">
          {stale
            ? "Stale package — regenerate before use"
            : "Snapshot matches current preparation inputs"}
        </p>
        <p className="mt-3">
          Eligibility:{" "}
          {screening?.effective_decision?.replaceAll("_", " ") ??
            "Not assessed"}
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Document review does not authorize submission. Eligibility and
          employer requirements must still be checked on the official form.
        </p>
        {reviews[0] && (
          <p className="mt-3 text-sm">
            Candidate reviewed{" "}
            {formatDate(reviews[0].reviewed_at, profile?.timezone)}. This is a
            historical review of this version.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3 my-6">
        <Link
          className="button-secondary"
          href={`/resumes/${pack.resume_id}/file`}
          target="_blank"
          rel="noreferrer"
        >
          Original resume · {p.resume_version}
        </Link>
        {["resume", "cover-letter", "answers"].map((kind) => (
          <a
            key={kind}
            className="button-secondary"
            href={`/applications/${id}/packages/${packageId}/file?kind=${kind}`}
            download
          >
            Download {kind.replaceAll("-", " ")}
          </a>
        ))}
        <Link className="button-secondary" href={`/applications/${id}/prepare`}>
          Generate a new version
        </Link>
        <Link className="button-secondary" href={`/applications/${id}`}>
          Application record
        </Link>
        <Link
          className="button-primary"
          href={`/applications/${id}/submission`}
        >
          Validate and start handoff
        </Link>
      </div>
      <section className="panel">
        <h2 className="mb-4 text-xl font-semibold">Tailored cover letter</h2>
        <p className="whitespace-pre-wrap leading-7">{p.cover_letter}</p>
      </section>
      <details className="panel mt-6">
        <summary className="font-semibold cursor-pointer">
          Tailored resume text · all source facts retained
        </summary>
        <p className="whitespace-pre-wrap mt-4 leading-7">{p.resume_text}</p>
      </details>
      <section className="panel mt-6">
        <h2 className="text-xl font-semibold">Screening answers</h2>
        {!p.answers.length && (
          <p className="mt-4">
            No employer questions supplied. Check the official form for
            additional questions.
          </p>
        )}
        {p.answers.map((a, i) => (
          <article className="mt-5 border-t pt-4 border-slate-200" key={i}>
            <h3 className="font-semibold">{a.question}</h3>
            <p className="mt-2 whitespace-pre-wrap">
              {a.answer ?? "Unanswered — candidate input required"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {a.category} ·{" "}
              {a.requires_review
                ? "Review required"
                : "Routine verified information"}{" "}
              ·{" "}
              {a.source.startsWith("Verified answer ")
                ? "Candidate-verified answer library"
                : a.source}
            </p>
          </article>
        ))}
      </section>
      {!!p.warnings.length && (
        <section className="panel mt-6">
          <h2 className="font-semibold">Review items</h2>
          <ul className="mt-3 list-disc pl-5 space-y-2">
            {p.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
          <Link className="mt-4 inline-block underline" href="/answers">
            Resolve answers in the verified library, then regenerate
          </Link>
        </section>
      )}
      <section className="panel mt-6">
        <h2 className="mb-4 text-xl font-semibold">Review this version</h2>
        {stale || unanswered ? (
          <p>
            Resolve {stale ? "changed source inputs" : "unanswered questions"}{" "}
            and generate a new package before applying it to the record.
          </p>
        ) : (
          <FormPanel
            action={reviewPackage}
            id="package-review"
            label="Apply reviewed package to record"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="package_id" value={packageId} />
            <input type="hidden" name="updated_at" value={app.updated_at} />
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                name="review_confirm"
                value="yes"
                required
              />
              I reviewed the resume selection and every document claim against
              my real experience.
            </label>
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                name="sensitive_confirm"
                value="yes"
                required
              />
              I reviewed every answer for this employer, including sponsorship,
              legal, salary and other sensitive questions, and checked for
              questions missing from this preview.
            </label>
          </FormPanel>
        )}
      </section>
    </>
  );
}
