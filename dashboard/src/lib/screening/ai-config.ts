import "server-only";
import { z } from "zod";
import type { ClassifierConfig } from "./ai";

export function classifierConfig(): ClassifierConfig | null {
  if (
    process.env.AI_CLASSIFICATION_ENABLED !== "true" ||
    !process.env.OPENAI_API_KEY
  )
    return null;
  const parsed = z
    .object({
      key: z.string().min(10),
      model: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/),
      temperature: z.coerce.number().min(0).max(2),
      retries: z.coerce.number().int().min(0).max(2),
    })
    .safeParse({
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_CLASSIFICATION_MODEL ?? "gpt-4.1-mini",
      temperature: process.env.OPENAI_CLASSIFICATION_TEMPERATURE ?? "0",
      retries: process.env.OPENAI_CLASSIFICATION_RETRIES ?? "1",
    });
  return parsed.success ? parsed.data : null;
}
