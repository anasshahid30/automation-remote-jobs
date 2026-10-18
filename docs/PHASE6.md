# Phase 6: scheduling, quotas and follow-ups

Phase 6 schedules local readiness reviews and follow-up reminders. A restricted Python
worker processes the queue; the candidate still completes official employer forms and sends
any follow-up personally. No employer-approved API access is available. There is no live
source connector, API dispatch loop or automatic employer messaging. Existing eligibility,
factual document validation and uncertain-outcome duplicate protection remain mandatory.

## macOS commands

From your existing checkout with Docker Desktop running:

```sh
git pull origin main
npm run db:start
npm run db:migrate
worker/.venv/bin/python scripts/configure_scheduler.py
npm run dev
```

The new helper creates a dedicated **local** database login and writes ignored
`worker/.env.scheduler` with mode 0600. It never prints a credential, replaces existing
configuration or uses the diagnostic connection to run tasks. Run it once after migrating;
repeating it preserves the existing file. No dependency installation or API secret is needed.
If you have not set up the project yet, follow SETUP.md first.

In a second terminal, from the checkout:

```sh
cd worker
SCHEDULER_ENABLED=true .venv/bin/python main.py --scheduler
```

Leave that terminal running. `Ctrl+C` stops it gracefully after the bounded current batch.
For one batch instead, use `SCHEDULER_ENABLED=true .venv/bin/python main.py --run-once`.
A one-batch process exits and correctly appears stopped afterward. There is no FastAPI or
worker web server to launch. The existing `--health` and `--check-database` remain read-only
diagnostics; they do not prove that the scheduler is running. Check its actual heartbeat.

The worker polls every 30 seconds by default (configurable 30–60) and runs at most three
threads per process. The account's database concurrency setting applies across **all** worker
processes. Two processes do not double its capacity. `SCHEDULER_DATABASE_URL` must use the
restricted login; the executable rejects administrative or general candidate-table access.
The old diagnostic `DAILY_TARGET` environment setting does not control handoff allocations;
the candidate profile's daily target and timezone are authoritative.

For hosted use, an operator must provision a dedicated login with only membership in
`remote_jobs_scheduler`, then set `SCHEDULER_DATABASE_URL` securely with
`sslmode=verify-full&sslrootcert=system`. Do not reuse a privileged owner connection or
service key. The local provisioning helper refuses hosted targets. Hosted scheduling,
operating-system autostart and fresh-cloud-task restoration have not been verified.

## Verify the workflow

1. Open **Schedule & follow-ups**. Confirm your daily limit and timezone. New accounts
   default to 30 per local day; Settings allows 1–30. The scheduler starts disabled and
   global processing starts paused.
2. Schedule a readiness review for a pending application and a time in your profile timezone.
   The task can be saved while paused. Enable background checks, choose 1–3 simultaneous
   tasks, then resume global processing. Source pauses also apply. A running worker should
   show **Active**, and due work should move out of Scheduled.
3. A current eligible reviewed package produces **Ready for your review**; stale/missing
   inputs produce **Inputs need attention**. This is a reminder based on stored revisions,
   not authorization to submit. Open the package and run the full Phase 5 dry check before
   any handoff. Scheduled checks do not contact the employer or consume submission quota.
4. Start a manual handoff. The database reserves a daily slot atomically. Record the actual
   outcome. Unresolved and uncertain handoffs consume capacity across local midnight until
   their outcome is checked. Verified no-submission cancellation releases the reservation.
5. For an actual submitted application, schedule a follow-up. Updating its follow-up date in
   the existing tracker also creates a reminder. Moving the date cancels the old reminder;
   deliberately restoring a previous date reactivates it. Ordinary status/notes edits do not
   resurrect a cancelled reminder. Terminal responses cancel pending follow-ups.
6. When a follow-up becomes due, review the response yourself. **Dismiss reminder** acknowledges
   it and clears its matching date; it does not assert that you sent a message. Enter an
   actual response/interview/offer/rejection with notes and the accuracy confirmation.
   The application status, notes and response audit event update together; retries retain
   one event. Response history remains on the application record.
7. Check queue counts, stopped tasks, recent attempts and the last 14 local days of recorded
   submissions. Candidate reports and provider-verified receipts stay separate. No provider
   is connected, so the app cannot generate a verified receipt. The queue displays the first
   100 unresolved tasks by due time, followed by 30 recent resolved tasks. The application
   selectors show the most recently updated 200 records; older records remain in the tracker.
