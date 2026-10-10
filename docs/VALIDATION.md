# Validation

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
