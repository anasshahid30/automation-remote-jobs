"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const credentials = z.object({ email: z.email().max(254), password: z.string().min(1).max(256) });
export async function signIn(form: FormData) {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) redirect("/login?error=invalid");
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login?error=configuration");
  let failed = true;
  try { const { error } = await client.auth.signInWithPassword(parsed.data); failed = Boolean(error); }
  catch { /* Never log credentials or provider responses. */ }
  if (failed) redirect("/login?error=signin");
  redirect("/dashboard");
}
export async function signOut() {
  const client = await createSupabaseServerClient();
  if (client) await client.auth.signOut();
  redirect("/login");
}
