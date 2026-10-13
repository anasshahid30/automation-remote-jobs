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
