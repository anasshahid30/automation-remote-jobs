// Synthetic test fixture only; never loaded by application routes.
import type { Job, Profile } from "../screening/engine";
import { defaultWeights, type Review } from "../screening/schema";
export const text =
  "Fully remote backend contract. Hiring independent contractors worldwide, including Pakistan. Mid-level. Employer based in USA. Compensation USD 2,000 per month. Python required. No local work authorization or relocation required. Applications currently open.";
export const job: Job = {
  job_title: "Mid-level Backend Developer",
  description: text,
  role_category: "backend",
  seniority: "mid",
  employment_type: "contract",
  workplace_type: "remote",
  remote_scope: "worldwide",
  eligible_countries: ["Pakistan"],
  restricted_countries: [],
  salary_min_original: 2000,
  salary_max_original: null,
  salary_min_annual: null,
  salary_max_annual: null,
  salary_currency: "USD",
  salary_period: "monthly",
  expires_at: null,
  listing_status: "active",
  employer_region: "USA",
};
export const profile: Profile = {
  country: "Pakistan",
  salary_min_monthly: 1500,
  salary_currency: "USD",
  salary_unknown_policy: "needs_review",
  target_roles: ["backend", "ai_automation", "full_stack"],
  target_seniority: ["junior", "mid"],
  target_regions: ["USA", "UK", "Europe", "Australia"],
  employment_types: ["full_time", "contract"],
  scoring_weights: defaultWeights,
};
export const review: Review = {
  citations: [
    { kind: "remote", quote: "Fully remote", url: "https://example.test/job" },
    {
      kind: "country",
      quote: "Hiring independent contractors worldwide, including Pakistan",
      url: "https://example.test/job",
    },
    { kind: "role", quote: "backend", url: "https://example.test/job" },
    { kind: "seniority", quote: "Mid-level", url: "https://example.test/job" },
    { kind: "employment", quote: "contract", url: "https://example.test/job" },
    {
      kind: "region",
      quote: "Employer based in USA",
      url: "https://example.test/job",
    },
    {
      kind: "salary",
      quote: "Compensation USD 2,000 per month",
      url: "https://example.test/job",
    },
    {
      kind: "skills",
      quote: "Python required",
      url: "https://example.test/job",
    },
    {
      kind: "authorization",
      quote: "No local work authorization or relocation required",
      url: "https://example.test/job",
    },
  ],
  source_checked: true,
  listing_checked: true,
  qualifications: "met",
  authorization: "met",
  authorization_note:
    "Source states no local work authorization or relocation is required for this contractor arrangement.",
  required_skills: ["Python"],
  hours_per_week: null,
  weeks_per_year: null,
  hours_note: "",
  fx_rate: null,
  fx_date: "",
  fx_url: "",
  fx_note: "",
};
