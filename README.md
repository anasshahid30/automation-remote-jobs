# Remote Job Agent

A personal remote-job application workspace, implemented in small, verifiable stages.

**Current stage: Phase 4 application preparation.** Select the matching role resume,
extract and verify its text, prepare a company-specific cover letter and a tailored resume
from exact source excerpts, and select verified screening answers. Preview private immutable
document versions, resolve unanswered questions, then explicitly review a package before
applying it to your tracker. Earlier import, screening, settings and CRM workflows remain available.
Automation is paused.

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
and [Phase 4 preparation](docs/PHASE4.md) after signing in. Existing environment files and
uploaded documents are preserved; no database reset is needed.

Manual submission reports are labelled as your reports. Saving or approving a record
does not submit anything to an employer. Preparation uses factual, deterministic source excerpts
and needs no AI key. Authorized submission adapters and scheduling come later.
