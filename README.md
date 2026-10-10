# Remote Job Agent

A personal remote-job application workspace, implemented in small, verifiable stages.

**Current stage: Phase 1 foundation.** Next.js/TypeScript/Tailwind, Supabase Auth server
configuration, owner-secured PostgreSQL migration, private resume storage, Python worker
health checks and local development tests. No discovery, AI generation or submission is running.

Start with [macOS setup](docs/SETUP.md). Read [validation results](docs/VALIDATION.md),
[architecture](docs/ARCHITECTURE.md), [database](docs/DATABASE.md),
[security](docs/SECURITY.md) and [operations](docs/OPERATIONS.md).

| Path | Contents |
| --- | --- |
| `dashboard/` | Landing/sign-in/foundation pages, server-only Supabase client, health routes, configuration tests |
| `worker/` | Python diagnostic CLI, Pydantic settings, read-only database probe, unit tests, pinned dependencies |
| `supabase/` | Local service configuration, initial migration, transactional RLS/constraint tests |
| `scripts/` | Safe local setup/account helpers and HTTP integration smoke checks |
| `docs/` | Setup, architecture, data/security decisions, operations, validation |

Initial preferences: Pakistan, fully remote, backend/AI automation/full-stack, junior/mid,
full-time/contract, USD 1,500/month minimum preference, daily target capped at 30.
Real contact details and city must be entered by the candidate. Unknown international
eligibility must be reviewed; a remote label alone is insufficient.

Phase 2 will add candidate settings, private resume upload UI, job/application CRUD and
real dashboard statistics. The foundation does not claim production submission readiness.
