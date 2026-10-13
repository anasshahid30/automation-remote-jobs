import type { Tables } from "@/types/database";
import { roles, roleLabels } from "@/lib/workspace/schemas";
import { dateTimeForInput } from "@/lib/workspace/format";
import { saveJob } from "@/app/(workspace)/jobs/actions";
import { Field, TextField, TextArea, SelectField } from "./fields";
import { FormPanel } from "./form-panel";

export function JobForm({
  job,
  timezone,
}: {
  job?: Tables<"jobs">;
  timezone: string;
}) {
  const options = (entries: string[]) =>
    entries.map((value) => [value, value.replaceAll("_", " ")] as const);
  return (
    <FormPanel
      action={saveJob}
      id="job-form"
      label={job ? "Save listing changes" : "Save listing"}
    >
      {job && (
        <>
          <input type="hidden" name="id" value={job.id} />
          <input type="hidden" name="updated_at" value={job.updated_at} />
        </>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="company_name"
          label="Company"
          value={job?.company_name}
          required
        />
        <TextField
          name="job_title"
          label="Job title"
          value={job?.job_title}
          required
        />
      </div>
      <TextField
        name="canonical_url"
        label="Original listing URL"
        type="url"
        value={job?.original_url ?? job?.canonical_url}
        maxLength={2048}
        required
        help="HTTPS only. Saving a URL does not fetch the website or connect an integration."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          name="employer_region"
          label="Employer region (if evidenced)"
          value={job?.employer_region ?? "unknown"}
          options={options([
            "unknown",
            "USA",
            "UK",
            "Europe",
            "Australia",
            "other",
          ])}
        />
        <SelectField
          name="source_platform"
          label="Listing source"
          value={job?.source_platform ?? "manual"}
          options={[
            ["manual", "Manual / unspecified"],
            ["linkedin", "LinkedIn"],
            ["wellfound", "Wellfound"],
            ["greenhouse", "Greenhouse"],
            ["lever", "Lever"],
            ["career_page", "Employer career page"],
            ["other", "Other"],
          ]}
        />
        <TextField
          name="external_job_id"
          label="Source job ID (if known)"
          value={job?.external_job_id}
          maxLength={300}
        />
      </div>
      <TextArea
        name="description"
        label="Job description"
        value={job?.description}
        required
        maxLength={100000}
        help="Paste the actual description. It is stored as text and is not treated as instructions."
      />
      <div className="grid gap-5 sm:grid-cols-3">
        <SelectField
          name="role_category"
          label="Role category"
          value={job?.role_category ?? "backend"}
          options={[
            ...roles.map((value) => [value, roleLabels[value]] as const),
            ["other", "Other"],
          ]}
        />
        <SelectField
          name="employment_type"
          label="Employment type"
          value={job?.employment_type ?? "unknown"}
          options={options(["unknown", "full_time", "contract", "other"])}
        />
        <SelectField
          name="seniority"
          label="Seniority"
          value={job?.seniority ?? "unknown"}
          options={options(["unknown", "junior", "mid", "senior", "other"])}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          name="workplace_type"
          label="Workplace arrangement"
          value={job?.workplace_type ?? "unknown"}
          options={options(["unknown", "remote", "hybrid", "onsite"])}
        />
        <SelectField
          name="remote_scope"
          label="Published remote hiring scope"
          value={job?.remote_scope ?? "unknown"}
          options={options([
            "unknown",
            "worldwide",
            "country_restricted",
            "region_restricted",
          ])}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextArea
          name="eligible_countries"
          label="Explicitly eligible countries (if listed)"
          value={job?.eligible_countries.join(", ")}
          maxLength={5000}
          help="Use published evidence only. A remote label does not imply Pakistan eligibility."
        />
        <TextArea
          name="restricted_countries"
          label="Explicitly restricted countries (if listed)"
          value={job?.restricted_countries.join(", ")}
          maxLength={5000}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-4">
        <Field name="salary_min_original" label="Published minimum">
          <input
            className="input"
            id="salary_min_original"
            name="salary_min_original"
            type="number"
            min={0}
            step="0.01"
            defaultValue={
              job?.salary_min_original ?? job?.salary_min_annual ?? ""
            }
          />
        </Field>
        <Field name="salary_max_original" label="Published maximum">
          <input
            className="input"
            id="salary_max_original"
            name="salary_max_original"
            type="number"
            min={0}
            step="0.01"
            defaultValue={
              job?.salary_max_original ?? job?.salary_max_annual ?? ""
            }
          />
        </Field>
        <TextField
          name="salary_currency"
          label="Currency code"
          value={job?.salary_currency ?? ""}
          maxLength={3}
        />
        <SelectField
          name="salary_period"
          label="Pay period"
          value={job?.salary_period ?? "unknown"}
          options={options(["unknown", "hourly", "monthly", "annual"])}
        />
      </div>
      <p className="text-sm text-slate-600">
        Leave amounts empty if undisclosed. Hourly/monthly rates are preserved
        without assuming hours or exchange rates.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          name="listing_status"
          label="Listing status"
          value={job?.listing_status ?? "unknown"}
          options={options(["unknown", "active", "closed", "expired"])}
        />
        <TextField
          name="expires_at"
          label={`Closing time in ${timezone} (if known)`}
          type="datetime-local"
          value={dateTimeForInput(job?.expires_at ?? null, timezone)}
          help="Convert an employer’s stated closing time to your profile time zone. Leave ambiguous deadlines empty."
        />
      </div>
    </FormPanel>
  );
}
