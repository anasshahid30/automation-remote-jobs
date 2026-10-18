# Database and CRM

Migration: `supabase/migrations/20261009000100_foundation.sql`.
It creates eight application tables in one transaction, indexes, owner policies,
timestamp triggers, the health RPC, and a private `resumes` bucket.

Phase 2 adds `20261010000100_candidate_crm.sql`, `20261010000200_crm_guardrails.sql`
and `20261010000300_action_budget_clock.sql`. They preserve the foundation and existing
records. Apply them in order using migration history. They add document metadata, immutable
version guards, a single master per role, application notes, transactional audit events,
real dashboard metrics, timezone conversion and shared action budgets.

| Table | Purpose |
| --- | --- |
| candidate_profiles | Real candidate details and initial Pakistan/remote/junior-mid preferences; paused automation, 30 maximum daily target, Asia/Karachi timezone |
| resumes | Separate backend, AI/automation, full-stack versions and private paths; optional parent version |
| source_accounts | Account metadata only; default human assistance and not connected |
| jobs | Source identity, canonical HTTPS URL, description, restrictions, compensation and listing dates |
| eligibility_checks | Evidence, reasons, three-way decision, score factors and evaluation version |
| applications | One application per owner/job, selected resume, answers, status and confirmation evidence |
| answer_library | Candidate-verified answers; sensitive categories always require review |
| application_events | Append-only event history for authenticated users |
| action_limits | Internal per-owner action budgets; no authenticated direct table privileges |

Every table has a UUID key and `user_id` linked to Supabase Auth. Composite foreign keys
prevent associating an owner's application with somebody else's job or resume. RLS is
enabled and CRUD privileges explicitly granted to authenticated users for their own data.
Anonymous users have no application-table access. Audit events allow SELECT/INSERT only;
deleting a parent/account can cascade events as part of eventual data deletion.

Jobs deduplicate on `(user_id, source_platform, external_job_id)` when a source ID exists,
and `(user_id, canonical_url)`. The canonical URL must be normalized by the future import
engine; Phase 2 does not implement URL normalization or cross-source semantic matching.

Undisclosed salary amounts are NULL. `salary_min_annual`/`salary_max_annual` are normalized
annual values; original amounts and `salary_period` preserve source units. Hourly rates
require an explicit hours assumption, and foreign currency requires a sourced conversion.
Neither is automatically converted by this migration.

An ELIGIBLE check requires pass outcomes and source evidence. Submission/response/interview/
offer statuses require `applied_at` and nonempty confirmation evidence. These constraints
are not proof that the contents are truthful. Phase 2 records manual evidence as
`candidate_reported`. Additional database guards reject future submission timestamps,
prepared records without resumes and failures without reasons. These checks use NOT VALID
to retain older rows while enforcing the rules on every new or updated record. Provider
confirmation validation, expiry screening and executable submission transitions come later.

Application inserts and updates create `record_created`, `record_updated` or `status_changed`
events in the same transaction; status changes capture before/after states. Failed writes
cannot create phantom events. The job foreign key uses NO ACTION so listing deletion cannot
erase application history. Explicit application/account deletion still removes related events.

`dashboard_metrics()` uses RLS and the authenticated owner. It computes day boundaries in
the profile timezone, counts candidate reports separately, and requires submission dates
for response counts. `local_time_to_utc(text)` converts local form inputs using the same
timezone. Settings validate the timezone against both runtime and PostgreSQL timezone data.

Documents must use `USER_UUID/version-specific-name.ext` inside the private bucket.
PDF, plain text and DOCX are allowed up to 10 MiB. No Storage UPDATE policy exists:
upload a new version instead of overwriting a master. All version metadata is immutable
except master selection and its timestamp. `select_resume_master(uuid)` locks the owner's
profile before changing masters, and a partial unique index enforces one master per role.
If a pre-existing database has conflicting masters, the migration fails visibly for review
rather than choosing a document. Registered Storage objects cannot be deleted through the
owner's Storage policy. Malware scanning/document extraction are not implemented.

The authenticated-only `consume_action_budget(text)` RPC updates an internal counter
atomically and accepts only fixed action names/limits. It uses SECURITY DEFINER with an
empty search path, derives the user from Auth and grants no direct user table writes.
Budgets cover dashboard requests, not future submission quotas or the entire Data API.

`dashboard/src/types/database.ts` was generated from the migrated local schema using the
pinned CLI's `gen types typescript --local`. Regenerate deliberately after schema changes;
do not regenerate tracked types as part of environment startup.

## Migration discipline

For local development: `npm run db:migrate` applies pending migrations using history.
Run it again to confirm nothing remains pending. Never rerun raw migration SQL to refresh
an existing database. New schema changes require a new migration file. No reset is required.

For a hosted project, review the migration, back up existing data, link the correct project
using Supabase CLI, inspect `migration list` and `db push --dry-run`, then deliberately
apply `db push`. This workspace has not connected to or modified a hosted project.

`npm run db:test` runs pgTAP assertions with synthetic, explicitly labelled fixtures in
a transaction that rolls back. HTTP tests create and remove isolated local Auth test
accounts and their files. Run those tests only against the included local development stack.

## Phase 3 additions

Apply `20261013000100_import_and_screening.sql`, `20261013000200_screening_integrity.sql`,
`20261013000300_cascade_safe_invalidation.sql` and
`20261013000400_screening_freshness_and_ai_budget.sql` in migration order.