8. Pause global processing while work is queued. Both new handoffs and worker processing
   stop. Tasks recheck pause after acquiring a lease. Actual outcomes remain recordable.
   Pausing cannot cancel an employer form already open. Stop the worker and reload: it
   should no longer appear active. A crashed worker becomes stale after two minutes.

## Quotas and retries

The allocation budget uses profile-local calendar boundaries, including 23/25-hour DST days.
It counts distinct completed applications today plus unresolved handoffs. A tracker record
and its reconciled handoff count once. Completed handoff history preserves its allocation
if the tracker is subsequently edited. The limit prevents **new workspace handoffs**; it
cannot restrict applications you submit directly elsewhere. Actual reports remain recordable
above the limit so the tracker can reflect reality. Changing the limit never erases history.
Quota resets do not release uncertain handoffs. Eligibility is never relaxed to reach a goal.

Queue tasks have a 90-second lease and at most three automatic attempts. Transient database
failures retry after 60 then 120 seconds plus 0–20 seconds jitter. Permission/schema failures
stop immediately. A disconnected worker's expired lease enters delayed recovery. Only the
idempotent local check/reminder can be replayed: submission runs never enter this queue.
A stale lease token cannot commit a newer attempt, and a lost completion response cannot
create another reminder. Deliberately scheduling a new time starts a new task; restoring a
previous follow-up date starts a new bounded cycle with earlier attempt history retained.

Operational logs contain worker IDs, status and counts, without driver errors, credentials,
resume text or candidate notes. Each database operation has connect, lock and statement
bounds. The queue and attempt history are private and retained for review; no automatic
candidate-history purge is scheduled. Dismissal is not deletion. Application deletion
cascades its local tasks where existing handoff-history constraints permit it; Auth account
deletion removes its private scheduler settings, tasks and attempts. Worker heartbeat rows
contain no candidate data and are separate operational metadata.

## Important changes

| Path | Purpose |
| --- | --- |
| `supabase/migrations/20261018000100_scheduler_and_quotas.sql` | Private queue/settings/history, restricted worker capabilities, handoff quotas and reporting |
| `supabase/migrations/20261018000200_scheduler_claim_and_responses.sql` | Rechecks concurrency after owner lock; schedules follow-ups and records actual responses |
| `supabase/migrations/20261018000300_follow_up_rescheduling.sql` | Explicit date restoration and strict response request identity |
| `worker/app/scheduler.py`, `worker/main.py` | Bounded processing loop, safe failure codes, heartbeat and graceful shutdown |
| `worker/app/common/config.py`, `worker/.env.example` | Separate restricted binding and validated worker settings |
| `scripts/configure_scheduler.py` | Non-overwriting local worker account setup |
| `dashboard/src/app/(workspace)/schedule/` | Schedule, controls, reminders, response forms and reports |
| `dashboard/src/lib/scheduling/schema.ts` | Typed operational metrics and task explanations |
| `dashboard/src/proxy.ts`, application/dashboard pages | Private schedule session refresh, navigation and quota feedback |
| `supabase/tests/scheduler.test.sql`, `worker/tests/test_scheduler.py` | Lifecycle, permissions, timezones, retry and shutdown checks |
| `scripts/smoke_phase6.py`, `.github/workflows/checks.yml` | Real forms, restricted worker, concurrent claims and quota regression |

From the checkout, stop your own dashboard dev server before the production build:

```sh
npm run check
worker/.venv/bin/ruff check worker scripts
(cd worker && .venv/bin/pytest)
npm run db:test
npm --prefix dashboard run build
npm --prefix dashboard run start
```

In another terminal, keep other scheduler processes stopped and real accounts' background
checks disabled while running the isolated local integration suite:

```sh
worker/.venv/bin/python scripts/smoke_local.py
worker/.venv/bin/python scripts/smoke_phase2.py
worker/.venv/bin/python scripts/smoke_phase3.py
worker/.venv/bin/python scripts/smoke_phase4.py
worker/.venv/bin/python scripts/smoke_phase5.py
worker/.venv/bin/python scripts/smoke_phase6.py
```

Phase 6 integration refuses other opted-in accounts/recent running workers, uses synthetic
local accounts and deletes their private files/history afterward. It never operates employer
forms. SQL fixtures roll back. See VALIDATION.md for executed results and remaining limits.
