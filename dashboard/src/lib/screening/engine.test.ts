import { describe, expect, it } from "vitest";
import { evaluate, type Job, type Profile } from "./engine";
import { defaultWeights, type Review } from "./schema";
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
const now = new Date("2026-10-13T14:00:00Z");
function run(
  j: Partial<Job> = {},
  r: Partial<Review> = {},
  p: Partial<Profile> = {},
) {
  return evaluate(
    { ...job, ...j },
    { ...profile, ...p },
    { ...review, ...r },
    ["Python"],
    now,
  );
}
describe("evidence-based deterministic screening", () => {
  it("does not affirm a negated fully-remote quotation", () => {
    const quote = "No fully remote option";
    const result = run(
      { description: text.replace("Fully remote", quote) },
      {
        citations: review.citations.map((c) =>
          c.kind === "remote" ? { ...c, quote } : c,
        ),
      },
    );
    expect(result.remote_check).toBe("unknown");
    expect(result.decision).toBe("NEEDS_REVIEW");
  });
  it("does not affirm a negated country-acceptance quotation", () => {
    const quote = "Not hiring contractors in Pakistan";
    const result = run(
      {
        description: text.replace(
          "Hiring independent contractors worldwide, including Pakistan",
          quote,
        ),
      },
      {
        citations: review.citations.map((c) =>
          c.kind === "country" ? { ...c, quote } : c,
        ),
      },
    );
    expect(result.pakistan_eligibility).not.toBe("pass");
    expect(result.decision).not.toBe("ELIGIBLE");
  });
  it("does not accept a range maximum copied into the minimum field", () => {
    const quote = "Compensation USD 1,000–3,000 per month";
    const result = run(
      {
        description: text.replace("Compensation USD 2,000 per month", quote),
        salary_min_original: 3000,
      },
      {
        citations: review.citations.map((c) =>
          c.kind === "salary" ? { ...c, quote } : c,
        ),
      },
    );
    expect(result.salary_check).toBe("unknown");
    expect(result.decision).toBe("NEEDS_REVIEW");
  });
  it("recognizes explicit ISO currencies and abbreviated source periods", () => {
    const quote = "Compensation CHF2000/mo";
    const result = run(
      {
        description: text.replace("Compensation USD 2,000 per month", quote),
        salary_currency: "CHF",
      },
      {
        citations: review.citations.map((c) =>
          c.kind === "salary" ? { ...c, quote } : c,
        ),
        fx_rate: 1.1,
        fx_date: "2026-10-13",
        fx_url: "https://example.test/fx",
        fx_note: "Synthetic sourced CHF to USD quote.",
      },
    );
    expect(result.salary_check).toBe("pass");
    expect(result.factors.monthly_min).toBe(2200);
  });
  it.each([
    "Onsite work is required and hybrid visits are optional.",
    "Hybrid visits are optional and onsite work is mandatory.",
  ])(
    "does not let optional visits hide a required workplace restriction",
    (restriction) =>
      expect(run({ description: text + "\n" + restriction }).decision).toBe(
        "INELIGIBLE",
      ),
  );
  it("accepts fully remote work with explicitly optional office visits", () =>
    expect(
      run({ description: text + "\nHybrid office visits are optional." })
        .decision,
    ).toBe("ELIGIBLE"));
  it("recognizes country exclusions in lists and aliases", () =>
    expect(
      run({
        description: text + "\nWorldwide except Iran, PK and North Korea.",
      }).decision,
    ).toBe("INELIGIBLE"));
  it("expires a converted result when its older FX quote expires", () => {
    const quote = "Compensation EUR 2,000 per month";
    const result = run(
      {
        description: text.replace("Compensation USD 2,000 per month", quote),
        salary_currency: "EUR",
      },
      {
        citations: review.citations.map((c) =>
          c.kind === "salary" ? { ...c, quote } : c,
        ),
        fx_rate: 1.1,
        fx_date: "2026-10-07",
        fx_url: "https://example.test/fx",
        fx_note: "Synthetic dated EUR to USD quote.",
      },
    );
    expect(result.factors.valid_until).toBe("2026-10-14T00:00:00.000Z");
  });
  it("accepts evidenced fully remote international contracting", () => {
    const result = run();
    expect(result.decision).toBe("ELIGIBLE");
    expect(result.match_score).toBe(100);
    expect(result.factors.monthly_min).toBe(2000);
  });
  it.each([
    "US-only role",
    "U.S.-only role",
    "US residents only",
    "Must reside in the United States",
  ])("rejects %s despite a high score", (restriction) => {
    const result = run({ description: text + "\n" + restriction });
    expect(result.decision).toBe("INELIGIBLE");
    expect(result.match_score).toBeGreaterThan(60);
  });
  it("does not turn generic international language into Pakistan acceptance", () => {
    const changed = text.replace(
      "Hiring independent contractors worldwide, including Pakistan",
      "International company with remote roles",
    );
    expect(
      run(
        { description: changed },
        { citations: review.citations.filter((c) => c.kind !== "country") },
      ).decision,
    ).toBe("NEEDS_REVIEW");
  });
  it("does not trust unchecked or ungrounded evidence", () => {
    expect(run({}, { source_checked: false }).decision).toBe("NEEDS_REVIEW");
    expect(() =>
      run(
        {},
        {
          citations: [
            {
              kind: "country",
              quote: "Invented statement",
              url: "https://example.test",
            },
          ],
        },
      ),
    ).toThrow();
  });
  it.each([
    "hybrid attendance",
    "Office attendance is required",
    "Relocation is required",
  ])("rejects office restriction %s", (restriction) =>
    expect(run({ description: text + "\n" + restriction }).decision).toBe(
      "INELIGIBLE",
    ),
  );
  it("does not treat negated restrictions as mandatory office attendance", () =>
    expect(
      run({ description: text + "\nNo hybrid work. Not US-only." }).decision,
    ).toBe("ELIGIBLE"));
  it("requires review for an unrecognized local residency clause", () =>
    expect(
      run({ description: text + "\nMust reside in Germany." }).decision,
    ).toBe("NEEDS_REVIEW"));
  it("rejects explicit Pakistan exclusions", () =>
    expect(run({ description: text + "\nExcept Pakistan." }).decision).toBe(
      "INELIGIBLE",
    ));
  it("does not let an unrelated negation hide a residency exclusion", () =>
    expect(
      run({
        description: text + "\nNo sponsorship provided, must reside in the US.",
      }).decision,
    ).toBe("INELIGIBLE"));
  it.each([
    { listing_status: "closed" },
    { listing_status: "expired" },
    { expires_at: "2026-10-12T00:00:00Z" },
  ])("rejects closed or expired listings", (change) =>
    expect(run(change).decision).toBe("INELIGIBLE"),
  );
  it("requires a current source check rather than assuming active", () =>
    expect(run({}, { listing_checked: false }).decision).toBe("NEEDS_REVIEW"));
  it("keeps unknown compensation unknown and respects the exclusion policy", () => {
    expect(run({ salary_min_original: null }).salary_check).toBe("unknown");
    expect(
      run(
        { salary_min_original: null },
        {},
        { salary_unknown_policy: "exclude" },
      ).decision,
    ).toBe("INELIGIBLE");
  });
  it("converts annual compensation to monthly without changing original data", () => {
    const quote = "Compensation USD 24,000 per year";
    const result = run(
      {
        description: text.replace("Compensation USD 2,000 per month", quote),
        salary_min_original: 24000,
        salary_period: "annual",
      },
      {
        citations: review.citations.map((c) =>
          c.kind === "salary" ? { ...c, quote } : c,
        ),
      },
    );
    expect(result.factors.monthly_min).toBe(2000);
    expect(result.salary_check).toBe("pass");
  });
  it("does not invent working hours for hourly rates", () => {
    const quote = "Compensation USD 20 per hour";
    const j = {
      description: text.replace("Compensation USD 2,000 per month", quote),
      salary_min_original: 20,
      salary_period: "hourly",
    };
    const r = {
      citations: review.citations.map((c) =>
        c.kind === "salary" ? { ...c, quote } : c,
      ),
    };
    expect(run(j, r).salary_check).toBe("unknown");
    expect(
      run(j, {
        ...r,
        hours_per_week: 40,
        weeks_per_year: 52,
        hours_note: "Explicit candidate assumption: 40 hours, 52 weeks.",
      }).factors.monthly_min,
    ).toBeCloseTo(3466.6667, 3);
  });
  it("requires dated sourced FX and preserves the conversion direction", () => {
    const quote = "Compensation EUR 2,000 per month";
    const j = {
      description: text.replace("Compensation USD 2,000 per month", quote),
      salary_currency: "EUR",
    };
    const r = {
      citations: review.citations.map((c) =>
        c.kind === "salary" ? { ...c, quote } : c,
      ),
    };
    expect(run(j, r).salary_check).toBe("unknown");
    expect(
      run(j, {
        ...r,
        fx_rate: 1.1,
        fx_date: "2026-10-13",
        fx_url: "https://example.test/fx",
        fx_note: "One EUR converts to 1.1 USD; synthetic quote.",
      }).factors.monthly_min,
    ).toBe(2200);
    expect(
      run(j, {
        ...r,
        fx_rate: 1.1,
        fx_date: "2026-01-01",
        fx_url: "https://example.test/fx",
        fx_note: "Old synthetic rate",
      }).salary_check,
    ).toBe("unknown");
  });
  it("requires source pay units and amounts to agree", () =>
    expect(run({ salary_min_original: 5000 }).salary_check).toBe("unknown"));
  it("does not treat a high upper salary as a guaranteed minimum", () =>
    expect(
      run({ salary_min_original: 1000, salary_max_original: 3000 })
        .salary_check,
    ).toBe("unknown"));
  it("lowers the score and requests review when skills are absent from masters", () => {
    const result = evaluate(job, profile, review, [], now);
    expect(result.decision).toBe("NEEDS_REVIEW");
    expect(result.match_score).toBe(86);
    expect(result.factors.missing_skills).toEqual(["Python"]);
  });
  it("rejects senior roles and unmet mandatory qualifications", () => {
    expect(run({ job_title: "Senior Backend Developer" }).decision).toBe(
      "INELIGIBLE",
    );
    expect(run({}, { qualifications: "not_met" }).decision).toBe("INELIGIBLE");
  });
  it("does not guess authorization from a remote label", () =>
    expect(run({}, { authorization: "unknown" }).decision).toBe(
      "NEEDS_REVIEW",
    ));
  it("keeps international contracting evidence separate from employee eligibility", () =>
    expect(run({ employment_type: "full_time" }).pakistan_eligibility).toBe(
      "unknown",
    ));
  it("validates configurable weights and keeps hard exclusions in force", () => {
    expect(() =>
      run({}, {}, { scoring_weights: { ...defaultWeights, relevance: 100 } }),
    ).toThrow();
    expect(
      run(
        { description: text + "\nUS-only role" },
        {},
        {
          scoring_weights: {
            relevance: 100,
            seniority: 0,
            geography: 0,
            compensation: 0,
            employment: 0,
          },
        },
      ).decision,
    ).toBe("INELIGIBLE");
  });
});
