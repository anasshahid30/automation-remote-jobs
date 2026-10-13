import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/workspace/auth";
import { uuid } from "@/lib/workspace/schemas";
import { FormPanel } from "@/components/form-panel";
import { TextArea } from "@/components/fields";
import { saveResumeText } from "./actions";

export default async function ResumeText({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, user } = await requireUser(),
    { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const { data: resume, error } = await client
    .from("resumes")
    .select("version_name")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Resume unavailable.");
  if (!resume) notFound();
  const { data: facts, error: factsError } = await client
    .from("resume_facts")
    .select("*")
    .eq("resume_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (factsError) throw new Error("Resume text unavailable.");
  return (
    <>
      <h1 className="page-title">Verify resume text</h1>
      <p className="mt-3 text-slate-600">
        {resume.version_name} ·{" "}
        {facts?.verified_by_candidate
          ? "Candidate verified"
          : "Verification required"}
      </p>
      <Link
        className="button-secondary my-5"
        href={`/resumes/${id}/file`}
        target="_blank"
        rel="noreferrer"
      >
        Compare with original private file
      </Link>
      <section className="panel mb-6">
        <h2 className="text-xl font-semibold mb-4">
          Extract a draft transcript
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          PDF text, DOCX and UTF-8 text are supported. Scanned PDFs require a
          manual transcript. Extracted text must be reviewed before use.
        </p>
        <FormPanel
          action={saveResumeText}
          id="resume-extract"
          label="Extract private resume text"
        >
          <input type="hidden" name="resume_id" value={id} />
          <input
            type="hidden"
            name="updated_at"
            value={facts?.updated_at ?? ""}
          />
          <input type="hidden" name="mode" value="extract" />
          {facts && (
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                name="replace_confirm"
                value="yes"
                required
              />
              Replace the transcript and clear its verification.
            </label>
          )}
        </FormPanel>
      </section>
      <section className="panel">
        <FormPanel
          key={facts?.updated_at ?? "new"}
          action={saveResumeText}
          id="resume-text"
          label="Verify and save resume text"
        >
          <input type="hidden" name="resume_id" value={id} />
          <input
            type="hidden"
            name="updated_at"
            value={facts?.updated_at ?? ""}
          />
          <TextArea
            name="text_content"
            label="Accurate resume transcript"
            value={facts?.text_content}
            maxLength={60000}
            required
            help="Preserve real skills, degrees, dates, employers, projects and metrics. Correct extraction errors against the source file."
          />
          <label className="flex gap-3 text-sm">
            <input type="checkbox" name="verified" value="yes" required />I
            compared this text with my actual resume and verified all its facts.
          </label>
        </FormPanel>
      </section>
    </>
  );
}
