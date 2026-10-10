"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mutationContext } from "@/lib/workspace/auth";
import { toDatabaseTime } from "@/lib/workspace/data";
import {
  applicationSchema,
  failure,
  uuid,
  values,
  type ActionState,
} from "@/lib/workspace/schemas";

export async function createApplication(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const job = uuid.safeParse(form.get("job_id"));
    if (!job.success) return { message: "Choose a valid saved listing." };
    const { data: existing, error: lookupError } = await client
      .from("applications")
      .select("id")
      .eq("job_id", job.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError) return { message: "The draft could not be loaded." };
    if (existing) redirect(`/applications/${existing.id}`);
    const { data, error } = await client
      .from("applications")
      .insert({
        job_id: job.data,
        user_id: user.id,
        status: "draft",
        submission_method: "human_assisted",
      })
      .select("id")
      .single();
    if (error)
      return {
        message:
          error.code === "23505"
            ? "A draft already exists. Reload this page to open it."
            : "The draft could not be created. Check that the listing belongs to your account.",
      };
    revalidatePath("/applications");
    revalidatePath("/dashboard");
    redirect(`/applications/${data.id}`);
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Draft not created. Please check your connection or try again later.",
    };
  }
}

export async function saveApplication(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const id = uuid.safeParse(form.get("id"));
    if (!id.success) return { message: "Invalid application record." };
    const parsed = applicationSchema.safeParse({
      ...values(form, [
        "resume_id",
        "status",
        "cover_letter",
        "notes",
        "follow_up_at",
        "applied_at",
        "confirmation_note",
        "last_error",
      ]),
      manual_confirm: form.get("manual_confirm") === "yes",
    });
    if (!parsed.success) return failure(parsed.error);
    const { data: existing, error: lookupError } = await client
      .from("applications")
      .select("submission_method")
      .eq("id", id.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError || !existing)
      return { message: "This application is unavailable." };
    if (existing.submission_method !== "human_assisted")
      return {
        message:
          "This record belongs to a submission integration. Its confirmation cannot be changed through the manual tracker.",
      };
    const data = parsed.data;
    const applied = await toDatabaseTime(client, data.applied_at),
      followUp = await toDatabaseTime(client, data.follow_up_at);
    if (applied && new Date(applied).valueOf() > Date.now())
      return {
        message:
          "A real submission cannot be recorded in the future. Check its time and your profile time zone.",
      };
    const { data: row, error } = await client
      .from("applications")
      .update({
        status: data.status,
        resume_id: data.resume_id || null,
        cover_letter: data.cover_letter,
        notes: data.notes,
        last_error: data.last_error,
        follow_up_at: followUp,
        applied_at: applied,
        submission_reference: data.confirmation_note || null,
        confirmation_evidence: applied
          ? { kind: "candidate_reported", note: data.confirmation_note }
          : null,
      })
      .eq("id", id.data)
      .eq("user_id", user.id)
      .eq("updated_at", String(form.get("updated_at") ?? ""))
      .select("id")
      .maybeSingle();
    if (error)
      return {
        message:
          "The record could not be saved. Check the selected resume and required confirmation fields.",
      };
    if (!row)
      return {
        message:
          "This application changed or is unavailable. Reload before editing again.",
      };
    revalidatePath(`/applications/${id.data}`);
    revalidatePath("/applications");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message:
        "Application record saved. No application was submitted by this action.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Record not saved. Please check your connection or try again later.",
    };
  }
}

export async function deleteApplication(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const id = uuid.safeParse(form.get("id"));
    if (!id.success || form.get("confirm_delete") !== "yes")
      return {
        message: "Confirm which application record you want to delete.",
      };
    const { data, error } = await client
      .from("applications")
      .delete()
      .eq("id", id.data)
      .eq("user_id", user.id)
      .eq("updated_at", String(form.get("updated_at") ?? ""))
      .select("id");
    if (error) return { message: "The record could not be deleted." };
    if (!data.length)
      return {
        message:
          "This application changed or is unavailable. Reload before deleting.",
      };
    revalidatePath("/applications");
    revalidatePath("/dashboard");
    redirect("/applications");
  } catch (error) {
    unstable_rethrow(error);
    return { message: "Record not deleted. Please try again later." };
  }
}
