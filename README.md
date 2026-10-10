# Remote Job Agent

A personal remote-job application workspace, implemented in small, verifiable stages.

**Current stage: Phase 2 candidate profile and CRM.** Save your real profile and preferences,
upload private resume versions, select three role-specific masters, manage saved jobs and
application records, and see account statistics and activity. Built on Next.js/TypeScript,
Supabase Auth/PostgreSQL/Storage, and a Python diagnostic worker. Automation remains paused.

Start with [macOS setup](docs/SETUP.md). Read [validation results](docs/VALIDATION.md),
[architecture](docs/ARCHITECTURE.md), [database](docs/DATABASE.md),
[security](docs/SECURITY.md) and [operations](docs/OPERATIONS.md).

| Path | Contents |
| --- | --- |
| `dashboard/` | Authenticated settings, resumes, jobs, applications and dashboard; typed server-only Supabase client and validation tests |
| `worker/` | Python diagnostic CLI, Pydantic settings, read-only database probe, unit tests, pinned dependencies |
| `supabase/` | Additive migrations, private storage policies, transactional audit and RLS/constraint tests |
| `scripts/` | Safe local setup/account helpers and HTTP integration smoke checks |
| `docs/` | Setup, architecture, data/security decisions, operations, validation |

Initial preferences: Pakistan, fully remote, backend/AI automation/full-stack, junior/mid,
full-time/contract, USD 1,500/month minimum preference, daily target capped at 30.
Real contact details and city must be entered by the candidate. Unknown international
eligibility must be reviewed; a remote label alone is insufficient.

After pulling updates, run `npm run db:migrate`, then `npm run dev`. Follow the
[Phase 2 walkthrough](docs/PHASE2.md) after signing in. Existing environment files and
uploaded documents are preserved; no database reset is needed.

Manual submission reports are labelled as your reports. Saving or approving a record
does not submit anything to an employer. Phase 3 will add import normalization, eligibility
rules and evidence review; AI generation and authorized submission come later.
