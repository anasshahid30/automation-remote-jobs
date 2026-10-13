"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { mutationContext } from "@/lib/workspace/auth";
import { defaultWeights, weightsSchema } from "@/lib/screening/schema";
import {
  failure,
  profileSchema,
  values,
  type ActionState,
} from "@/lib/workspace/schemas";

export async function saveProfile(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const parsed = profileSchema.safeParse({
      ...values(form, [
        "full_name",
        "email",
        "phone",
        "country",
        "city",
        "salary_min_monthly",
        "salary_currency",
        "work_authorization_notes",
        "sponsorship_preferences",
        "availability_notes",
        "daily_target",
        "timezone",
        "salary_unknown_policy",
      ]),
      employment_types: form.getAll("employment_types"),
      target_regions: form.getAll("target_regions"),
      target_seniority: form.getAll("target_seniority"),
      target_roles: form.getAll("target_roles"),
    });
    if (!parsed.success) return failure(parsed.error);
    const weightKeys = Object.keys(defaultWeights);
    const weights = weightsSchema.safeParse(
      Object.fromEntries(
        weightKeys.map((key) => [
          key,
          form.get(`weight_${key}`) ??
            defaultWeights[key as keyof typeof defaultWeights],
        ]),
      ),
    );
    if (!weights.success)
      return {
        message: "Scoring weights must be between 0 and 100 and total 100.",
      };
    const { error } = await client.from("candidate_profiles").upsert(
      {
        ...parsed.data,
        ...(weightKeys.some((key) => form.has(`weight_${key}`))
          ? { scoring_weights: weights.data }
          : {}),
        user_id: user.id,
        remote_only: true,
        automation_enabled: false,
      },
      { onConflict: "user_id" },
    );
    if (error)
      return {
        message:
          "Your profile could not be saved. Check your connection and try again.",
      };
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/jobs");
    revalidatePath("/jobs/[id]", "page");
    revalidatePath("/review");
    return { ok: true, message: "Profile saved. Automation remains paused." };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Profile not saved. Check your connection or wait before trying again.",
    };
  }
}
