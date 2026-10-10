# Phase 2 operations

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
configuration. There is no background automation service to start in Phase 2.

No live sources are connected and no applications are submitted. The candidate preference
default is paused and the worker has no executable discovery/submission route. Leave this
state until the later eligibility, factual-answer, idempotency and submission checks pass.

Stop only services you started (`Ctrl+C` for Next.js, `npm run db:stop` for this local stack).
Do not share raw environment files, Supabase CLI logs or private documents. Store hosted
secrets securely in environment settings; a saved draft is separate from runtime configuration.

See `docs/VALIDATION.md` for the results obtained in the cloud machine and remaining limits.
