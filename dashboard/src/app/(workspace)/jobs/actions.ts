"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mutationContext } from "@/lib/workspace/auth";
import { toDatabaseTime } from "@/lib/workspace/data";
import { normalizeListing } from "@/lib/screening/normalization";
import {
  failure,
  jobSchema,
  listText,
  uuid,
  values,
  type ActionState,
} from "@/lib/workspace/schemas";

export async function saveJob(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const parsed = jobSchema.safeParse({
      ...values(form, [
        "canonical_url",
        "company_name",
        "job_title",
        "description",
        "source_platform",
        "external_job_id",
        "role_category",
        "employment_type",
        "seniority",
        "workplace_type",
        "remote_scope",
        "salary_min_original",
        "salary_max_original",
        "salary_currency",
        "salary_period",
        "listing_status",
        "employer_region",
        "expires_at",
      ]),
      eligible_countries: listText(
        String(form.get("eligible_countries") ?? ""),
      ),
      restricted_countries: listText(
        String(form.get("restricted_countries") ?? ""),
      ),
    });
    if (!parsed.success) return failure(parsed.error);
    const { expires_at, ...data } = parsed.data;
    const hasPay =
      data.salary_min_original != null || data.salary_max_original != null;
    const identity = normalizeListing(
      data.canonical_url,
      data.source_platform,
      data.external_job_id,
    );
    const payload = {
      ...data,
      ...identity,
      normalized_url: identity.canonical_url,
      original_url: new URL(data.canonical_url).toString(),
      user_id: user.id,
      expires_at: await toDatabaseTime(client, expires_at),
      salary_currency: hasPay ? data.salary_currency : null,
      salary_min_annual:
        data.salary_period === "annual" ? data.salary_min_original : null,
      salary_max_annual:
        data.salary_period === "annual" ? data.salary_max_original : null,
    };
    const id = String(form.get("id") ?? "");
    if (id) {
      if (!uuid.safeParse(id).success) return { message: "Invalid listing." };
      const { data: row, error } = await client
        .from("jobs")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("updated_at", String(form.get("updated_at") ?? ""))
        .select("id")
        .maybeSingle();
      if (error)
        return {
          message:
            error.code === "23505"
              ? "This listing is already saved under the same URL or source ID."
              : "The listing could not be saved.",
        };
      if (!row)
        return {
          message:
            "This listing changed or is unavailable. Reload before editing again.",
        };
      revalidatePath(`/jobs/${id}`);
      revalidatePath("/jobs");
      revalidatePath("/dashboard");
      return {
        ok: true,
        message: "Listing updated. Eligibility has not been assessed.",
      };
    }
    const { data: row, error } = await client
      .from("jobs")
      .insert(payload)
      .select("id")
      .single();
    if (error)
      return {
        message:
          error.code === "23505"
            ? "This listing is already saved under the same URL or source ID."
            : "The listing could not be saved.",
      };
    revalidatePath("/jobs");
    revalidatePath("/dashboard");
    redirect(`/jobs/${row.id}`);
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Listing not saved. Check your connection or wait before trying again.",
    };
  }
}

export async function deleteJob(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const id = uuid.safeParse(form.get("id"));
    if (!id.success || form.get("confirm_delete") !== "yes")
      return { message: "Confirm which listing you want to delete." };
    const { data, error } = await client
      .from("jobs")
      .delete()
      .eq("id", id.data)
      .eq("user_id", user.id)
      .eq("updated_at", String(form.get("updated_at") ?? ""))
      .select("id");
    if (error)
      return {
        message:
          error.code === "23503"
            ? "This listing has application history. Mark it closed, or explicitly delete its applications first."
            : "The listing could not be deleted.",
      };
    if (!data.length)
      return {
        message:
          "This listing changed or is unavailable. Reload before deleting.",
      };
    revalidatePath("/jobs");
    revalidatePath("/dashboard");
    redirect("/jobs");
  } catch (error) {
    unstable_rethrow(error);
    return { message: "Listing not deleted. Please try again later." };
  }
}
