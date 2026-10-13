# Validation

Phase 5 was validated on **13 October 2026** against local Supabase PostgreSQL 17 and
the Next.js production server. ESLint, strict TypeScript, production build and Ruff passed.
**150 dashboard unit tests**, **14 worker tests**, **229 PostgreSQL assertions** and
**337 production HTTP assertions** passed across Phases 1–5 (20 + 74 + 65 + 82 + 96).
The worker health and read-only database probes passed. The foundation HTTP suite also
scanned the production client output for Supabase credentials.

New tests cover factual package regeneration, file integrity, current eligibility, stale
sources/reviews, pause policy, simultaneous request idempotency, a single active handoff,
uncertain outcomes, explicit cancellation, future-time rejection, candidate-reported receipt
provenance, direct history mutation denial, cross-owner privacy and actual Auth cascades.
An active claim remains visible beyond the latest 30 history entries. The mock API suite
covers correlated receipts, bare HTTP 200, mismatches, timeouts, rate limits/authentication,
policy changes after reservation and audit-storage failures before/after dispatch. No
external provider request or employer form submission occurs in these tests.

Production Chromium passed **17 checks** covering the hydrated handoff workflow, paused-form
input preservation, controls refreshing after save, uncertain-outcome guidance, confirmed
cancellation, replacement handoffs, reported receipts and tracker synchronization. The 375px
mobile screenshot was inspected; no horizontal overflow or browser runtime error occurred.
The private harness was corrected to open each source-evidence disclosure and use the form's
alert role during validation. The browser harness/screenshots stay in ignored `.local/`;
its cloud-supplied runtime is not a CI dependency. All synthetic accounts/files were removed.

The reusable Phase 5 startup draft was saved with install/network/credential settings
preserved. Review and save in environment settings, then publish to activate it; publication
and restoration in a new task are unverified. GitHub Actions now includes Phase 5 HTTP tests;
remote execution is not claimed. No new dependency or credential is required. No live API
adapter or production API AttemptStore is configured because authorized platform access is
unavailable. The supported route is the candidate-operated official form. Scheduler, daily
quota enforcement and background dispatch remain Phase 6. Read PHASE5.md for commands,
important files, the full verification walkthrough and limitations.

The Phase 4 results below describe its earlier release.

Phase 4 was validated in this cloud machine on **13 October 2026**. The production build,
strict TypeScript, ESLint and Ruff passed. The suite includes **104 dashboard unit tests**,
**14 worker tests**, **183 PostgreSQL assertions** and **241 production HTTP assertions**
across Phases 1–4 (20 + 74 + 65 + 82). The Phase 4 HTTP suite was rerun after browser-driven
fixes; all checks use isolated synthetic local accounts and clean up their data/files.

New coverage includes correct role master selection, source-grounded document generation,
preservation of the full resume, unsupported qualification/metric rejection, exact verified
answer matching, conflicting/unverified answers, mandatory sensitive review, real PDF/DOCX/TXT
server extraction, snapshot staleness, concurrent package idempotency, private attachment
downloads, immutable versions, cross-owner denial, transactional candidate review and no
fabricated submission. Changes to resume text and the answer library invalidate review.

Production Chromium passed **18 checks** across the full preparation workflow, candidate verification,
unanswered sponsorship, library updates, stale/new versions, downloads, explicit review,
mobile preview and version history. A browser test caught attachment links leaving a client
navigation pending; native download links avoid that and permit the subsequent review action.
Screenshots and harnesses stay private in ignored `.local/`; the browser runtime is supplied
by this cloud machine and is not a CI dependency.

The reusable Phase 4 `start_skill` is saved, with installation, networking and existing secret
requirements preserved. Publication and restoration in a new task remain unverified.
GitHub Actions includes the Phase 4 workflow; remote CI execution is not claimed. Generation
is deterministic and extractive, with TXT exports: no live AI generation, OCR, or formatted
PDF/DOCX export is implemented. No hosted deployment, live sources, employer submission
adapters or scheduler were run. Read PHASE4.md for usage and boundaries.

The Phase 3 results below describe its earlier release.

