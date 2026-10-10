import { z } from "zod";

export const roles = ["backend", "ai_automation", "full_stack"] as const;
export const statuses = [
  "draft",
  "needs_review",
  "approved",
  "prepared",
  "submitted",
  "failed",
  "responded",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export const roleLabels: Record<string, string> = {
  backend: "Backend",
  ai_automation: "AI / automation",
  full_stack: "Full-stack",
  other: "Other",
};
export const statusLabels: Record<string, string> = {
  draft: "Draft",
  needs_review: "Needs review",
  approved: "Approved manually",
  prepared: "Prepared",
  submitted: "Submitted manually",
  failed: "Failed",
  responded: "Response received",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  text(max).transform((value) => value || null);
const numberOrNull = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z.coerce.number().min(0).max(999999999999).nullable(),
);
export const uuid = z.uuid();
export const localDateTime = z.string().refine((value) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return false;
  const normalized = value.length === 16 ? `${value}:00` : value;
  const parsed = new Date(`${normalized}Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 19) === normalized
  );
}, "Enter a valid date and time.");
export const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        Boolean(u.hostname)
      );
    } catch {
      return false;
    }
  }, "Enter an HTTPS listing URL without login credentials.");
export const listText = (value: string, maximum = 50) =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, maximum + 1);

export const profileSchema = z.object({
  full_name: text(200).min(1, "Enter your real full name."),
  email: z.email().max(254),
  phone: optionalText(50),
  country: text(100).min(1),
  city: text(120).min(1, "Enter your real city."),
  salary_min_monthly: z.coerce.number().min(0).max(9999999999),
  salary_currency: z.string().regex(/^[A-Z]{3}$/),
  employment_types: z
    .array(z.enum(["full_time", "contract"]))
    .min(1)
    .max(2),
  target_regions: z
    .array(z.enum(["USA", "UK", "Europe", "Australia"]))
    .min(1)
    .max(4),
  target_seniority: z
    .array(z.enum(["junior", "mid"]))
    .min(1)
    .max(2),
  target_roles: z.array(z.enum(roles)).min(1).max(3),
  work_authorization_notes: optionalText(4000),
  sponsorship_preferences: optionalText(4000),
  availability_notes: optionalText(4000),
  daily_target: z.coerce.number().int().min(1).max(30),
  timezone: text(100).refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Select a valid IANA time zone."),
  salary_unknown_policy: z.enum(["needs_review", "exclude"]),
});

export const jobSchema = z
  .object({
    canonical_url: httpsUrl,
    company_name: text(200).min(1),
    job_title: text(200).min(1),
    description: text(100000).min(1),
    source_platform: z.enum([
      "manual",
      "linkedin",
      "wellfound",
      "greenhouse",
      "lever",
      "career_page",
      "other",
    ]),
    external_job_id: optionalText(300),
    role_category: z.enum([...roles, "other"]),
    employment_type: z.enum(["full_time", "contract", "other", "unknown"]),
    seniority: z.enum(["junior", "mid", "senior", "other", "unknown"]),
    workplace_type: z.enum(["remote", "hybrid", "onsite", "unknown"]),
    remote_scope: z.enum([
      "worldwide",
      "country_restricted",
      "region_restricted",
      "unknown",
    ]),
    eligible_countries: z.array(text(100)).max(50),
    restricted_countries: z.array(text(100)).max(50),
    salary_min_original: numberOrNull,
    salary_max_original: numberOrNull,
    salary_currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .or(z.literal("")),
    salary_period: z.enum(["hourly", "monthly", "annual", "unknown"]),
    listing_status: z.enum(["active", "expired", "closed", "unknown"]),
    expires_at: localDateTime,
  })
  .superRefine((value, context) => {
    if (
      value.salary_min_original != null &&
      value.salary_max_original != null &&
      value.salary_max_original < value.salary_min_original
    )
      context.addIssue({
        code: "custom",
        path: ["salary_max_original"],
        message: "Maximum compensation must be at least the minimum.",
      });
    if (
      (value.salary_min_original != null ||
        value.salary_max_original != null) &&
      (!value.salary_currency || value.salary_period === "unknown")
    )
      context.addIssue({
        code: "custom",
        path: ["salary_currency"],
        message: "Provide currency and pay period for disclosed compensation.",
      });
  });

export const resumeSchema = z.object({
  role_category: z.enum(roles),
  version_name: text(200).min(1),
  skills: z.array(text(100)).max(50),
  experience_summary: optionalText(10000),
});

export const applicationSchema = z
  .object({
    resume_id: z.uuid().or(z.literal("")),
    status: z.enum(statuses),
    cover_letter: optionalText(20000),
    notes: text(20000),
    follow_up_at: localDateTime,
    applied_at: localDateTime,
    confirmation_note: text(2000),
    manual_confirm: z.boolean(),
    last_error: optionalText(3000),
  })
  .superRefine((value, context) => {
    if (
      ["submitted", "responded", "interview", "offer"].includes(value.status) &&
      (!value.applied_at || !value.confirmation_note || !value.manual_confirm)
    )
      context.addIssue({
        code: "custom",
        path: ["manual_confirm"],
        message:
          "Confirm the real submission, its time, and the receipt/reference. This only records your report.",
      });
    if (value.status === "prepared" && !value.resume_id)
      context.addIssue({
        code: "custom",
        path: ["resume_id"],
        message: "Choose a resume version before marking the package prepared.",
      });
    if (value.status === "failed" && !value.last_error)
      context.addIssue({
        code: "custom",
        path: ["last_error"],
        message: "Describe the actual failure.",
      });
    if (value.applied_at && (!value.confirmation_note || !value.manual_confirm))
      context.addIssue({
        code: "custom",
        path: ["manual_confirm"],
        message:
          "Submission dates require an explicit confirmation and reference.",
      });
  });

export function values(form: FormData, names: readonly string[]) {
  return Object.fromEntries(
    names.map((name) => [name, String(form.get(name) ?? "")]),
  );
}
export function failure(error: z.ZodError): ActionState {
  return {
    message: "Please correct the highlighted fields.",
    errors: z.flattenError(error).fieldErrors,
    ok: false,
  };
}
export type ActionState = {
  message: string;
  ok?: boolean;
  errors?: Record<string, string[] | undefined>;
};
