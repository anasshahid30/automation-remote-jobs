# Database foundation

Migration: `supabase/migrations/20261009000100_foundation.sql`.
It creates eight application tables in one transaction, indexes, owner policies,
timestamp triggers, the health RPC, and a private `resumes` bucket.

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

Every table has a UUID key and `user_id` linked to Supabase Auth. Composite foreign keys
prevent associating an owner's application with somebody else's job or resume. RLS is
enabled and CRUD privileges explicitly granted to authenticated users for their own data.
Anonymous users have no application-table access. Audit events allow SELECT/INSERT only;
deleting a parent/account can cascade events as part of eventual data deletion.

Jobs deduplicate on `(user_id, source_platform, external_job_id)` when a source ID exists,
and `(user_id, canonical_url)`. The canonical URL must be normalized by the future import
engine; Phase 1 does not implement URL normalization or cross-source semantic matching.

Undisclosed salary amounts are NULL. `salary_min_annual`/`salary_max_annual` are normalized
annual values; original amounts and `salary_period` preserve source units. Hourly rates
require an explicit hours assumption, and foreign currency requires a sourced conversion.
Neither is automatically converted by this migration.

An ELIGIBLE check requires pass outcomes and source evidence. Submission/response/interview/
offer statuses require `applied_at` and nonempty confirmation evidence. These constraints
are a foundation, not proof that the contents are truthful; source confirmation validation,
expiry checks, state transitions and transactional quota enforcement come in later phases.

Documents must use `USER_UUID/version-specific-name.ext` inside the private bucket.
PDF, plain text and DOCX are allowed up to 10 MiB. No Storage UPDATE policy exists:
upload a new version instead of overwriting a master. Metadata changes and master selection
will be managed in Phase 2; malware scanning/document extraction are not implemented.

## Migration discipline

For local development: `npm run db:migrate` applies pending migrations using history.
Run it again to confirm nothing remains pending. Never rerun raw migration SQL to refresh
an existing database. New schema changes require a new migration file. No reset is required.

For a hosted project, review the migration, back up existing data, link the correct project
using Supabase CLI, inspect `migration list` and `db push --dry-run`, then deliberately
apply `db push`. This workspace has not connected to or modified a hosted project.

`npm run db:test` runs pgTAP assertions with synthetic, explicitly labelled fixtures in
a transaction that rolls back. The HTTP smoke test creates and removes one isolated local
Auth test account. Run those tests only against the included local development stack.
