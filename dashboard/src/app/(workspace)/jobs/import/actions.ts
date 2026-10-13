"use server";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mutationContext } from "@/lib/workspace/auth";
import {
  importBatchSchema,
  importPayload,
} from "@/lib/screening/normalization";
import type { ActionState } from "@/lib/workspace/schemas";

export async function importJobs(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { client } = await mutationContext();
    let raw: unknown;
    if (form.get("mode") === "single")
      raw = [
        {
          url: String(form.get("url") ?? ""),
          company: String(form.get("company") ?? ""),
          title: String(form.get("title") ?? ""),
          description: String(form.get("description") ?? ""),
        },
      ];
    else if (form.get("mode") === "batch") {
      const json = String(form.get("json") ?? "");
      if (Buffer.byteLength(json, "utf8") > 2000000)
        return { message: "Import JSON must be no larger than 2 MB." };
      try {
        raw = JSON.parse(json);
      } catch {
        return {
          message: "Enter valid JSON containing an array of job records.",
        };
      }
    } else return { message: "Select a supported import format." };
    const parsed = importBatchSchema.safeParse(raw);
    if (!parsed.success)
      return {
        message:
          "Import 1–20 records with an HTTPS url, company, title and actual description. Optional fields: source and source_id. Extra fields are rejected.",
      };
    let jobs;
    try {
      jobs = importPayload(parsed.data);
    } catch {
      return {
        message:
          "The URL, source platform and source ID must agree. Check the original listing.",
      };
    }
    const { data, error } = await client.rpc("import_jobs", { p_jobs: jobs });
    if (error)
      return {
        message:
          error.code === "23505"
            ? "The source ID and URL match different saved records. Resolve the conflict before retrying; the batch was not changed."
            : "Import failed. The batch is transactional; check your connection and original records.",
      };
    const results = z
      .array(
        z.object({
          id: z.uuid(),
          title: z.string(),
          created: z.boolean(),
          possible_duplicates: z.number().int().nonnegative(),
        }),
      )
      .parse(data);
    revalidatePath("/jobs");
    revalidatePath("/review");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `Import completed: ${results.filter((r) => r.created).length} new record(s), ${results.filter((r) => !r.created).length} already saved. Review source evidence before screening.`,
      results,
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      message:
        "Import not completed. Check your connection or wait before retrying.",
    };
  }
}
