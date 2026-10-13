import { requireUser } from "@/lib/workspace/auth";
import { FormPanel } from "@/components/form-panel";
import { TextArea, TextField } from "@/components/fields";
import { importJobs } from "./actions";

export default async function ImportPage() {
  await requireUser();
  return (
    <>
      <h1 className="page-title">Import actual listings</h1>
      <p className="mt-3 mb-8 max-w-3xl text-slate-600">
        Paste public listing details you have checked. No website is fetched,
        account connected or application sent. Tracking URLs and recognized
        board IDs are normalized; existing records are kept.
      </p>
      <section className="panel">
        <h2 className="mb-6 text-xl font-semibold">One listing</h2>
        <FormPanel
          action={importJobs}
          id="import-single"
          label="Import listing"
        >
          <input type="hidden" name="mode" value="single" />
          <TextField
            name="url"
            label="Public listing URL"
            type="url"
            maxLength={2048}
            required
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField name="company" label="Company" required />
            <TextField name="title" label="Job title" required />
          </div>
          <TextArea
            name="description"
            label="Actual source description"
            maxLength={100000}
            required
          />
        </FormPanel>
      </section>
      <section className="panel mt-8">
        <h2 className="mb-4 text-xl font-semibold">
          JSON batch (up to 20 listings)
        </h2>
        <p className="mb-5 text-sm text-slate-600">
          An array of records with <code>url</code>, <code>company</code>,{" "}
          <code>title</code> and <code>description</code>. Optional:{" "}
          <code>source</code>, <code>source_id</code>. The whole batch succeeds
          or rolls back together.
        </p>
        <FormPanel action={importJobs} id="import-batch" label="Import batch">
          <input type="hidden" name="mode" value="batch" />
          <TextArea
            name="json"
            label="Your job records as JSON"
            maxLength={2000000}
            required
          />
        </FormPanel>
      </section>
    </>
  );
}
