import Link from "next/link";

export default function Home() {
  return <main id="main" className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
    <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-800">Remote Job Agent / Your personal search</p>
    <h1 className="mt-8 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">A thoughtful workspace for your next remote role.</h1>
    <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Keep your candidate profile, private resume versions, saved jobs and application history in one thoughtful workspace.</p>
    <Link href="/dashboard" className="mt-8 inline-block rounded-lg bg-emerald-900 px-6 py-3 font-semibold text-white hover:bg-emerald-800">Open secure workspace</Link>
    <div className="mt-16 grid gap-5 sm:grid-cols-3">
      {[ ["01 / Privacy first", "Sign-in protects your workspace. Resume storage is private."], ["02 / Evidence before action", "Eligibility and truthful candidate facts will guide every application."], ["03 / You stay in control", "No job sources are connected. Automated submission is disabled."] ].map(([title, text]) =>
        <section key={title} className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">{title}</h2><p className="mt-3 leading-7 text-slate-600">{text}</p></section>)}
    </div>
  </main>;
}
