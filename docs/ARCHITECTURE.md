# Phase 1 architecture

This is the foundation of a personal remote-job workspace. No job sources, AI generation,
submission adapters, or scheduler are implemented yet. There is no FastAPI service because
the worker does not need an HTTP interface at this stage.

- `dashboard/`: Next.js App Router, React server components, strict TypeScript, Tailwind.
  The public landing page explains the current stage. Supabase Auth protects `/dashboard`.
  Server actions handle sign-in/out. A proxy refreshes sessions; each protected page/API
  independently verifies the user with Supabase before returning data.
- `supabase/`: versioned PostgreSQL schema, owner isolation, private document bucket,
  and transactional SQL tests. Auth user IDs identify the record owner across all tables.
- `worker/`: Python CLI, validated Pydantic settings, bounded read-only database probes.
  HTTPX is installed for future authorized integrations. No submission code exists.
- `scripts/`: local setup helpers and real HTTP smoke checks. Helpers that use admin
  credentials refuse non-loopback Supabase URLs and never print credentials.

Dashboard → Supabase Auth/Data API → PostgreSQL with RLS.
Future worker tasks will use a deliberately scoped server-side identity; the Phase 1
worker database credential is a diagnostic configuration, not a submission identity.

## Delivery stages

1. Foundation: this implementation.
2. Candidate profile, CRM, private resume upload UI, and real dashboard statistics.
3. Manual import, normalized deduplication, deterministic eligibility, evidence review.
4. Truthful document generation and verified answer selection.
5. Permitted submission adapters, mocked confirmation tests, idempotency and dry runs.
6. Scheduling, concurrency limits, timezone-aware quotas, follow-ups and monitoring.

The 17 business cases in the master brief belong to the later stages as their components
are implemented. Phase 1 tests validate configuration, authentication, schema invariants,
and owner isolation. They do not claim to validate an eligibility/submission engine.

Local Docker containers are development services. Docker volumes are not assumed to
survive a cloud snapshot. Future tasks must start services and inspect migration status.
No existing database is reset by any installation or startup script.
