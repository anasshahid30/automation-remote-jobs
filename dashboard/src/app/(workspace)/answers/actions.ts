"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { mutationContext } from "@/lib/workspace/auth";
import {
  answerSchema,
  normalizeQuestion,
  sensitiveQuestion,
} from "@/lib/preparation/engine";
import { failure, uuid, type ActionState } from "@/lib/workspace/schemas";

export async function saveAnswer(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const parsed = answerSchema.safeParse({
      question: form.get("question"),
      answer: form.get("answer"),
      category: form.get("category"),
    });
    if (!parsed.success) return failure(parsed.error);
    if (form.get("verified") !== "yes")
      return {
        message: "Confirm that this exact answer is accurate before saving.",
      };
    const id = form.get("id");
    const row = {
      user_id: user.id,
      question_pattern: parsed.data.question,
      question_key: createHash("sha256")
        .update(normalizeQuestion(parsed.data.question))
        .digest("hex"),
      answer_text: parsed.data.answer,
      category: parsed.data.category,
      verified_by_candidate: true,
      verified_at: new Date().toISOString(),
      requires_review:
        form.get("requires_review") === "yes" ||
        sensitiveQuestion.test(parsed.data.question) ||
        parsed.data.category !== "routine",
    };
    if (id) {
      if (!uuid.safeParse(id).success)
        return { message: "Invalid answer record." };
      const { data, error } = await client
        .from("answer_library")
        .update(row)
        .eq("id", String(id))
        .eq("user_id", user.id)
        .eq("updated_at", String(form.get("updated_at")))
        .select("id")
        .maybeSingle();
      if (error || !data)
        return {
          message:
            "Answer changed, is unavailable, or duplicates another question. Reload before editing.",
        };
    } else {
      const { error } = await client.from("answer_library").insert(row);
      if (error)
        return {
          message:
            "Answer not saved. An answer for that exact question may already exist; edit it below.",
        };
    }
    revalidatePath("/answers");
    revalidatePath("/applications", "layout");
    return {
      ok: true,
      message:
        "Verified answer saved. Sensitive answers still require review in each application.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message: "Answer not saved. Check your connection or request limit.",
    };
  }
}
