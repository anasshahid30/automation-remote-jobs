# Phase 5: validate and track an official-form handoff

The supported route is human-assisted: you complete the employer's official form yourself.
No employer-approved submission API access is configured. The provider interface and mocked
API tests are ready; no employer was contacted during development or testing. Live API
integration remains dependent on authorized provider access. Scheduling, bounded dispatch
concurrency, daily quota enforcement and retry scheduling remain Phase 6.

## Run on macOS

From your existing `automation-remote-jobs` checkout with Docker Desktop running and the
Phase 1 setup installed:

```sh
git pull origin main
npm run db:start
npm run db:migrate
npm run dev
```

Keep your environment files and private resumes. No new secret, dependency installation or
database reset is needed for Phase 5. Use SETUP.md for first-time installation. For local
validation, stop your own dev server before the build, then use separate terminals:

```sh
npm run check
npm run db:test
worker/.venv/bin/ruff check worker scripts
(cd worker && .venv/bin/pytest)
npm --prefix dashboard run build
npm --prefix dashboard run start
```

```sh
worker/.venv/bin/python scripts/smoke_local.py
worker/.venv/bin/python scripts/smoke_phase2.py
worker/.venv/bin/python scripts/smoke_phase3.py
worker/.venv/bin/python scripts/smoke_phase4.py
worker/.venv/bin/python scripts/smoke_phase5.py
```

These use isolated synthetic local accounts and delete their own files/records afterwards.
They refuse hosted Supabase and never operate real employer forms. Actual execution results
are recorded in VALIDATION.md; GitHub Actions execution is separate from local validation.

## Verify in the workspace

1. Review current job evidence and eligibility. Upload the matching real resume, verify its
   transcript, generate a factual package and explicitly apply the reviewed version.
2. From the application or package preview, choose **Validate and start handoff**.
3. Run a dry check. It re-evaluates eligibility, job/profile/transcript/answer revisions,
   role match, full document/answer provenance, candidate review, private file checksum and
   prior attempts. Resolve every failure. Historical dry reports are not current permission.
4. Global handoffs start paused. Enable them deliberately and ensure the source is enabled.
   A source pause blocks that source independently. Dry checks still work while paused.
5. A passed dry check exposes **Start manual handoff**. Confirm that you will complete the
   official form and inspect all extra employer questions. Starting reruns current checks
   and creates a durable claim; it sends nothing and does not count as a submission.
6. Open the official form yourself. Use the reviewed private documents and truthful answers.
   Download the original formatted resume if the employer requires PDF/DOCX; generated
   TXT documents remain preparation artifacts. Complete any additional questions yourself.
7. Record the actual result: confirmed completion with receipt/reference and actual local
   time, uncertainty, or cancellation after verifying nothing was submitted. Completion
   appears as **candidate-reported**, never API-verified. Only completed reports update the
   actual application count. Outcomes can be recorded while new handoffs are paused.
8. An uncertain handoff blocks a second attempt. Check the employer's receipt/history first.
   A confirmed no-submission cancellation releases the claim; a completed claim is retained.
   Saving a manual confirmation through the existing tracker also reconciles an open handoff.

Pausing cannot cancel a form already open at an employer. Review sensitive declarations for
each employer. An empty package question list does not establish that the employer asks none.
Only the latest 30 runs are listed, but an older active claim remains visible and blocks
another handoff. Individual application deletion is restricted once it has run history;
account deletion still removes private data through Auth cascades.

## Important files

| File or directory | Role |
| --- | --- |
| `dashboard/src/lib/submission/validation.ts` | Current eligibility, truthful content, review, file and duplicate checks |
| `dashboard/src/lib/submission/load.ts` | Owner-scoped inputs, private checksum verification and revision consistency |
| `dashboard/src/lib/submission/adapters.ts` | Provider interface, policy checks, atomic claim contract and correlated receipt validation |
| `dashboard/src/app/(workspace)/applications/[id]/submission/` | Dry reports, pause controls, official-form handoffs and actual outcomes |
| `supabase/migrations/20261013001000_submission_handoffs.sql` | Private immutable run history, serialized RPCs, duplicate guard and reconciliation |
| `supabase/tests/submission.test.sql` | Permissions, lifecycle, concurrency constraints, transaction and deletion checks |
| `scripts/smoke_phase5.py` | Actual production HTTP forms, simultaneous retries, privacy and cleanup |
| `.github/workflows/checks.yml` | Adds Phase 5 production regressions to existing checks |

The adapter contract includes validation, payload preparation, submission, confirmation,
error classification and attempt recording. The mock exists only in tests. Dry runs reserve
nothing and dispatch nothing. A future API route must have explicit provider authorization,
current approval, global/source permission and a durable atomic AttemptStore. It checks
policy again after reservation; failures saving the dispatch audit stop sending. Bare HTTP
200, uncorrelated receipts or timeouts are uncertain. Ambiguous claims never auto-retry.
Authentication, rejection and rate-limit classifications are recorded with no scheduled retry.
There is currently no production API AttemptStore or provider-specific request implementation.
Owner-authored reports are advisory and cannot serve as independent API confirmation.
