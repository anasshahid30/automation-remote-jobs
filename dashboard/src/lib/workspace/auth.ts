import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// React cache only deduplicates calls within this request; never caches between users.
export const requireUser = cache(async () => {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data, error } = await client.auth
    .getUser()
    .catch(() => ({ data: { user: null }, error: true }));
  if (error || !data.user) redirect("/login");
  return { client, user: data.user };
});

export async function mutationContext(
  kind: "upload" | "mutation" = "mutation",
) {
  const context = await requireUser();
  const { data, error } = await context.client.rpc("consume_action_budget", {
    p_action: kind,
  });
  if (error || !data)
    throw new Error(
      "Please wait before trying again. The request limit or database connection needs attention.",
    );
  return context;
}

export async function profileContext() {
  const context = await requireUser();
  const { data: profile, error } = await context.client
    .from("candidate_profiles")
    .select("*")
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (error)
    throw new Error("Your profile could not be loaded. Please try again.");
  return { ...context, profile };
}
