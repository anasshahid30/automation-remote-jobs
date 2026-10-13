import { profileContext } from "@/lib/workspace/auth";
import { FormPanel } from "@/components/form-panel";
import { Field, TextArea, TextField, SelectField } from "@/components/fields";
import { roles, roleLabels } from "@/lib/workspace/schemas";
import { defaultWeights, weightsSchema } from "@/lib/screening/schema";
import { saveProfile } from "./actions";

function Choices({
  name,
  label,
  options,
  selected,
}: {
  name: string;
  label: string;
  options: readonly (readonly [string, string])[];
  selected: string[];
}) {
  return (
    <fieldset id={name}>
      <legend className="mb-3 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-4">
        {options.map(([value, text]) => (
          <label
            key={value}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
          >
            <input
              type="checkbox"
              name={name}
              value={value}
              defaultChecked={selected.includes(value)}
            />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export default async function Settings() {
  const { profile, user } = await profileContext();
  const parsedWeights = weightsSchema.safeParse(profile?.scoring_weights);
  const weights = parsedWeights.success ? parsedWeights.data : defaultWeights;
  return (
    <>
      <h1 className="page-title">Candidate settings</h1>
      <p className="mt-3 mb-8 max-w-2xl text-slate-600">
        Keep your real details and preferences in one place. Work authorization
        and sponsorship notes are your statements, not automatic legal
        conclusions.
      </p>
      <section className="panel">
        <FormPanel action={saveProfile} id="profile-form" label="Save profile">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="full_name"
              label="Full name"
              value={profile?.full_name}
              required
            />
            <TextField
              name="email"
              label="Contact email"
              type="email"
              value={profile?.email ?? user.email}
              required
              maxLength={254}
            />
            <TextField
              name="phone"
              label="Phone (optional)"
              type="tel"
              value={profile?.phone}
              maxLength={50}
            />
            <TextField
              name="country"
              label="Current country"
              value={profile?.country ?? "Pakistan"}
              required
              maxLength={100}
            />
            <TextField
              name="city"
              label="Your real city"
              value={profile?.city}
              required
              maxLength={120}
            />
            <TextField
              name="timezone"
              label="Daily reporting time zone"
              value={profile?.timezone ?? "Asia/Karachi"}
              required
              maxLength={100}
              help="For example, Asia/Karachi. Follow-ups and submission times use this time zone."
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field
              name="salary_min_monthly"
              label="Minimum monthly compensation"
            >
              <input
                className="input"
                type="number"
                id="salary_min_monthly"
                name="salary_min_monthly"
                min={0}
                step="0.01"
                defaultValue={profile?.salary_min_monthly ?? 1500}
                required
              />
            </Field>
            <TextField
              name="salary_currency"
              label="Currency code"
              value={profile?.salary_currency ?? "USD"}
              required
              maxLength={3}
            />
            <Field name="daily_target" label="Daily application goal (1–30)">
              <input
                className="input"
                id="daily_target"
                name="daily_target"
                type="number"
                min={1}
                max={30}
                defaultValue={profile?.daily_target ?? 30}
                required
              />
            </Field>
          </div>
          <SelectField
            name="salary_unknown_policy"
            label="When compensation is undisclosed"
            value={profile?.salary_unknown_policy ?? "needs_review"}
            options={[
              ["needs_review", "Require review"],
              ["exclude", "Exclude from future screening"],
            ]}
          />
          <Choices
            name="employment_types"
            label="Employment arrangements"
            options={[
              ["full_time", "Full-time employment"],
              ["contract", "Contract"],
            ]}
            selected={profile?.employment_types ?? ["full_time", "contract"]}
          />
          <Choices
            name="target_regions"
            label="Target employer regions"
            options={["USA", "UK", "Europe", "Australia"].map((value) => [
              value,
              value,
            ])}
            selected={
              profile?.target_regions ?? ["USA", "UK", "Europe", "Australia"]
            }
          />
          <p className="text-sm text-slate-600">
            An employer’s region does not establish eligibility for a
            Pakistan-based applicant. Screening begins in Phase 3.
          </p>
          <Choices
            name="target_seniority"
            label="Seniority"
            options={[
              ["junior", "Junior"],
              ["mid", "Mid-level"],
            ]}
            selected={profile?.target_seniority ?? ["junior", "mid"]}
          />
          <Choices
            name="target_roles"
            label="Role categories"
            options={roles.map((value) => [value, roleLabels[value]])}
            selected={profile?.target_roles ?? [...roles]}
          />
          <fieldset className="rounded-lg border p-5">
            <legend className="px-2 font-semibold">
              Match score weights (total 100)
            </legend>
            <p className="mb-4 text-sm text-slate-600">
              Adjust relevance, seniority, geography, compensation and
              employment importance. Failed requirements always override the
              score. Changing settings invalidates earlier screening.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {Object.entries(weights).map(([key, value]) => (
                <Field
                  key={key}
                  name={`weight_${key}`}
                  label={key.charAt(0).toUpperCase() + key.slice(1)}
                >
                  <input
                    className="input"
                    type="number"
                    id={`weight_${key}`}
                    name={`weight_${key}`}
                    min="0"
                    max="100"
                    step="0.01"
                    required
                    defaultValue={value}
                  />
                </Field>
              ))}
            </div>
          </fieldset>
          <p className="rounded-lg bg-emerald-50 p-4 text-sm">
            Fully remote only. Automation is paused; this phase does not submit
            applications.
          </p>
          <TextArea
            name="work_authorization_notes"
            label="Verified work authorization notes (optional)"
            value={profile?.work_authorization_notes}
            maxLength={4000}
          />
          <TextArea
            name="sponsorship_preferences"
            label="Sponsorship preferences (optional)"
            value={profile?.sponsorship_preferences}
            maxLength={4000}
          />
          <TextArea
            name="availability_notes"
            label="Availability notes (optional)"
            value={profile?.availability_notes}
            maxLength={4000}
          />
        </FormPanel>
      </section>
      <section className="panel mt-8">
        <h2 className="text-xl font-semibold">Source integrations</h2>
        <p className="mt-3 text-slate-600">
          LinkedIn, Wellfound, Greenhouse, Lever and employer career pages: not
          connected. You can save listing details manually and open the original
          form.
        </p>
      </section>
    </>
  );
}