Phase 3 was validated in this cloud machine on **13 October 2026** against local
Supabase PostgreSQL 17. Phases 1 and 2 remain in the regression suite.

| Phase 3 release check | Result |
| --- | --- |
| ESLint and TypeScript | Passed, zero lint warnings |
| Next.js production build | Passed, including import and review routes |
| Dashboard unit tests | 77 passed: 24 earlier tests plus 53 screening/import/provider tests |
| Python worker tests | 14 passed; worker remains diagnostic |
| Ruff worker/script lint | Passed |
| All database suites | 156 passed: 104 earlier assertions plus 52 Phase 3 assertions |
| Four additive Phase 3 migrations | Applied locally; pending-migration replay passed; no reset |
| Development HTTP regression | Phase 2: 74 passed; Phase 3: 65 passed |
| Production HTTP regression, Phase 1 | 20 passed |
| Production HTTP regression, Phase 2 | 74 passed |
| Production HTTP regression, Phase 3 | 65 passed |
| Production Chromium workflow | 14 passed; actual review content/mobile layout checked; no runtime errors |
| Client Supabase key scan | Passed on the new production build |
| GitHub Actions | Defines local database and Phases 1–3 HTTP regressions; remote execution not verified here |
| Live AI provider | Unconfigured; contract/error behavior tested with mocked responses |
| Hosted deployment/migrations | Not performed or verified |
| Real job-platform submissions | None; no adapter or scheduler implemented |

The final production HTTP run executed **159 assertions** across all three phases. It used
real rendered actions, Auth cookies, RLS, Storage and transactional RPCs. Concurrent tests
proved one imported listing and one application record across retries. Source quotations,
score factors, normalized pay, country restrictions, review/filter counts, profile/master
invalidation, stale form rejection and mocked suggestion copying were exercised. AI output
cannot override the country exclusion. All isolated accounts, files and records were removed.

Screening unit tests cover fully remote international contracting, US/U.S./residency-only
exclusions, unknown scope and salary, closure/expiry, annual/monthly/hourly equivalents,
explicit FX and expiry, missing skills, seniority, mandatory qualifications, authorization,
configurable weights, negations and optional-versus-mandatory office visits. A range upper
value copied into the minimum field cannot count as proof of a guaranteed minimum.

Browser checks exercised real import and source-review forms, individual score factors,
changing facts resetting source confirmation, hard exclusion despite a high score, and
an actual unresolved record in the mobile queue. Private screenshots were inspected.
The harness uses this machine's existing Chromium/Playwright runtime and is not a repository
or CI dependency. Provider tests reject ungrounded/extra fields, incomplete/oversized output,
handle bounded rate-limit retries, and never echo a credential-bearing provider error.

A real integration test caught Auth account deletion failing because an invoker trigger
required public-table access from Supabase's separate Auth database role. A trigger-only
SECURITY DEFINER derives ownership from the authorized row, has empty search path and no
browser EXECUTE grant, and skips deleted profiles. Actual Auth API deletion and SQL
permission/cascade assertions now pass; the two failed-run fixture accounts were removed.
SQL role impersonation was unavailable; no privilege was loosened to simulate it.

Cloud `start_skill` was saved for Phase 3. Installation, network and credential requirements
were preserved. The draft has not been published or restored in a new task. Read PHASE3.md
for usage, decision meanings, source provenance, optional AI configuration and boundaries.
Automatic resume selection/tailoring, verified screening answers, submission adapters and
scheduler/daily submission quotas remain in their later phases. No fake opportunities or
candidate facts were added to a real account, and no employer was contacted.

The historical Phase 2 results below describe its earlier release.

Phase 2 was validated in this cloud machine on **10 October 2026** against the included
local Supabase PostgreSQL 17 stack. These results do not establish hosted deployment,
environment publication, or restoration in a fresh task.

