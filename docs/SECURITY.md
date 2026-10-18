# Security boundaries

- Dashboard configuration and Supabase client code stay on the server. No service-role
  client is available to dashboard code, and configuration rejects privileged key formats.
- Server actions validate sign-in fields, return generic errors and use Next.js origin
  protection. Supabase Auth applies sign-in rate limits. Sessions use HttpOnly, SameSite=Lax
  cookies; hosted HTTPS configuration uses Secure cookies in production.
- Protected pages and database health use `auth.getUser()` before querying. The public
  liveness endpoint contains no environment details or personal data. Auth/provider errors
  are not printed. Database checks time out and return fixed, redacted errors.
- All eight application tables use RLS, owner policies and explicit grants. Cross-owner
  relationships fail even when a foreign UUID is known. Never grant browser users an admin
  role, and never put privileged keys in any `NEXT_PUBLIC_*` variable.
- Resume documents are private. Storage object paths are owner-scoped and cannot be
  overwritten through authenticated Storage policies. Each file view verifies Auth and
  ownership before returning a signed URL valid for 60 seconds with no-store headers.
  Registered file deletion is blocked by the owner Storage policy. Metadata is immutable;
  master switches are serialized in the database and protected by a unique index.
- Dashboard mutations validate bounded, whitelisted fields and use shared database request
  budgets. Job and application updates/deletes require the displayed `updated_at` token.
  Audit events are inserted in the same transaction as application changes. Deleting a
  job cannot cascade away application history; the UI requires explicit application deletion.
- File checks enforce extension/content signatures, UTF-8 text validity, basic DOCX ZIP
  structure, macro/path checks and size limits. These are not a malware scan or complete
  document parser. PDF previews use the browser viewer; other formats are downloads.
- Manual confirmations are stored as `candidate_reported` and clearly labelled. No
  provider verification is inferred from a CRM status, checkbox, or pasted receipt.
- `.env*`, `.local/`, build outputs and virtual environments are ignored by Git. Local
  config files and CLI logs use private permissions. Never commit real resumes or secrets.
- Local helpers consume generated local admin keys only for development account management
  and integration tests. They reject hosted URLs and never print credentials. Raw local CLI
  logs can contain generated keys; inspect them privately rather than posting them in chat.
- Hosted worker connections require certificate/hostname verification with
  `sslmode=verify-full&sslrootcert=system`. TLS verification is never disabled during setup.

Job descriptions, URLs and future AI output must be treated as untrusted data. Retrieved
text may not issue instructions, request secrets, or change the eligibility policy.
Future AI providers must produce schema-validated output and preserve verified facts.

## Not yet production-complete

This workspace is not ready for live submissions. Provider permissions, resume scanning,
document generation, answer verification workflows, export/deletion UI, retention jobs,
submission retries/quotas, per-source pause controls, structured operational logging and
monitoring remain to be implemented and tested in their planned phases. The schema's
default pause setting does not replace future executable safety checks.

Disable public Auth signups on a hosted personal project and create your account securely
in its dashboard. Configure TLS, trusted redirect origins, backups, access restrictions,
deployment secrets and production Auth rate limits before exposing the application.

## Phase 3 boundaries

Phase 4 adds private factual preparation; see PHASE4.md. Resume extraction never verifies
claims. Only candidate-verified text can generate a package. The generator quotes source
text unchanged and makes no external model request with candidate data. DOCX extraction is
bounded and does not unpack files; PDF extraction does not render pages or execute document
scripts. Scanned/oversized text requires a manual transcript. Generated attachments require
fresh Auth, an owner-filtered package lookup and no-store headers. Package snapshots cannot
be updated or individually deleted by authenticated clients. No public generated-document
bucket or permanent unauthenticated URL exists.

Question matching is exact after case/punctuation normalization, without dynamic regexes.
Unverified, conflicting and unknown answers cannot become affirmative legal claims. All
non-contact library questions and sensitive categories require per-employer candidate review.
Unanswered or stale packages cannot be reviewed; review is a local document action, not
permission or proof of an external submission. The existing manual tracker can still record
actual candidate-reported outcomes. Future adapters must independently validate current
inputs; owner-written Data API metadata is not a trusted provider assertion.

Manual import never fetches arbitrary URLs. Batch fields are whitelisted and bounded.
Normalized per-owner identities and database unique indexes prevent concurrent duplicate
writes; title/company similarity is advisory and never merges records automatically.

Reviews and classifications have RLS and owner-scoped foreign keys. Quoted evidence must
be grounded in saved text. The assessment stores job/profile/master snapshots; an atomic
RPC rejects changed inputs. Profile, source and resume changes invalidate current results,
and a security-invoker view removes expired evidence from eligible counts. Individual gate
results and historic reasons cannot be rewritten through ordinary authenticated UPDATEs.
Owners still control their own data; records and quotations are not employer verification.

The invalidation trigger is a trigger-only SECURITY DEFINER with empty search path. Its
owner comes exclusively from an RLS-authorized NEW/OLD row, never RPC arguments. Execute
is revoked from browser roles. This lets the separate Auth database role cascade account
deletions without granting it access to public candidate tables; deleted profiles skip
unnecessary invalidation. Real Auth API cleanup and database permission assertions cover it.

AI receives only public job text after explicit candidate consent. Keys remain server-side;
the provider endpoint is fixed HTTPS with redirects rejected, bounded retries/timeouts and
structured-output validation. No candidate profile/resume data, tools or submission authority
are supplied. Ungrounded quotes, extra decision fields and incomplete output are rejected.
Suggestions can only become soft job fields after human confirmation. Geographic/legal/pay
restrictions are recomputed separately; high scores and AI suggestions cannot override them.
Live provider access and hosted production controls remain unverified in this local setup.

Phase 5 handoff actions authenticate independently, enforce owner filtering/RLS and validate
current source revisions. Exact regeneration rejects injected package claims; private source
checksums and current eligibility are checked before handoff. Global/source pauses serialize
with claim creation. Run history cannot be directly inserted, rewritten or erased through
the authenticated Data API. Only candidate-reported receipts can update the manual tracker.
A receipt is an explicit user report, not independent verification that an employer received it.

No runtime API adapter or external form automation is configured. The mock lifecycle rejects
bare HTTP 200 responses and mismatched/missing/future/stale receipts, reserves before dispatch,
and retains claims after uncertain network or audit-storage failures. It performs no automatic
retry. This is a contract for a future authorized integration, not a deployed submission service.
Open official links are candidate-controlled navigation; the application does not fetch them.

Phase 6 gives the worker a separate PostgreSQL identity with only narrow RPC execution.
It has no direct candidate/resume table access, cannot call submission RPCs and has no
employer or email client. Runtime checks reject privileged bindings. Hosted worker URLs must
verify the server certificate using the system trust store. The local helper generates its
own password privately, refuses hosted targets and never rotates an existing role silently.

Owner-authenticated queue forms and response RPCs enforce ownership, bounds and request
identity. The schedule path participates in session refresh and private/no-store responses.
Task tokens guard stale completions; source/global pause checks and account concurrency
limits apply across workers. Only idempotent local work retries. New handoff quotas do not
invent receipt records or prevent truthful recording above the allocation limit. Error logs
exclude raw database errors, credentials and candidate text. SQL/HTTP/worker tests cover the
restricted login, cross-owner denial, pause races, lease recovery, retries and Auth cleanup.
