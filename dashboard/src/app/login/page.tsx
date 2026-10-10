import { readSupabaseConfig } from "@/lib/supabase/config";
import { signIn } from "./actions";

export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const configured = Boolean(readSupabaseConfig(process.env));
  const { error } = await searchParams;
  return <main id="main" className="mx-auto max-w-md px-6 py-20">
    <p className="text-sm font-bold uppercase tracking-widest text-emerald-800">Your private workspace</p>
    <h1 className="mt-4 text-3xl font-semibold">Sign in</h1>
    <p className="mt-4 leading-7 text-slate-600">Use an existing Supabase Auth account. Self-service registration is not enabled in this personal workspace.</p>
    {!configured && <p role="status" className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4">Supabase is not configured. Follow docs/SETUP.md to connect your local or hosted project.</p>}
    {error && <p role="alert" className="mt-6 text-red-800">Sign-in could not be completed. Check your credentials and Supabase setup.</p>}
    <form action={signIn} className="mt-8 space-y-5">
      <div><label htmlFor="email" className="block font-medium">Email</label><input id="email" name="email" type="email" required maxLength={254} autoComplete="email" className="mt-2 w-full rounded-lg border border-slate-400 bg-white p-3" /></div>
      <div><label htmlFor="password" className="block font-medium">Password</label><input id="password" name="password" type="password" required maxLength={256} autoComplete="current-password" className="mt-2 w-full rounded-lg border border-slate-400 bg-white p-3" /></div>
      <button disabled={!configured} className="w-full rounded-lg bg-emerald-900 px-5 py-3 font-semibold text-white disabled:opacity-50">Sign in</button>
    </form>
  </main>;
}
