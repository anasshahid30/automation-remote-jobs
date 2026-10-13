# Phase 5 operations

From the existing repository checkout:

```sh
npm run db:start
npm run db:migrate
npm run dev
```

Restart services after a new cloud task or machine; running processes are not part of a
reusable snapshot. Do not assume Docker volumes survive. Inspect migration history and
apply only pending files. Preserve user environment files, candidate data and master resumes.

The public `/api/health` reports dashboard liveness. `/api/health/database` returns 401 for
anonymous requests, 503 for missing/unavailable configuration, and 200 only for a signed-in
user whose database passes the foundation RPC. A PID/open port alone does not prove readiness.

The worker is a CLI that exits after its diagnostic command:

```sh
(cd worker && .venv/bin/python main.py --health)
(cd worker && .venv/bin/python main.py --check-database)
```

Exit 0 means the selected check passed; 1 means not configured/unavailable; 2 means invalid
configuration. There is no background automation service to start in Phase 5.

No live sources are connected and no applications are submitted. The candidate preference
default is paused and the worker has no executable discovery/submission route. The Phase 5 manual
handoff controls are separate: they permit a candidate-operated form, never API automation.

Stop only services you started (`Ctrl+C` for Next.js, `npm run db:stop` for this local stack).
Do not share raw environment files, Supabase CLI logs or private documents. Store hosted
secrets securely in environment settings; a saved draft is separate from runtime configuration.

See `docs/VALIDATION.md` for the results obtained in the cloud machine and remaining limits.

Pending Phase 3 migrations add normalized identities, review/classification tables, snapshot
guards and expiry-aware summaries. Never edit an already-applied migration or reset data to
clear a collision. A normalized-identity collision must be reviewed deliberately. Source
checks expire after seven days (earlier for old FX quotes); changed facts invalidate them.
Use the Review queue and record new candidate-checked quotations.

GitHub Actions defines lint/types/unit/build, local Supabase migrations/SQL assertions,
worker checks and Phases 1–5 production HTTP workflows. CI creates/deletes isolated test
accounts; no hosted migration, real candidate update or employer submission is performed.

Phase 4 migrations add private verified resume transcripts, immutable application packages,
version-aware review and answer mutation guards. Generated documents are authenticated TXT
downloads from database snapshots. Resume extraction, source review, package generation and
candidate approval run as bounded server actions. Unanswered questions and changed inputs
block package review; unknown eligibility retains Needs review. See PHASE4.md.

Phase 5: run pending migrations, then follow PHASE5.md. Global handoffs default to paused;
per-source overrides can pause a platform. Dry checks continue while paused and never count
as submissions. Pausing prevents new handoffs but cannot cancel a form already open at an
employer. Record actual outcomes even while paused. Never retry an uncertain outcome until
the candidate checks the employer receipt/history; cancel only after verifying no submission.
Do not edit or delete attempt history to free a duplicate claim. No live submission secrets
are needed or requested. The worker still has no dispatch loop.
