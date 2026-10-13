import { z } from "zod";

export const categories = [
  "routine",
  "experience",
  "salary",
  "sponsorship",
  "legal",
  "assessment",
  "personal",
] as const;
export const sensitiveQuestion =
  /visa|sponsor|authori[sz]|right to work|legally|legal|clearance|attest|certify|assessment|\btest\b|relocat|salary|compensation|pay expectation|criminal|disabilit|gender|ethnic|veteran|medical|consent|agree|declar|citizen|residen|willing|commit|availability|start date|notice period|reference|background/i;
export const normalizeQuestion = (question: string) =>
  question
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const answerSchema = z.object({
  question: z.string().trim().min(3).max(500),
  answer: z.string().trim().min(1).max(5000),
  category: z.enum(categories),
});
export const preparationSchema = z.object({
  resume_id: z.uuid(),
  job_excerpt: z.string().trim().min(3).max(1000),
  resume_excerpt: z.string().trim().min(3).max(1500),
  questions: z.array(z.string().trim().min(3).max(500)).max(20),
});
export const packageSchema = z.object({
  engine_version: z.literal("phase4.1"),
  company: z.string(),
  title: z.string(),
  candidate_name: z.string(),
  resume_version: z.string(),
  resume_text: z.string().min(1).max(65000),
  cover_letter: z.string().max(5000),
  source_resume_text: z.string().max(60000),
  job_excerpt: z.string(),
  resume_excerpt: z.string(),
  answers: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string().nullable(),
        category: z.enum(categories),
        requires_review: z.boolean(),
        source: z.string(),
      }),
    )
    .max(20),
  warnings: z.array(z.string()),
});
export type Package = z.infer<typeof packageSchema>;
export type LibraryAnswer = {
  id: string;
  question_pattern: string;
  answer_text: string;
  category: string;
  requires_review: boolean;
  verified_by_candidate: boolean;
  updated_at: string;
};
export type Contact = {
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  country: string;
};

export function classifyQuestion(
  question: string,
): (typeof categories)[number] {
  if (/visa|sponsor|authori[sz]|right to work|citizen/i.test(question))
    return "sponsorship";
  if (/salary|compensation|pay expectation/i.test(question)) return "salary";
  if (/assessment|\btest\b/i.test(question)) return "assessment";
  if (sensitiveQuestion.test(question)) return "legal";
  if (/experience|skill|project|background/i.test(question))
    return "experience";
  return "routine";
}
export function answerQuestion(
  question: string,
  profile: Contact,
  library: LibraryAnswer[],
) {
  const normalized = normalizeQuestion(question),
    inferred = classifyQuestion(question);
  const routineKeys = new Set(["full name", "what is your full name", "email", "email address", "phone number", "current city", "current country", "current location"]);
  const matches = library.filter(
    (row) =>
      normalizeQuestion(row.question_pattern) === normalized &&
      row.verified_by_candidate,
  );
  // Never apply pattern fragments or treat employer instructions as matching logic.
  if (matches.length === 1) {
    const row = matches[0],
      parsed = z.enum(categories).safeParse(row.category),
      category = sensitiveQuestion.test(question) ? inferred : parsed.success ? parsed.data : inferred;
    return {
      question,
      answer: row.answer_text,
      category,
      requires_review:
        row.requires_review ||
        sensitiveQuestion.test(question) ||
        category !== "routine" ||
        !routineKeys.has(normalized),
      source: `Verified answer ${row.id} (${row.updated_at})`,
    };
  }
  if (matches.length > 1) return {question,answer:null,category:inferred,requires_review:true,source:"Conflicting verified answers; resolve the library"};
  const routine: Record<string, string | null> = {
    "full name": profile.full_name,
    "what is your full name": profile.full_name,
    email: profile.email,
    "email address": profile.email,
    "phone number": profile.phone,
    "current city": profile.city,
    "current country": profile.country,
    "current location": [profile.city, profile.country]
      .filter(Boolean)
      .join(", "),
  };
  if (!sensitiveQuestion.test(question) && routine[normalized])
    return {
      question,
      answer: routine[normalized],
      category: "routine" as const,
      requires_review: false,
      source: "Candidate profile",
    };
  return {
    question,
    answer: null,
    category: inferred,
    requires_review: true,
    source:
      matches.length > 1
        ? "Conflicting verified answers; resolve the library"
        : "No exact verified answer; candidate input required",
  };
}
export function recommendResume<
  T extends {
    id: string;
    role_category: string;
    is_master: boolean;
    skills: string[];
  },
>(role: string | null, description: string, resumes: T[]): T | null {
  if (!role) return null;
  const options = resumes.filter(
    (r) => r.role_category === role && r.is_master,
  );
  return (
    options.sort(
      (a, b) =>
        b.skills.filter((s) =>
          description.toLowerCase().includes(s.toLowerCase()),
        ).length -
          a.skills.filter((s) =>
            description.toLowerCase().includes(s.toLowerCase()),
          ).length || a.id.localeCompare(b.id),
    )[0] ?? null
  );
}
export function generatePackage(input: {
  company: string;
  title: string;
  profile: Contact;
  resume_version: string;
  resume_text: string;
  job_description: string;
  job_title: string;
  job_excerpt: string;
  resume_excerpt: string;
  questions: string[];
  library: LibraryAnswer[];
  role_matches: boolean;
}): Package {
  if (
    !`${input.job_title}\n${input.job_description}`.includes(input.job_excerpt)
  )
    throw new Error("Choose an exact excerpt from the saved job description.");
  if (!input.resume_text.includes(input.resume_excerpt))
    throw new Error("Choose an exact excerpt from your verified resume text.");
  const answers = input.questions.map((q) =>
    answerQuestion(q, input.profile, input.library),
  );
  const warnings = answers
    .filter((a) => a.requires_review)
    .map(
      (a) =>
        `${a.question}: ${a.answer ? "Candidate review required" : "Unanswered; add an exact verified answer"}`,
    );
  if (!input.role_matches)
    warnings.push(
      "Selected resume role differs from the saved job role; review the selection.",
    );
  // Extractive generation: every experience claim is an unchanged source quotation.
  const resume_text = `RELEVANT EXPERIENCE — SOURCE EXCERPT\n${input.resume_excerpt}\n\nFULL VERIFIED RESUME\n${input.resume_text}`;
  const cover_letter = `Dear ${input.company} hiring team,\n\nI am applying for ${input.title}. Your listing states:\n“${input.job_excerpt}”\n\nMy resume includes this relevant experience:\n“${input.resume_excerpt}”\n\nI would welcome the opportunity to discuss this experience in relation to your requirements.\n\n${input.profile.full_name}`;
  return packageSchema.parse({
    engine_version: "phase4.1",
    company: input.company,
    title: input.title,
    candidate_name: input.profile.full_name,
    resume_version: input.resume_version,
    resume_text,
    cover_letter,
    source_resume_text: input.resume_text,
    job_excerpt: input.job_excerpt,
    resume_excerpt: input.resume_excerpt,
    answers,
    warnings,
  });
}
