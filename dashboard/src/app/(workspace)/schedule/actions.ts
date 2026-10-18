"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { mutationContext } from "@/lib/workspace/auth";
import { toDatabaseTime } from "@/lib/workspace/data";
import { uuid, type ActionState } from "@/lib/workspace/schemas";
const refresh = () => {
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/applications", "layout");
};
export async function saveScheduler(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const max = z.coerce
      .number()
      .int()
      .min(1)
      .max(3)
      .parse(form.get("max_concurrency"));
    const enabled = form.get("enabled") === "yes";
    const { error } = await client
      .from("scheduler_settings")
      .upsert({ user_id: user.id, enabled, max_concurrency: max });
    if (error) return { message: "Scheduler settings not saved." };
    refresh();
    return {
      ok: true,
      message: enabled
        ? "Background checks enabled. Global and source pause controls still apply."
        : "Background checks paused.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message: "Settings not saved. Choose a concurrency limit from 1 to 3.",
    };
  }
}
export async function toggleGlobalPause(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client, user } = await mutationContext();
    const paused = z.enum(["yes", "no"]).parse(form.get("paused")) === "yes";
    const { error } = await client
      .from("submission_controls")
      .upsert(
        { user_id: user.id, scope: "global", paused },
        { onConflict: "user_id,scope" },
      );
    if (error) return { message: "Global pause not saved." };
    refresh();
    return {
      ok: true,
      message: paused
        ? "Global pause is on. New handoffs and background work are paused."
        : "Global pause is off. Enabled background checks and manual handoffs may proceed.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Global pause not saved. Try again after checking your connection.",
    };
  }
}
export async function scheduleTask(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client } = await mutationContext();
    const application = uuid.parse(form.get("application_id"));
    const kind = z
      .enum(["review_application", "follow_up"])
      .parse(form.get("kind"));
    const due = await toDatabaseTime(client, String(form.get("due_at") ?? ""));
    if (!due) return { message: "Choose a due time in your profile timezone." };
    const result =
      kind === "review_application"
        ? await client.rpc("schedule_application_review", {
            p_application_id: application,
            p_due_at: due,
            p_request_id: uuid.parse(form.get("request_id")),
          })
        : await client.rpc("schedule_follow_up", {
            p_application_id: application,
            p_due_at: due,
          });
    if (result.error)
      return {
        message:
          "Task not scheduled. Choose a time within the next year and an application with the matching status. Review checks need a pending application; follow-ups need an actual submission.",
      };
    refresh();
    return {
      ok: true,
      message:
        kind === "follow_up"
          ? "Follow-up reminder scheduled. No message will be sent."
          : "Application review scheduled. This does not start a handoff or submit an application.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Task not scheduled. Check the date, application and request limit.",
    };
  }
}
export async function resolveTask(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client } = await mutationContext();
    const { error } = await client.rpc("resolve_scheduled_task", {
      p_task_id: uuid.parse(form.get("task_id")),
      p_action: z.enum(["done", "cancelled"]).parse(form.get("resolution")),
    });
    if (error)
      return {
        message: "Task changed or is unavailable. Reload before trying again.",
      };
    refresh();
    return {
      ok: true,
      message: "Task updated. No employer message or application was sent.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message: "Task not updated. Check your connection and try again.",
    };
  }
}
export async function recordResponse(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client } = await mutationContext();
    if (form.get("actual_confirm") !== "yes")
      return { message: "Confirm this is an actual employer response." };
    const { error } = await client.rpc("record_application_response", {
      p_application_id: uuid.parse(form.get("application_id")),
      p_status: z
        .enum(["responded", "interview", "offer", "rejected"])
        .parse(form.get("status")),
      p_note: z.string().trim().min(3).max(3000).parse(form.get("note")),
      p_request_id: uuid.parse(form.get("request_id")),
    });
    if (error)
      return {
        message:
          "Response not saved. Choose an actually submitted application and check the note length.",
      };
    refresh();
    return {
      ok: true,
      message:
        "Actual response recorded in the application and activity history.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message: "Response not saved. Enter the actual response details.",
    };
  }
}
