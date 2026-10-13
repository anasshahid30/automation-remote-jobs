import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { profileContext } from "@/lib/workspace/auth";
import { uuid } from "@/lib/workspace/schemas";
import { recommendResume } from "@/lib/preparation/engine";
import { FormPanel } from "@/components/form-panel";
import { SelectField, TextArea } from "@/components/fields";
import { prepareApplication } from "./actions";

export default async function Prepare({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, user, profile } = await profileContext(),
    { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const [
    { data: app, error },
    { data: resumes, error: resumeError },
    { data: facts, error: factsError },
  ] = await Promise.all([
    client
      .from("applications")
      .select("*,jobs!inner(*)")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    client
      .from("resumes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    client
      .from("resume_facts")
      .select("resume_id,text_content,verified_by_candidate")
      .eq("user_id", user.id),
  ]);
  if (error || resumeError || factsError)
    throw new Error("Preparation inputs unavailable.");
  if (!app) notFound();
  const recommended = recommendResume(
    app.jobs.role_category,
    app.jobs.description,
    resumes,
  );
  const selected = app.resume_id ?? recommended?.id ?? "";
  const transcript = facts.find(
    (f) => f.resume_id === selected && f.verified_by_candidate,
  )?.text_content;
  return (
    <>
      <h1 className="page-title">Prepare an application package</h1>
      <p className="mt-3 mb-6 text-slate-600">
        {app.jobs.job_title} · {app.jobs.company_name}. Documents stay private.
        Preparation does not submit an application.
      </p>
      <div className="panel mb-6">
        <p>
          {recommended
            ? `Recommended master: ${recommended.version_name}`
            : "No matching master is selected. Choose a factual role-specific version below."}
        </p>
        <p className="mt-3 text-sm text-slate-600">
          The tailored resume emphasizes your selected excerpt and retains the
          entire verified transcript. The cover letter uses the company, role
          and exact source excerpts. Verify the result before using it.
        </p>
      </div>
      {!profile || !resumes.length ? (
        <p className="panel">
          Save your profile and upload a real resume first.
        </p>
      ) : (
        <section className="panel">
          <FormPanel
            action={prepareApplication}
            id="package-prepare"
            label="Generate private preview"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="updated_at" value={app.updated_at} />
            <input
              type="hidden"
              name="job_updated_at"
              value={app.jobs.updated_at}
            />
            <input
              type="hidden"
              name="profile_updated_at"
              value={profile.updated_at}
            />
            <input type="hidden" name="request_id" value={randomUUID()} />
            <SelectField
              name="resume_id"
              label="Select resume version"
              value={selected}
              options={[
                ["", "Choose a version"],
                ...resumes.map(
                  (r) =>
                    [
                      r.id,
                      `${r.version_name} (${r.role_category}) — ${facts.find((f) => f.resume_id === r.id)?.verified_by_candidate ? "verified text" : "text verification required"}`,
                    ] as const,
                ),
              ]}
            />
            <TextArea
              name="job_excerpt"
              label="Relevant exact job excerpt"
              value={app.jobs.description.slice(
                0,
                Math.min(500, app.jobs.description.length),
              )}
              maxLength={1000}
              required
            />
            <TextArea
              name="resume_excerpt"
              label="Relevant exact verified resume excerpt"
              value={transcript?.slice(0, Math.min(700, transcript.length))}
              maxLength={1500}
              required
              help="Copy a relevant passage from the selected resume’s verified text. Every experience claim must appear there unchanged."
            />
            <TextArea
              name="questions"
              label="Employer screening questions (one per line)"
              maxLength={10000}
              help="Up to 20 questions. Only exact verified library matches or routine profile fields are answered; all others remain for your review."
            />
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                name="facts_confirm"
                value="yes"
                required
              />
              I selected the correct resume and verified that both excerpts
              accurately represent their sources.
            </label>
          </FormPanel>
        </section>
      )}
      <details className="panel mt-6">
        <summary className="font-semibold cursor-pointer">
          Saved job description
        </summary>
        <p className="whitespace-pre-wrap mt-4">{app.jobs.description}</p>
      </details>
      <section className="panel mt-6">
        <h2 className="font-semibold">Resume source text</h2>
        <p className="mt-3 mb-4 text-sm text-slate-600">
          Extract, compare and verify the selected version before generation.
          Switching versions requires a matching exact excerpt.
        </p>
        <div className="flex flex-wrap gap-3">
          {resumes.map((r) => (
            <Link
              className="button-secondary"
              key={r.id}
              href={`/resumes/${r.id}/text`}
            >
              {r.version_name}
            </Link>
          ))}
        </div>
      </section>
      <Link className="inline-block mt-6 underline" href="/answers">
        Manage verified screening answers
      </Link>
    </>
  );
}
