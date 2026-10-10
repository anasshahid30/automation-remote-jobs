import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  let authenticated = false;
  try {
    const { data: { user }, error } = await client.auth.getUser();
    authenticated = !error && Boolean(user);
  } catch { /* Fail closed; do not expose provider errors. */ }
  if (!authenticated) redirect("/login");
  return <main id="main" className="mx-auto max-w-4xl px-6 py-14">
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-semibold">Your workspace</h1><form action={signOut}><button className="rounded-lg border border-slate-400 px-4 py-2">Sign out</button></form></div>
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-8"><h2 className="text-xl font-semibold">Foundation stage</h2><p className="mt-4 leading-7 text-slate-600">Authentication is connected. Profile settings, resumes, and the application CRM are planned for Phase 2. No discovery or submissions are running.</p></section>
  </main>;
}