| Check | Result |
| --- | --- |
| ESLint | Passed, zero warnings |
| TypeScript and Next route types | Passed |
| Next production build | Passed; all authenticated workspace routes generated |
| Dashboard unit tests | 24 passed: configuration, forms, date handling and document checks |
| Python worker unit tests | 14 passed |
| Ruff lint for worker/scripts | Passed |
| Additive Phase 2 migrations | Applied locally; pending-migration replay passed without resetting data |
| Database pgTAP suites | 104 passed: 58 foundation and 46 CRM assertions; fixtures rolled back |
| Worker database probe | Passed using a real read-only local PostgreSQL connection |
| Phase 2 development HTTP workflow | 74 assertions passed |
| Production foundation HTTP workflow | 20 assertions passed, including sign-in and client-secret scan |
| Phase 2 production HTTP workflow | 74 assertions passed |
| Production Chromium workflow | 12 checks passed; no browser runtime errors |
| Staged credential/private-output scan | Passed; no actual credentials or local generated outputs included |
| GitHub Actions | Updated workflow; execution on GitHub not verified here |
| Hosted Supabase and public deployment | Not configured, migrated or tested |
| Eligibility, AI generation, provider submission and scheduler | Later phases; not implemented or tested |

HTTP checks use actual rendered Next Server Actions, Auth cookies, Supabase RLS and
Storage APIs. They cover profile validation, private version uploads, duplicate cleanup,
master changes, owner-only signed files, jobs/applications CRUD, search, optimistic edits,
status history, manual confirmations, timezone counts, cross-owner access, CSRF rejection
and deliberate deletion. The exact 10 MiB boundary passes; a file one byte larger is
rejected before Storage. No employer or AI service is contacted.

Chromium checks cover real browser sign-in, failed-validation input preservation, profile
saving, a private upload, browser confirmation for master selection, status saving, notes
persisting after reload, real dashboard counts and the 375 px mobile layout. Desktop/mobile
screenshots were inspected privately. The browser harness uses the cloud machine's existing
Chromium/Playwright runtime and is not a required repository dependency or CI step.

All HTTP and browser fixture files, Auth accounts, profiles, jobs, applications, activity
and action budgets were deleted after each run. No real candidate details or resumes were
supplied or invented. Fixture submission records are explicitly synthetic candidate reports;
no application was sent to an employer. The production client JavaScript scan found no
Supabase keys.

## Issues caught and resolved

- PostgreSQL interpreted a budget function variable named `current_time` as its SQL
  time-only keyword. An additive migration renamed the variable, and shared budgets pass.
- Notes edits originally used a preparation event label. Dedicated creation/edit events
  now distinguish ordinary changes from before/after status transitions.
- Next's default proxy body buffer did not include multipart overhead for the advertised
  10 MiB file limit. Proxy and action limits are both 11 MiB, and the boundary was tested.
- React automatically reset action forms after validation errors. The form component now
  preserves typed input; Chromium verifies that a corrected profile can be saved.
- Next can return HTTP 200 for a streamed not-found page. Access checks verify the not-found
  result and absence of foreign content, in addition to RLS; file handlers return 404.

Phase 1 was previously validated on 9 October 2026: frozen dependency installs, reusable
installation script, local Supabase stop/start with health checks, 9 dashboard tests,
14 worker tests, 58 SQL assertions and 20 HTTP assertions on both server modes passed.
Its npm cache, slim-image, Docker localhost-proxy and password-provider setup fixes remain
in place. See SETUP.md for those details.

## Changes and environment state

Phase 2 adds the authenticated workspace route group, shared forms, validation/document
helpers, generated database types, three additive migrations, CRM SQL tests,
`scripts/smoke_phase2.py` and `docs/PHASE2.md`. It updates the Supabase server typing,
proxy, upload limits, public landing/health phase, styling, usage/security/architecture
instructions and CI naming. The earlier dashboard route moved into the workspace group.

Secrets, private documents, local logs/screenshots, dependencies and build outputs are
ignored and excluded from Git. No dependency declarations or lockfiles changed in Phase 2.
The Python worker remains the foundation diagnostic CLI.

Reusable cloud `start_skill` instructions were updated for Phase 2. The tested
`install_script`, network policy and credential requirements were preserved. The draft
was saved; publication and a new-task restoration are unverified. A real candidate account
can be created through the secure local helper, then Settings and Resumes provide the
first steps. Phase 3 begins when requested.
