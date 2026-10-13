import Link from "next/link";
import { requireUser } from "@/lib/workspace/auth";
import { signOut } from "@/app/login/actions";

export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <div className="min-h-screen">
      <header className="border-b border-emerald-950/10 bg-emerald-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-5">
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight"
          >
            Remote Job Agent
            <span className="ml-3 rounded-full border border-emerald-200/30 px-2 py-1 text-xs font-normal text-emerald-100">
              Personal workspace
            </span>
          </Link>
          <form action={signOut}>
            <button className="text-sm text-emerald-100 underline underline-offset-4">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[190px_1fr]">
        <aside>
          <nav
            aria-label="Workspace"
            className="flex flex-wrap gap-2 lg:flex-col"
          >
            {[
              ["/dashboard", "Overview"],
              ["/jobs", "Jobs"],
              ["/review", "Review queue"],
              ["/applications", "Applications"],
              ["/resumes", "Resumes"],
              ["/answers", "Verified answers"],
              ["/settings", "Settings"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg border border-transparent px-4 py-3 text-sm font-semibold hover:border-emerald-200 hover:bg-white"
              >
                {label}
              </Link>
            ))}
          </nav>
          <p className="mt-8 hidden rounded-lg border border-emerald-900/10 p-4 text-sm leading-6 text-slate-600 lg:block">
            Automation is paused.
            <br />
            Track your progress and complete applications through official
            forms.
          </p>
        </aside>
        <main id="main" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
