"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel" role="alert">
      <h1 className="text-2xl font-semibold">
        Your workspace could not be loaded
      </h1>
      <p className="mt-3 text-slate-600">
        Check your connection and Supabase configuration, then try again. Your
        saved data is unchanged.
      </p>
      <button onClick={reset} className="button-primary mt-6">
        Try again
      </button>
    </section>
  );
}