Jobs gain original/normalized URLs, employer region, search disposition and a generated
company/title fingerprint. `normalize_job_url(text)` and its row trigger enforce identity
for direct API writes too. A normalized collision in existing data stops migration visibly
for review; no listings or application histories are silently discarded.

`import_jobs(jsonb)` uses authenticated owner identity and a 1–20 row transaction. Unique
indexes serialize duplicate races; conflicting URL/source matches abort the whole batch.
Existing data is returned without being overwritten. `job_reviews` retains the latest
review input and `job_classifications` stores owner-only, version-bound model suggestions.

Eligibility history gains current flags, job/profile revisions, master and evidence snapshots
and expiry. `record_job_screening` locks the job/profile, compares the input snapshot and
commits review/history together. Ordinary users may update the current flag but cannot
rewrite score/reason history or expiry. Trigger invalidation and profile/master/version checks
in `job_screening_summary` guard against stale positives. Checks expire after seven days,
sooner if a dated FX conversion expires. Closed/expired jobs override earlier positives.

The security-invoker summary retains RLS, supports all review/filter counts and exposes
monthly equivalents in the evaluated profile currency only while current. These values
live with the assessment, keeping original published pay untouched. `dashboard_metrics`
adds eligible, needs-review and unassessed job counts without fabricating verified submissions.

Auth cascades invoke a locked-down trigger-only definer for invalidation; it derives owner
identity from the modified table row and skips deleted profiles. No broad Auth-role grants
were added. The internal action budget now includes 10 classifier attempts/hour.

## Phase 4 additions

`resume_facts` stores an editable candidate-verified transcript per owned immutable resume.
Extraction writes an unverified draft; explicit verification records the current timestamp.
`application_packages` is append-only to authenticated users and snapshots its owned application,
original resume version, engine output, source facts and input revisions. `package_reviews`
records historical candidate review without rewriting a package. Composite owner foreign keys,
RLS and explicit grants prevent cross-account references or private text access.

`record_application_package` locks job/profile/application inputs, compares transcript and
answer-library revisions, and writes the immutable package plus audit event transactionally.
A unique owner/request ID makes concurrent retries return one version. `review_application_package`
rejects stale snapshots, unanswered questions and already submitted/integration records. It
copies reviewed documents into the tracker and preserves Needs review unless the current
screening summary is eligible. Preparation never supplies a submission confirmation.
Sensitive answer writes cannot disable review by labeling the question Routine. Text/answer
edits serialize with package writes; the answer-delete trigger is a revoked, trigger-only
definer to handle Auth cascades without broad permissions. Candidate-authored Data API
content is not independent provider verification: future submission adapters must recompute
eligibility and validate factual content rather than trust stored owner-writable labels.

## Phase 5 additions

Migration `20261013001000_submission_handoffs.sql` adds owner-only `submission_controls`
and `submission_runs`. Global pause is the default. Runs allow only dry checks or manual
handoffs; ordinary clients have SELECT-only access. Restricted owner-authenticated RPCs
lock current inputs, check package/screening revisions, create attempts and audit events,
and apply actual candidate-reported outcomes. No authenticated RPC can create an API mode
or provider-verified state. Application/request identity is bound to idempotent retries.

A partial unique index prevents multiple ready, uncertain or candidate-reported handoffs
per application. Explicit cancellation permits a new claim; uncertainty never expires
into an automatic retry. Manual tracker confirmations reconcile an open handoff. Foreign
keys preserve history if an individual application/package deletion is attempted; Auth
account deletion still cascades all private records. SQL and real Auth API tests cover it.
`submission_snapshot` is a revision fingerprint, not proof of externally verified facts.
Stored owner-supplied reports remain advisory: future live adapters must compute trusted
validation themselves rather than reuse browser-writable inputs or reports as permission.

## Phase 6 additions

Three additive migrations introduce private scheduler settings, tasks and attempt history,
operational heartbeats, restricted processing capabilities and profile-local handoff quotas.
Authenticated owners can read their queue but cannot directly rewrite state/leases/history.
Owner RPCs enqueue bounded review work, schedule follow-ups, acknowledge/cancel tasks and
record actual responses. Follow-up edits synchronize/cancel local reminders transactionally;
restoring a previous date deliberately starts a fresh bounded cycle without erasing attempts.

The `remote_jobs_scheduler` NOLOGIN role grants only four fixed worker RPCs. A separate local
login is provisioned by the helper; neither the diagnostic connection nor a service-role key
is used for runtime processing. `SKIP LOCKED`, owner serialization, a post-lock capacity
recheck and lease tokens prevent concurrent overclaiming. Pauses are checked again before
completion. Expired leases recover only idempotent local checks; submission runs are outside
this queue. Transient failures back off and stop after three attempts. Historical errors
are sanitized codes, not driver text or candidate content.

Handoff allocation locks the owner and counts distinct actual completions today plus all
unresolved handoffs, including carryover. Calendar boundaries use the profile IANA timezone;
DST does not assume a 24-hour day. A completion shared by tracker and handoff counts once.
The quota blocks new allocations but never blocks recording the actual outcome. Tests cover
real concurrent worker logins and simultaneous different handoffs at the last daily slot.
Auth deletion cascades private tasks/history; worker heartbeats contain no candidate data.
