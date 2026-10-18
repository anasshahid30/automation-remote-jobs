import Link from "next/link";
import { randomUUID } from "node:crypto";
import { profileContext } from "@/lib/workspace/auth";
import { dateTimeForInput, formatDate } from "@/lib/workspace/format";
import {
  metricsSchema,
  resultLabels,
  taskLabels,
} from "@/lib/scheduling/schema";
import { FormPanel } from "@/components/form-panel";
import { SelectField, TextArea, TextField } from "@/components/fields";
import {
  saveScheduler,
  toggleGlobalPause,
  scheduleTask,
  resolveTask,
  recordResponse,
} from "./actions";
export default async function Schedule() {
  const { client, user, profile } = await profileContext();
  if (!profile)
    return (
      <>
        <h1 className="page-title">Schedule and follow-ups</h1>
        <p className="panel mt-6">
          Save your profile and timezone first.{" "}
          <Link className="underline" href="/settings">
            Open settings
          </Link>
        </p>
      </>
    );
  const [
    { data: raw, error: metricError },
    { data: settings, error: settingError },
    { data: controls, error: controlError },
    { data: activeTasks, error: taskError },
    { data: apps, error: appError },
    { data: attempts, error: attemptError },
    { data: history, error: historyError },
  ] = await Promise.all([
    client.rpc("scheduler_metrics"),
    client
      .from("scheduler_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    client
      .from("submission_controls")
      .select("scope,paused")
      .eq("user_id", user.id),
    client
      .from("scheduled_tasks")
      .select("*,applications!inner(jobs!inner(company_name,job_title))")
      .eq("user_id", user.id)
      .in("state", [
        "queued",
        "running",
        "retry_wait",
        "ready",
        "needs_attention",
        "failed",
      ])
      .order("next_attempt_at", { ascending: true })
      .limit(100),
    client
      .from("applications")
      .select("id,status,applied_at,jobs!inner(company_name,job_title)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(200),
    client
      .from("scheduler_attempts")
      .select("id,task_id,attempt,started_at,finished_at,outcome")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(20),
    client
      .from("scheduled_tasks")
      .select("*,applications!inner(jobs!inner(company_name,job_title))")
      .eq("user_id", user.id)
      .in("state", ["done", "cancelled", "skipped"])
      .order("updated_at", { ascending: false })
      .limit(30),
  ]);
  const parsed = metricsSchema.safeParse(raw);
  if (
    metricError ||
    settingError ||
    controlError ||
    taskError ||
    appError ||
    attemptError ||
    historyError ||
    !parsed.success
  )
    throw new Error("Schedule data could not be loaded.");
  const tasks = [...activeTasks, ...history];
  const m = parsed.data,
    q = m.quota,
    paused = controls.find((c) => c.scope === "global")?.paused ?? true;
  const options = apps.map(
    (a) =>
      [
        a.id,
        `${a.jobs.company_name} · ${a.jobs.job_title} (${a.status.replaceAll("_", " ")})`,
      ] as const,
  );
  const submitted = apps
    .filter((a) => a.applied_at)
    .map(
      (a) => [a.id, `${a.jobs.company_name} · ${a.jobs.job_title}`] as const,
    );
  return (
    <>
      <h1 className="page-title">Schedule and follow-ups</h1>
      <p className="mt-3 mb-6 leading-7 text-slate-600">
        Schedule local readiness reviews and follow-up reminders. You complete
        official forms and send any follow-up yourself. All times use{" "}
        {profile.timezone}.
      </p>
      <section className="panel mb-6">
        <h2 className="text-xl font-semibold">Today’s handoff budget</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          {[
            ["Daily limit", q.limit],
            ["Completed today", q.completed_today],
            ["Unresolved handoffs", q.pending_handoffs],
            ["Available handoffs", q.remaining],
          ].map(([label, value]) => (
            <p key={label}>
              <span className="block text-sm text-slate-600">{label}</span>
              <strong className="text-2xl" data-metric={label}>
                {value}
              </strong>
            </p>
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Daily totals reset at {formatDate(q.resets_at, profile.timezone)}.
          Unresolved handoffs carry over until you verify their outcome. Dry
          checks and scheduled reviews use no submission quota. Actual receipts
          can always be recorded.{" "}
          <Link href="/settings" className="underline">
            Change your limit or timezone
          </Link>
          .
        </p>
      </section>
      <section className="panel mb-6">
        <h2 className="text-xl font-semibold">Controls and worker status</h2>
        <p className="mt-3 mb-5">
          Worker:{" "}
          <strong>
            {m.worker_live ? "Active" : "No recent worker heartbeat"}
          </strong>
          {m.last_worker_seen &&
            ` · Last running pulse ${formatDate(m.last_worker_seen, profile.timezone)}`}
        </p>
        <p className="mb-5 text-sm text-slate-600">
          A worker process must be running for scheduled tasks to advance.
          Enabling these controls does not connect a submission API.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <FormPanel
            action={toggleGlobalPause}
            id="global-pause"
            label={paused ? "Resume global processing" : "Pause all processing"}
          >
            <input type="hidden" name="paused" value={paused ? "no" : "yes"} />
            <p className="font-semibold">
              Global processing · {paused ? "Paused" : "Enabled"}
            </p>
            <p className="text-sm text-slate-600">
              This also controls new manual handoffs. It cannot cancel an
              employer form already open.
            </p>
          </FormPanel>
          <FormPanel
            action={saveScheduler}
            id="scheduler-settings"
            label="Save scheduler settings"
          >
            <label className="flex gap-3">
              <input
                type="checkbox"
                name="enabled"
                value="yes"
                defaultChecked={settings?.enabled ?? false}
              />
              Enable background checks and reminders
            </label>
            <SelectField
              name="max_concurrency"
              label="Maximum simultaneous tasks across workers"
              value={String(settings?.max_concurrency ?? 1)}
              options={[
                ["1", "1 task"],
                ["2", "2 tasks"],
                ["3", "3 tasks"],
              ]}
            />
          </FormPanel>
        </div>
        <p className="mt-5 text-sm text-slate-600">
          {controls
            .filter((c) => c.scope.startsWith("source:") && c.paused)
            .map((c) => c.scope.slice(7))
            .join(", ") || "No sources"}{" "}
          paused individually. Source controls remain available on each
          application’s handoff page.
        </p>
      </section>
      <section className="panel mb-6">
        <h2 className="mb-5 text-xl font-semibold">Schedule work</h2>
        {options.length ? (
          <FormPanel
            action={scheduleTask}
            id="schedule-task"
            label="Schedule task"
          >
            <input type="hidden" name="request_id" value={randomUUID()} />
            <SelectField
              name="application_id"
              label="Application"
              options={options}
            />
            <SelectField
              name="kind"
              label="Task"
              options={[
                ["review_application", "Check readiness for my review"],
                ["follow_up", "Remind me to follow up after submission"],
              ]}
            />
            <TextField
              name="due_at"
              label={`Due at (${profile.timezone})`}
              type="datetime-local"
              value={dateTimeForInput(
                new Date().toISOString(),
                profile.timezone,
              )}
              required
            />
            <p className="text-sm text-slate-600">
              A readiness result checks stored source revisions. Before any
              handoff, run the full dry check for current eligibility, factual
              documents and private file integrity. Updating a follow-up date in
              the application tracker also schedules its reminder.
            </p>
          </FormPanel>
        ) : (
          <p>
            Create an application record first.{" "}
            <Link className="underline" href="/applications">
              Open applications
            </Link>
            .
          </p>
        )}
      </section>
      <section
        className="mb-6 grid gap-4 sm:grid-cols-4"
        aria-label="Queue statistics"
      >
        {[
          ["Waiting", m.queued],
          ["Running", m.running],
          ["For your attention", m.attention],
          ["Stopped with errors", m.failed],
        ].map(([label, value]) => (
          <article className="panel" key={label}>
            <h2 className="text-sm">{label}</h2>
            <p className="mt-2 text-2xl font-semibold" data-metric={label}>
              {value}
            </p>
          </article>
        ))}
      </section>
      <section className="panel mb-6">
        <h2 className="text-xl font-semibold">Task history</h2>
        <p className="mt-2 text-sm text-slate-600">
          First 100 unresolved tasks by due time, then 30 recent resolved tasks.
          Only temporary database failures retry, at most 3 attempts with
          increasing delays. Uncertain submissions never auto-retry.
        </p>
        {!tasks.length && <p className="mt-5">No tasks scheduled yet.</p>}
        <ol className="mt-5 space-y-5">
          {tasks.map((t) => (
            <li key={t.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/applications/${t.application_id}`}
                    className="font-semibold underline"
                  >
                    {t.applications.jobs.company_name} ·{" "}
                    {t.applications.jobs.job_title}
                  </Link>
                  <p className="mt-2">
                    {t.kind === "follow_up"
                      ? "Follow-up reminder"
                      : "Readiness review"}{" "}
                    · {taskLabels[t.state]}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Due {formatDate(t.due_at, profile.timezone)} · Attempts{" "}
                    {t.attempts}/3
                    {t.state === "retry_wait"
                      ? ` · Next attempt ${formatDate(t.next_attempt_at, profile.timezone)}`
                      : ""}
                  </p>
                </div>
                {!["done", "cancelled", "skipped"].includes(t.state) && (
                  <FormPanel
                    action={resolveTask}
                    id={`resolve-${t.id}`}
                    label={
                      ["ready", "needs_attention", "failed"].includes(t.state)
                        ? "Dismiss reminder"
                        : "Cancel task"
                    }
                  >
                    <input type="hidden" name="task_id" value={t.id} />
                    <input
                      type="hidden"
                      name="resolution"
                      value={
                        ["ready", "needs_attention", "failed"].includes(t.state)
                          ? "done"
                          : "cancelled"
                      }
                    />
                  </FormPanel>
                )}
              </div>
              {t.result_code && (
                <p className="mt-3 text-sm leading-6">
                  {resultLabels[t.result_code]}
                </p>
              )}
              {t.kind === "review_application" &&
                ["ready", "needs_attention"].includes(t.state) && (
                  <Link
                    className="mt-3 inline-block underline"
                    href={`/applications/${t.application_id}/submission`}
                  >
                    Review package and run dry check
                  </Link>
                )}
            </li>
          ))}
        </ol>
      </section>
      <section className="panel mb-6">
        <h2 className="mb-5 text-xl font-semibold">
          Record an actual response
        </h2>
        {submitted.length ? (
          <FormPanel
            action={recordResponse}
            id="record-response"
            label="Record employer response"
          >
            <input type="hidden" name="request_id" value={randomUUID()} />
            <SelectField
              name="application_id"
              id="response-application"
              label="Submitted application"
              options={submitted}
            />
            <SelectField
              name="status"
              label="Actual response"
              options={[
                ["responded", "Response received"],
                ["interview", "Interview invitation"],
                ["offer", "Offer received"],
                ["rejected", "Rejection received"],
              ]}
            />
            <TextArea
              name="note"
              label="Actual response or interview notes"
              maxLength={3000}
              required
            />
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                name="actual_confirm"
                value="yes"
                required
              />
              I received this response and the details are accurate.
            </label>
          </FormPanel>
        ) : (
          <p>No actual submissions recorded yet.</p>
        )}
      </section>
      <section className="panel mb-6">
        <h2 className="text-xl font-semibold">Search report</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            ["Unique saved jobs", m.unique_jobs],
            ["Ineligible jobs", m.ineligible_jobs],
            ["Package versions prepared", m.packages],
            ["Applications awaiting review", m.awaiting_approval],
            ["Uncertain handoffs", m.uncertain],
            ["Applications with responses", m.responses],
            ["Current interviews", m.interviews],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-slate-600">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-6 mb-3 font-semibold">
          Recorded submissions · last 14 local days
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Day</th>
                <th className="p-2">Candidate-reported</th>
                <th className="p-2">Provider-verified</th>
              </tr>
            </thead>
            <tbody>
              {m.days.map((d) => (
                <tr key={d.day} className="border-t">
                  <td className="p-2">{d.day}</td>
                  <td className="p-2">{d.manual}</td>
                  <td className="p-2">{d.verified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          No provider API is configured. Manual reports remain separate from
          provider verification. Reports reflect your saved application records.
        </p>
      </section>
      <details className="panel">
        <summary className="cursor-pointer font-semibold">
          Recent worker attempts
        </summary>
        <ol className="mt-4 space-y-3">
          {attempts.map((a) => (
            <li key={a.id} className="text-sm">
              Attempt {a.attempt} · {formatDate(a.started_at, profile.timezone)}{" "}
              · {a.outcome?.replaceAll("_", " ") ?? "Running"}
            </li>
          ))}
        </ol>
        {!attempts.length && (
          <p className="mt-3">No worker attempts recorded.</p>
        )}
      </details>
    </>
  );
}
