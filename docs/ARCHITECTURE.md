# Phase 2 architecture

This is a personal remote-job CRM built on the Phase 1 foundation. No job sources, AI generation,
submission adapters, or scheduler are implemented yet. There is no FastAPI service because
the worker does not need an HTTP interface at this stage.

- `dashboard/`: Next.js App Router, React server components, strict TypeScript, Tailwind.
  The public landing page explains the current stage. The authenticated workspace groups
  `/dashboard`, `/settings`, `/resumes`, `/jobs` and `/applications` under a shared layout.
  Every page, file handler and server action separately verifies Auth, then uses an owner
  client with RLS. The proxy refreshes sessions and marks private responses as non-cacheable.
  Zod validates form fields; additive database guards protect direct API writes too.
  Typed schema definitions are generated from the actual local database.
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

1. Foundation: complete.
2. Candidate profile, CRM, private resume upload UI, and real dashboard statistics: complete.
3. Manual import, normalized deduplication, deterministic eligibility, evidence review.
4. Truthful document generation and verified answer selection.
5. Permitted submission adapters, mocked confirmation tests, idempotency and dry runs.
6. Scheduling, concurrency limits, timezone-aware quotas, follow-ups and monitoring.

The 17 business cases in the master brief belong to the later stages as their components
are implemented. Current tests validate configuration, authentication, candidate settings,
document validation, CRUD, schema invariants, audit transactions and owner isolation.
They do not claim to validate an eligibility/submission engine.

Local Docker containers are development services. Docker volumes are not assumed to
survive a cloud snapshot. Future tasks must start services and inspect migration status.
No existing database is reset by any installation or startup script.
