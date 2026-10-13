# Phase 5 architecture

This is a personal remote-job CRM with manual import, evidence-based screening and truthful
document preparation and validated manual handoffs. No live job source, authorized API
adapter or scheduler is configured. There is no FastAPI service because
the worker does not need an HTTP interface at this stage.

- `dashboard/`: Next.js App Router, React server components, strict TypeScript, Tailwind.
  The public landing page explains the current stage. The authenticated workspace groups
  `/dashboard`, `/settings`, `/resumes`, `/jobs`, `/review` and `/applications` under a shared layout.
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
3. Manual import, normalized deduplication, deterministic eligibility, optional AI classification and evidence review: complete.
4. Truthful document generation and verified answer selection: complete (extractive generation).
5. Adapter contract, mocked confirmation tests, idempotent dry checks and human-assisted handoffs: complete. Live API adapter awaits authorized access.
6. Scheduling, concurrency limits, timezone-aware quotas, follow-ups and monitoring.

The 17 business cases in the master brief belong to the later stages as their components
are implemented. Current tests validate configuration, authentication, candidate settings,
document validation, CRUD, schema invariants, audit transactions and owner isolation.
Phase 3 also validates deterministic screening, concurrent imports, stale evaluations and mocked
classification. Phase 5 adds submission validation and mocked API lifecycle tests.

Phase 4's pure TypeScript preparation engine emits unchanged verified resume excerpts,
company/role-specific cover letters, and exact verified answers. `unpdf` pins the bundled
Mozilla PDF.js parser; DOCX extraction inflates only a bounded `word/document.xml` member.
Candidate verification is separate from extraction. PostgreSQL RPCs bind packages to job,
profile, resume-text and answer-library versions, serialize preparation retries, and audit
review transactionally. Documents are generated as TXT from private immutable JSON snapshots;
there is no duplicate public storage copy. The private file handler verifies Auth and RLS on
every request. No AI provider receives candidate text in this workflow.

Local Docker containers are development services. Docker volumes are not assumed to
survive a cloud snapshot. Future tasks must start services and inspect migration status.
No existing database is reset by any installation or startup script.

Interactive screening uses a single server-side TypeScript engine under
`dashboard/src/lib/screening/`. It consumes verified profile/master metadata and candidate-checked
quotations, never instructions inside source text. The Python worker remains diagnostic until
background processing is needed. A `Classifier` interface separates the optional provider;
its suggestions cannot decide hard eligibility or supply candidate facts.

Import and screening writes use authenticated PostgreSQL RPCs for atomic batch deduplication
and input-version checks. A security-invoker view exposes current owner-only results, expires
old/dated checks and supports search/review/dashboard counts. Historic evidence stays attached
to each assessment. Future submission adapters must re-evaluate current facts and policy.

Phase 5 re-evaluates the deterministic screening engine and regenerates the package from
current verified inputs. The server downloads the private original to verify its recorded
SHA-256, MIME and size. Revision reads before/after loading plus a transaction-time snapshot
check reject concurrent source edits. `submission_runs` retains dry reports and one active
manual claim per application. Candidate outcomes are reconciled atomically with the tracker;
unknown outcomes retain the claim. Owner-readable reports are advisory, not provider proof.

`lib/submission/adapters.ts` defines the future provider contract and dispatch lifecycle.
Only the human-assisted adapter is present in runtime code; it cannot send or verify an API
receipt. A test-only mock exercises policy gates, atomic reservations, correlated receipt
validation and ambiguous failures. No production API AttemptStore, provider credentials or
scheduler is wired up. Any later live integration needs documented employer authorization,
a durable provider claim/receipt store and provider-specific confirmation semantics.
