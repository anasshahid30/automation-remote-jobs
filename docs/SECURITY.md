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
  overwritten through authenticated Storage policies. Signed URLs will be added with uploads.
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

This foundation is not ready for live submissions. Provider permissions, resume scanning,
document generation, answer verification workflows, export/deletion UI, retention jobs,
submission retries/quotas, per-source pause controls, structured operational logging and
monitoring remain to be implemented and tested in their planned phases. The schema's
default pause setting does not replace future executable safety checks.

Disable public Auth signups on a hosted personal project and create your account securely
in its dashboard. Configure TLS, trusted redirect origins, backups, access restrictions,
deployment secrets and production Auth rate limits before exposing the application.
