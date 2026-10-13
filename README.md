# Remote Job Agent

A personal remote-job application workspace, implemented in small, verifiable stages.

**Current stage: Phase 5 validated human-assisted handoffs.** Check a reviewed application
package against current eligibility, verified facts, private file integrity and previous
attempts. Enable the global/source handoff controls, complete the official employer form
yourself, then record its actual outcome. Uncertain outcomes block another handoff. The
submission adapter contract is tested with a mock provider; no live API access is configured.
Earlier import, screening, preparation, settings and CRM workflows remain available.

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
[Phase 2 walkthrough](docs/PHASE2.md), [Phase 3 workflow](docs/PHASE3.md)
[Phase 4 preparation](docs/PHASE4.md) and [Phase 5 handoffs](docs/PHASE5.md) after signing in. Existing environment files and
uploaded documents are preserved; no database reset is needed.

Manual submission reports are labelled as your reports. Saving or approving a record
does not submit anything to an employer. Preparation uses factual, deterministic source excerpts
and needs no AI key. Live API dispatch awaits employer-approved access. Scheduling and daily quotas remain Phase 6.
