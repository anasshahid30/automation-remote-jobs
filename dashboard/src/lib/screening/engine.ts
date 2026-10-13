import type { Tables } from "@/types/database";
import {
  defaultWeights,
  reviewSchema,
  weightsSchema,
  type Outcome,
  type Review,
} from "./schema";

export const EVALUATION_VERSION = "phase3.1";
export type Job = Pick<
  Tables<"jobs">,
  | "job_title"
  | "description"
  | "role_category"
  | "seniority"
  | "employment_type"
  | "workplace_type"
  | "remote_scope"
  | "eligible_countries"
  | "restricted_countries"
  | "salary_min_original"
  | "salary_max_original"
  | "salary_min_annual"
  | "salary_max_annual"
  | "salary_currency"
  | "salary_period"
  | "expires_at"
  | "listing_status"
> & { employer_region?: string };
export type Profile = Pick<
  Tables<"candidate_profiles">,
  | "country"
  | "salary_min_monthly"
  | "salary_currency"
  | "salary_unknown_policy"
  | "target_roles"
  | "target_seniority"
  | "target_regions"
  | "employment_types"
> & { scoring_weights?: unknown };

export function countryKey(value: string) {
  const key = value.toLowerCase().replace(/[.]/g, "").trim();
  return (
    (
      {
        pk: "pakistan",
        pak: "pakistan",
        usa: "united states",
        us: "united states",
        america: "united states",
        uk: "united kingdom",
        britain: "united kingdom",
        gb: "united kingdom",
        eu: "europe",
      } as Record<string, string>
    )[key] ?? key
  );
}

function positiveSentence(
  text: string,
  pattern: RegExp,
  allowOptional = false,
) {
  return text.split(/[.!?\n;,]|\bbut\b|\bhowever\b/i).some((sentence) => {
    return Array.from(
      sentence.matchAll(
        new RegExp(pattern.source, `${pattern.flags.replaceAll("g", "")}g`),
      ),
    ).some((match) => {
      const before =
        sentence
          .slice(0, match.index)
          .split(/\band\b/i)
          .at(-1) ?? "";
      if (/\b(?:not|no|without)\b/i.test(before)) return false;
      const clause = sentence.slice(match.index).split(/\band\b/i)[0];
      const optional =
        allowOptional &&
        /\boptional\b|\bnot required\b/i.test(clause) &&
        !/\bmust\b|\brequired\b|\bmandatory\b/i.test(
          clause.replace(/\bnot required\b/gi, ""),
        );
      return !optional;
    });
  });
}
const currencyTerms: Record<string, RegExp> = {
  USD: /\bUSD\b|US\s?\$|U\.?S\.? dollars/i,
  GBP: /\bGBP\b|£|British pounds/i,
  EUR: /\bEUR\b|€|euros/i,
  AUD: /\bAUD\b|A\$|Australian dollars/i,
  PKR: /\bPKR\b|Pakistani rupees/i,
  CAD: /\bCAD\b|C\$|Canadian dollars/i,
};
const periods: Record<string, RegExp> = {
  monthly: /\bmonth(?:ly)?\b|\bmo\b/i,
  annual: /\bannual(?:ly)?\b|\byear(?:ly)?\b|\byr\b|per annum/i,
  hourly: /\bhour(?:ly)?\b|\bhr\b/i,
};

