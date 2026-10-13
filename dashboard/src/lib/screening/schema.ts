import { z } from "zod";
import { httpsUrl, roles } from "../workspace/schemas";

export const evidenceKinds = [
  "remote",
  "country",
  "salary",
  "employment",
  "seniority",
  "role",
  "region",
  "skills",
  "authorization",
] as const;
export const defaultWeights = {
  relevance: 35,
  seniority: 20,
  geography: 20,
  compensation: 15,
  employment: 10,
};
export const weightsSchema = z
  .strictObject(
    Object.fromEntries(
      Object.keys(defaultWeights).map((key) => [
        key,
        z.coerce.number().min(0).max(100),
      ]),
    ) as { [K in keyof typeof defaultWeights]: z.ZodCoercedNumber<unknown> },
  )
  .refine(
    (value) =>
      Math.abs(Object.values(value).reduce((a, b) => a + b, 0) - 100) < 0.001,
    "Match weights must total 100.",
  );
export const reviewSchema = z
  .strictObject({
    citations: z
      .array(
        z.strictObject({
          kind: z.enum(evidenceKinds),
          url: httpsUrl,
          quote: z.string().trim().min(3).max(3000),
        }),
      )
      .max(9),
    source_checked: z.boolean(),
    listing_checked: z.boolean(),
    qualifications: z.enum(["unknown", "met", "not_met"]),
    authorization: z.enum(["unknown", "met", "not_met"]),
    authorization_note: z.string().trim().max(4000),
    required_skills: z.array(z.string().trim().min(1).max(100)).max(50),
    hours_per_week: z.number().positive().max(80).nullable(),
    weeks_per_year: z.number().positive().max(52).nullable(),
    hours_note: z.string().trim().max(2000),
    fx_rate: z.number().positive().max(1000000).nullable(),
    fx_date: z.iso.date().or(z.literal("")),
    fx_url: httpsUrl.or(z.literal("")),
    fx_note: z.string().trim().max(2000),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.citations.map((c) => c.kind)).size !==
      value.citations.length
    )
      context.addIssue({
        code: "custom",
        path: ["citations"],
        message: "Use one citation per category.",
      });
    if (value.authorization === "met" && value.authorization_note.length < 10)
      context.addIssue({
        code: "custom",
        path: ["authorization_note"],
        message: "Explain the verified authorization position; do not guess.",
      });
  });
export type Review = z.infer<typeof reviewSchema>;
export type Outcome = "pass" | "fail" | "unknown";
export const classificationSchema = z.strictObject({
  role_category: z.enum([...roles, "other", "unknown"]),
  seniority: z.enum(["junior", "mid", "senior", "other", "unknown"]),
  employment_type: z.enum(["full_time", "contract", "other", "unknown"]),
  confidence: z.number().min(0).max(1),
  citations: z
    .array(
      z.strictObject({
        field: z.enum(["role_category", "seniority", "employment_type"]),
        quote: z.string().min(3).max(1000),
      }),
    )
    .max(3),
});
export type Classification = z.infer<typeof classificationSchema>;
