import { describe, expect, it } from "vitest";
import {
  applicationSchema,
  httpsUrl,
  jobSchema,
  listText,
  localDateTime,
  profileSchema,
} from "./schemas";
import { compensation, dateTimeForInput, eventLabel } from "./format";

const profile = {
  full_name: "Test Fixture",
  email: "fixture@example.test",
  phone: "",
  country: "Pakistan",
  city: "Fixture City",
  salary_min_monthly: "1500",
  salary_currency: "USD",
  employment_types: ["full_time"],
  target_regions: ["Europe"],
  target_seniority: ["mid"],
  target_roles: ["backend"],
  work_authorization_notes: "",
  sponsorship_preferences: "",
  availability_notes: "",
  daily_target: "30",
  timezone: "Asia/Karachi",
  salary_unknown_policy: "needs_review",
};
const job = {
  canonical_url: "https://example.test/fixture",
  company_name: "Fixture Company",
  job_title: "Fixture Role",
  description: "Synthetic fixture only",
  source_platform: "manual",
  external_job_id: "",
  role_category: "backend",
  employment_type: "unknown",
  seniority: "unknown",
  workplace_type: "unknown",
  remote_scope: "unknown",
  eligible_countries: [],
  restricted_countries: [],
  salary_min_original: "",
  salary_max_original: "",
  salary_currency: "",
  salary_period: "unknown",
  listing_status: "unknown",
  expires_at: "",
};
const application = {
  resume_id: "",
  status: "draft",
  cover_letter: "",
  notes: "",
  follow_up_at: "",
  applied_at: "",
  confirmation_note: "",
  manual_confirm: false,
  last_error: "",
};
describe("candidate and CRM validation", () => {
  it("requires the real name and city and preserves the selected preferences", () => {
    expect(profileSchema.parse(profile).city).toBe("Fixture City");
    expect(profileSchema.safeParse({ ...profile, city: "" }).success).toBe(
      false,
    );
    expect(
      profileSchema.safeParse({ ...profile, full_name: " " }).success,
    ).toBe(false);
  });
  it("caps the goal at 30 and rejects invalid timezones and empty role selections", () => {
    for (const change of [
      { daily_target: 31 },
      { timezone: "invented/timezone" },
      { target_roles: [] },
    ])
      expect(profileSchema.safeParse({ ...profile, ...change }).success).toBe(
        false,
      );
  });
  it("keeps undisclosed compensation unknown", () => {
    const parsed = jobSchema.parse(job);
    expect(parsed.salary_min_original).toBeNull();
    expect(parsed.remote_scope).toBe("unknown");
    expect(
      compensation({
        ...parsed,
        salary_min_annual: null,
        salary_max_annual: null,
      }),
    ).toBe("Compensation undisclosed");
  });
  it("requires source units and a consistent pay range", () => {
    expect(
      jobSchema.safeParse({ ...job, salary_min_original: "40" }).success,
    ).toBe(false);
    expect(
      jobSchema.safeParse({
        ...job,
        salary_min_original: "40",
        salary_max_original: "30",
        salary_currency: "USD",
        salary_period: "hourly",
      }).success,
    ).toBe(false);
    const parsed = jobSchema.parse({
      ...job,
      salary_min_original: "40",
      salary_max_original: "60",
      salary_currency: "USD",
      salary_period: "hourly",
    });
    expect(
      compensation({
        ...parsed,
        salary_min_annual: null,
        salary_max_annual: null,
      }),
    ).toBe("USD 40–60 / hour");
  });
  it("rejects credential-bearing and non-HTTPS links", () => {
    for (const value of [
      "javascript:alert(1)",
      "http://example.test",
      "https://user:secret@example.test",
    ])
      expect(httpsUrl.safeParse(value).success).toBe(false);
  });
  it("rejects calendar rollover and UTC offsets in local inputs", () => {
    for (const value of [
      "2026-02-29T12:00",
      "2026-04-31T12:00",
      "2026-10-10T24:30",
      "2026-10-10T12:00Z",
    ])
      expect(localDateTime.safeParse(value).success).toBe(false);
    expect(localDateTime.parse("2028-02-29T12:00")).toBe("2028-02-29T12:00");
    expect(dateTimeForInput("2026-10-09T19:15:00Z", "Asia/Karachi")).toBe(
      "2026-10-10T00:15",
    );
  });
  it("never accepts an unsupported submission claim", () => {
    for (const status of ["submitted", "responded", "interview", "offer"])
      expect(
        applicationSchema.safeParse({ ...application, status }).success,
      ).toBe(false);
    expect(
      applicationSchema.safeParse({
        ...application,
        applied_at: "2026-10-09T12:00",
      }).success,
    ).toBe(false);
    expect(
      applicationSchema.safeParse({
        ...application,
        status: "submitted",
        applied_at: "2026-10-09T12:00",
        confirmation_note: "Synthetic fixture receipt",
        manual_confirm: true,
      }).success,
    ).toBe(true);
  });
  it("requires a resume for prepared packages and a reason for failures", () => {
    expect(
      applicationSchema.safeParse({ ...application, status: "prepared" })
        .success,
    ).toBe(false);
    expect(
      applicationSchema.safeParse({ ...application, status: "failed" }).success,
    ).toBe(false);
    expect(
      applicationSchema.safeParse({
        ...application,
        status: "failed",
        last_error: "Fixture connection failed",
      }).success,
    ).toBe(true);
  });
  it("deduplicates lists without silently accepting too many values", () => {
    expect(listText("Python, Python\nTypeScript")).toEqual([
      "Python",
      "TypeScript",
    ]);
    expect(
      jobSchema.safeParse({
        ...job,
        eligible_countries: listText(
          Array.from({ length: 51 }, (_, i) => `Country ${i}`).join(","),
        ),
      }).success,
    ).toBe(false);
  });
  it("distinguishes notes edits from status changes in activity history", () => {
    expect(
      eventLabel({
        event_type: "record_updated",
        details: { status: "draft" },
      }),
    ).toBe("Record edited · Draft");
    expect(
      eventLabel({
        event_type: "status_changed",
        details: { previous_status: "draft", status: "needs_review" },
      }),
    ).toBe("Draft → Needs review");
  });
});
