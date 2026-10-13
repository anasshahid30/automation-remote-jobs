import Link from "next/link";
import { profileContext } from "@/lib/workspace/auth";
import { roles, roleLabels } from "@/lib/workspace/schemas";
import { formatDate } from "@/lib/workspace/format";
import { Field, TextField, TextArea, SelectField } from "@/components/fields";
import { FormPanel } from "@/components/form-panel";
import { selectMaster, uploadResume } from "./actions";

export default async function Resumes() {
  const { client, user, profile } = await profileContext();
  const { data: resumes, error } = await client
    .from("resumes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Resumes could not be loaded.");
  return (
    <>
      <h1 className="page-title">Your resume library</h1>
      <p className="mt-3 mb-8 text-slate-600">
        Keep a master for each role and preserve every uploaded version. Your
        files are private. Verify extracted text to prepare truthful application packages.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {roles.map((role) => {
          const master = resumes.find(
            (resume) => resume.role_category === role && resume.is_master,
          );
          return (
            <section className="panel" key={role}>
              <h2 className="font-semibold">{roleLabels[role]}</h2>
              <p className="mt-3 text-sm text-slate-600">
                {master?.version_name ?? "No master selected"}
              </p>
              {master && (
                <Link
                  href={`/resumes/${master.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-sm text-emerald-800 underline"
                >
                  Open private file
                </Link>
              )}
            </section>
          );
        })}
      </div>
      <section className="panel mt-8">
        <h2 className="mb-5 text-xl font-semibold">Upload a new version</h2>
        {!profile ? (
          <p>
            First{" "}
            <Link className="underline" href="/settings">
              save your candidate profile
            </Link>
            .
          </p>
        ) : (
          <FormPanel
            action={uploadResume}
            id="resume-upload"
            label="Upload private resume"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                name="role_category"
                label="Role category"
                value="backend"
                options={roles.map((value) => [value, roleLabels[value]])}
              />
              <TextField
                name="version_name"
                label="Version name"
                required
                help="Use a unique name for this role, such as ‘Backend master v1’."
              />
            </div>
            <Field
              name="file"
              label="Resume file"
              help="PDF, DOCX, or UTF-8 text; maximum 10 MiB. Files are stored without executing their contents."
            >
              <input
                className="input"
                id="file"
                name="file"
                type="file"
                accept=".pdf,.docx,.txt"
                required
                aria-describedby="file-help"
              />
            </Field>
            <TextArea
              name="skills"
              label="Verified skills (optional)"
              help="Separate skills with commas or new lines. Include only skills you actually have."
              maxLength={5000}
            />
            <TextArea
              name="experience_summary"
              label="Truthful experience summary (optional)"
              maxLength={10000}
            />
          </FormPanel>
        )}
      </section>
      <section className="mt-8">
        <h2 className="mb-4 text-xl font-semibold">Version history</h2>
        {!resumes.length ? (
          <p className="panel text-slate-600">
            No resumes uploaded yet. Upload your three real master documents
            when ready.
          </p>
        ) : (
          <div className="space-y-4">
            {resumes.map((resume) => (
              <article key={resume.id} className="panel">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">
                      {resume.version_name}{" "}
                      {resume.is_master && (
                        <span className="badge ml-2">Current master</span>
                      )}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600">
                      {roleLabels[resume.role_category]} ·{" "}
                      {resume.original_filename ?? "Legacy document"} ·{" "}
                      {resume.file_size
                        ? `${(resume.file_size / 1024).toFixed(1)} KiB`
                        : "Size unknown"}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Uploaded{" "}
                      {formatDate(resume.created_at, profile?.timezone)}
                    </p>
                    {Boolean(resume.skills.length) && (
                      <p className="mt-3 text-sm">{resume.skills.join(", ")}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link href={`/resumes/${resume.id}/text`} className="button-secondary">Verify resume text</Link>
                    <Link
                      href={`/resumes/${resume.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      className="button-secondary"
                    >
                      {resume.mime_type === "application/pdf"
                        ? "Preview PDF"
                        : "Open file"}
                    </Link>
                    <Link
                      href={`/resumes/${resume.id}/file?download=1`}
                      className="button-secondary"
                    >
                      Download
                    </Link>
                  </div>
                </div>
                {!resume.is_master && (
                  <div className="mt-5">
                    <FormPanel
                      action={selectMaster}
                      id={`master-${resume.id}`}
                      label="Use as master"
                      confirm="Use this version as the master for this role? Existing files and application versions will be preserved."
                    >
                      <input type="hidden" name="resume_id" value={resume.id} />
                    </FormPanel>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
