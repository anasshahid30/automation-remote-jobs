"use client";
import { useActionState } from "react";
import type { ActionState } from "@/lib/workspace/schemas";

export function FormPanel({
  action,
  children,
  label = "Save changes",
  confirm,
  id,
}: {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  label?: string;
  confirm?: string;
  id?: string;
}) {
  const [state, submit, pending] = useActionState(action, { message: "" });
  return (
    <form
      id={id}
      action={submit}
      // React resets uncontrolled action forms even after server validation fails.
      // Keep the candidate's input; navigation reloads the saved values.
      onReset={(event) => event.preventDefault()}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className="space-y-5"
    >
      {children}
      {state.message && (
        <div
          role={state.ok ? "status" : "alert"}
          aria-live="polite"
          className={`rounded-lg border p-4 ${state.ok ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50 text-red-900"}`}
        >
          <p>{state.message}</p>
          {state.errors && (
            <ul className="mt-2 list-disc pl-5">
              {Object.entries(state.errors).map(([name, errors]) =>
                errors?.map((error) => (
                  <li key={`${name}-${error}`}>
                    <a href={`#${name}`} className="underline">
                      {name.replaceAll("_", " ")}: {error}
                    </a>
                  </li>
                )),
              )}
            </ul>
          )}
        </div>
      )}
      <button
        disabled={pending}
        className="button-primary disabled:opacity-50"
        type="submit"
      >
        {pending ? "Saving…" : label}
      </button>
    </form>
  );
}