export function evaluate(
  job: Job,
  profile: Profile,
  input: Review,
  candidateSkills: string[],
  now = new Date(),
) {
  const review = reviewSchema.parse(input);
  const weights = weightsSchema.parse(
    profile.scoring_weights ?? defaultWeights,
  );
  const source = `${job.job_title}\n${job.description}`;
  if (review.citations.some((c) => !source.includes(c.quote)))
    throw new Error(
      "Every quote must appear verbatim in the saved title or description.",
    );
  if (
    review.required_skills.some(
      (skill) => !source.toLowerCase().includes(skill.toLowerCase()),
    )
  )
    throw new Error(
      "Each required skill must appear in the saved source text.",
    );
  const proof = (kind: Review["citations"][number]["kind"]) =>
    review.source_checked
      ? (review.citations.find((c) => c.kind === kind)?.quote ?? "")
      : "";
  const reasons: string[] = [],
    checks: Record<string, Outcome> = {};
  const set = (key: string, outcome: Outcome, reason: string) => {
    checks[key] = outcome;
    if (outcome !== "pass") reasons.push(reason);
  };
  const country = countryKey(profile.country);
  const restrictionSource = source.replace(/\bU\.S\.(?:A\.)?/gi, "US");
  const remoteConflict = positiveSentence(
    restrictionSource,
    /\bhybrid\b|\bon[- ]?site\b|\bmust (?:attend|work (?:in|from)) (?:the |an )?office\b|\boffice attendance (?:is )?required\b|\brelocation (?:is )?required\b/i,
    true,
  );
  set(
    "remote",
    ["hybrid", "onsite"].includes(job.workplace_type) || remoteConflict
      ? "fail"
      : job.workplace_type === "remote" &&
          positiveSentence(
            proof("remote"),
            /fully remote|100% remote|no office attendance|required office attendance: none/i,
          )
        ? "pass"
        : "unknown",
    "Fully remote work is not established, or office/relocation attendance is required.",
  );
  const excludes =
    job.restricted_countries.some((c) => countryKey(c) === country) ||
    (job.remote_scope === "country_restricted" &&
      job.eligible_countries.length > 0 &&
      !job.eligible_countries.some((c) => countryKey(c) === country));
  const otherCountries = [
    { name: "united states", terms: "US|USA|United States" },
    { name: "united kingdom", terms: "UK|United Kingdom" },
    { name: "australia", terms: "Australia" },
    { name: "canada", terms: "Canada" },
    { name: "europe", terms: "EU|Europe" },
    { name: "india", terms: "India" },
  ];
  const textExcludes = otherCountries.some(
    (c) =>
      c.name !== country &&
      positiveSentence(
        restrictionSource,
        new RegExp(
          `\\b(?:${c.terms})[- ]only\\b|\\b(?:${c.terms}) (?:residents?|citizens?) only\\b|\\b(?:applicants|candidates|residents) (?:in|from) (?:the )?(?:${c.terms}) only\\b|\\bmust (?:be )?(?:reside|residing|based|live|living) in (?:the )?(?:${c.terms})\\b`,
          "i",
        ),
      ),
  );
  const escapedCountry = country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const countryExcluded = new RegExp(
    `\\b(?:excluding|except|not hiring|cannot hire|do not hire|not available in)\\s+${escapedCountry}\\b|\\b${escapedCountry} (?:is )?(?:excluded|not eligible|not supported)\\b`,
    "i",
  ).test(restrictionSource);
  const excludedList = Array.from(
    restrictionSource.matchAll(
      /\b(?:except|excluding|restricted countries(?: include)?|ineligible countries(?: include)?)[: ]+([^.!?\n;]+)/gi,
    ),
  ).some((match) =>
    match[1]
      .split(/[,/]|\band\b/i)
      .some((item) => countryKey(item.trim()) === country),
  );
  const ambiguousResidency = restrictionSource
    .split(/[.!?\n]/)
    .some((sentence) => {
      const match =
        /\bmust (?:be )?(?:reside|residing|based|live|living) in ([^;]+)/i.exec(
          sentence,
        );
      return Boolean(
        match &&
          countryKey(match[1].replace(/^the\s+/i, "").trim()) !== country,
      );
    });
  const countryProof = proof("country");
  const explicitlyIncluded = positiveSentence(
    countryProof,
    new RegExp(
      `\\b${escapedCountry}\\b|worldwide|all countries|anywhere in the world|globally`,
      "i",
    ),
  );
  const arrangement =
    job.employment_type === "contract"
      ? /contract(?:or|ors|ing)?|freelanc/i.test(countryProof)
      : !/contractor|contracting|freelanc/i.test(countryProof) &&
        (/employees? (?:worldwide|globally)|employer of record|\bEOR\b/i.test(
          countryProof,
        ) ||
          countryProof.toLowerCase().includes(country));
  set(
    "country",
    excludes || textExcludes || countryExcluded || excludedList
      ? "fail"
      : explicitlyIncluded && arrangement && !ambiguousResidency
        ? "pass"
        : "unknown",
    excludes || textExcludes || countryExcluded || excludedList
      ? `Published country/residency restrictions exclude a ${profile.country}-based applicant.`
      : "Your country and the stated employment arrangement need explicit hiring evidence; a remote label is insufficient.",
  );
  const roleTerms: Record<string, RegExp> = {
    backend: /back[- ]?end|server[- ]side/i,
    ai_automation:
      /\bAI\b|artificial intelligence|machine learning|automation/i,
    full_stack: /full[- ]?stack/i,
  };
  set(
    "role",
    job.role_category && !profile.target_roles.includes(job.role_category)
      ? "fail"
      : job.role_category && roleTerms[job.role_category]?.test(proof("role"))
        ? "pass"
        : "unknown",
    "Role relevance is outside your preferences or lacks source evidence.",
  );
  const seniorTitle = /\b(senior|sr\.?|lead|principal|staff|head of)\b/i.test(
    job.job_title,
  );
  const seniorTerms: Record<string, RegExp> = {
    junior: /\bjunior\b|\bentry[- ]level\b/i,
    mid: /\bmid[- ]?(?:level)?\b|\bintermediate\b/i,
  };
  set(
    "seniority",
    seniorTitle ||
      (job.seniority &&
        job.seniority !== "unknown" &&
        !profile.target_seniority.includes(job.seniority))
      ? "fail"
      : job.seniority && seniorTerms[job.seniority]?.test(proof("seniority"))
        ? "pass"
        : "unknown",
    "Seniority exceeds your preferences or requires clarification.",
  );
  const employmentTerms: Record<string, RegExp> = {
    contract: /contract(?:or|ors|ing)?|freelanc/i,
    full_time: /full[- ]time|employee|employment/i,
  };
  set(
    "employment",
    job.employment_type &&
      job.employment_type !== "unknown" &&
      !profile.employment_types.includes(job.employment_type)
      ? "fail"
      : job.employment_type &&
          employmentTerms[job.employment_type]?.test(proof("employment"))
        ? "pass"
        : "unknown",
    "Employment arrangement is outside your preferences or lacks evidence.",
  );
  const region = job.employer_region ?? "unknown";
  const regionTerms: Record<string, RegExp> = {
    USA: /\bUSA?\b|United States/i,
    UK: /\bUK\b|United Kingdom/i,
    Europe: /Europe|\bEU\b/i,
    Australia: /Australia/i,
  };
  set(
    "region",
    region !== "unknown" && !profile.target_regions.includes(region)
      ? "fail"
      : profile.target_regions.includes(region) &&
          regionTerms[region]?.test(proof("region"))
        ? "pass"
        : "unknown",
    "Employer region is outside your preferences or not evidenced.",
  );
  set(
    "listing",
    ["expired", "closed"].includes(job.listing_status) ||
      Boolean(job.expires_at && new Date(job.expires_at) <= now)
      ? "fail"
      : job.listing_status === "active" &&
          review.source_checked &&
          review.listing_checked
        ? "pass"
        : "unknown",
    "The listing is closed/expired or has not been checked as active.",
  );
  set(
    "qualifications",
    review.qualifications === "not_met"
      ? "fail"
      : review.source_checked && review.qualifications === "met"
        ? "pass"
        : "unknown",
    "Review all mandatory qualifications, experience and assessments against your verified facts.",
  );
  set(
    "authorization",
    review.authorization === "not_met"
      ? "fail"
      : review.source_checked &&
          review.authorization === "met" &&
          Boolean(proof("authorization"))
        ? "pass"
        : "unknown",
    "Residency, local work authorization and sponsorship require an explicit verified position.",
  );
  const skills = new Set(candidateSkills.map((s) => s.toLowerCase().trim()));
  const missing = review.required_skills.filter(
    (s) => !skills.has(s.toLowerCase()),
  );
  set(
    "skills",
    review.required_skills.length && (!proof("skills") || missing.length)
      ? "unknown"
      : review.source_checked && review.qualifications === "met"
        ? "pass"
        : "unknown",
    missing.length
      ? `Required skills not recorded on your masters: ${missing.join(", ")}.`
      : "Required skill evidence needs review.",
  );
  const min =
    job.salary_min_original ??
    (job.salary_period === "annual" ? job.salary_min_annual : null);
  const max =
    job.salary_max_original ??
    (job.salary_period === "annual" ? job.salary_max_annual : null);
  let multiplier: number | null =
    job.salary_period === "monthly"
      ? 1
      : job.salary_period === "annual"
        ? 1 / 12
        : null;
  if (
    job.salary_period === "hourly" &&
    review.hours_per_week &&
    review.weeks_per_year &&
    review.hours_note.length >= 10
  )
    multiplier = (review.hours_per_week * review.weeks_per_year) / 12;
  let fx: number | null =
    job.salary_currency === profile.salary_currency ? 1 : null;
  if (
    fx === null &&
    review.fx_rate &&
    review.fx_url &&
    review.fx_note.length >= 10 &&
    review.fx_date
  ) {
    const date = new Date(`${review.fx_date}T00:00:00Z`);
    if (date <= now && now.valueOf() - date.valueOf() <= 7 * 86400000)
      fx = review.fx_rate;
  }
  const monthlyMin =
    min !== null && multiplier !== null && fx !== null
      ? min * multiplier * fx
      : null;
  const monthlyMax =
    max !== null && multiplier !== null && fx !== null
      ? max * multiplier * fx
      : null;
  const payProof = proof("salary");
  const amounts = Array.from(
    payProof.replace(/,/g, "").matchAll(/\d+(?:\.\d+)?/g),
    (m) => Number(m[0]),
  );
  const payGrounded = Boolean(
    job.salary_currency &&
      (new RegExp(`\\b${job.salary_currency}(?=\\b|\\d)`, "i").test(payProof) ||
        currencyTerms[job.salary_currency]?.test(payProof)) &&
      periods[job.salary_period]?.test(payProof) &&
      (min === null || min === Math.min(...amounts)) &&
      (max === null || amounts.includes(max)),
  );
  set(
    "salary",
    min === null && max === null
      ? profile.salary_unknown_policy === "exclude"
        ? "fail"
        : "unknown"
      : monthlyMax !== null && monthlyMax < profile.salary_min_monthly
        ? "fail"
        : monthlyMin !== null &&
            monthlyMin >= profile.salary_min_monthly &&
            payGrounded
          ? "pass"
          : "unknown",
    min === null && max === null
      ? "Compensation is undisclosed; configured unknown-salary policy applies."
      : "Compensation is below the minimum, crosses it, lacks evidence, or needs explicit hours/FX assumptions.",
  );
  const value = (key: string) =>
    checks[key] === "pass" ? 1 : checks[key] === "unknown" ? 0.5 : 0;
  const skillFit = review.required_skills.length
    ? (review.required_skills.length - missing.length) /
      review.required_skills.length
    : value("skills");
  const factors = {
    relevance: 0.6 * value("role") + 0.4 * skillFit,
    seniority: value("seniority"),
    geography: (value("remote") + value("country")) / 2,
    compensation: value("salary"),
    employment: value("employment"),
  };
  const score =
    Math.round(
      Object.entries(factors).reduce(
        (sum, [key, v]) => sum + v * weights[key as keyof typeof weights],
        0,
      ) * 100,
    ) / 100;
  const decision = Object.values(checks).includes("fail")
    ? "INELIGIBLE"
    : Object.values(checks).includes("unknown")
      ? "NEEDS_REVIEW"
      : "ELIGIBLE";
  if (!reasons.length)
    reasons.push(
      "All screening gates pass using candidate-checked source evidence. This is not an employer confirmation.",
    );
  const validUntil = new Date(
    Math.min(
      now.valueOf() + 7 * 86400000,
      job.salary_currency !== profile.salary_currency &&
        fx !== null &&
        review.fx_date
        ? new Date(`${review.fx_date}T00:00:00Z`).valueOf() + 7 * 86400000
        : Infinity,
    ),
  ).toISOString();
  return {
    decision,
    remote_check: checks.remote,
    pakistan_eligibility: checks.country,
    salary_check: checks.salary,
    match_score: score,
    confidence:
      Math.round(
        (Object.values(checks).filter((v) => v !== "unknown").length /
          Object.keys(checks).length) *
          1000,
      ) / 1000,
    reasons,
    evidence_urls: Array.from(new Set(review.citations.map((c) => c.url))),
    evaluation_version: EVALUATION_VERSION,
    factors: {
      checks,
      weights,
      components: factors,
      missing_skills: missing,
      monthly_min: monthlyMin,
      monthly_max: monthlyMax,
      currency: profile.salary_currency,
      valid_until: validUntil,
      hourly_assumptions:
        job.salary_period === "hourly"
          ? {
              hours_per_week: review.hours_per_week,
              weeks_per_year: review.weeks_per_year,
              note: review.hours_note,
            }
          : null,
      fx:
        job.salary_currency !== profile.salary_currency
          ? {
              rate: fx,
              date: review.fx_date,
              url: review.fx_url,
              note: review.fx_note,
            }
          : null,
    },
  };
}
