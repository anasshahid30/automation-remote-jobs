# Phase 3: import and evidence-based screening

Apply pending migrations with `npm run db:migrate`, then start the app with `npm run dev`.
Use your existing account, real candidate profile and verified master-resume skill metadata.
No AI key is required for import, CRUD or deterministic screening.

## Workflow

1. Open **Jobs → Import listings**. Paste an actual public URL, company, title and source
   description. Batch import accepts a JSON array of 1–20 records, up to 2 MB of UTF-8 JSON.
   Required keys: `url`, `company`, `title`, `description`. Optional: `source`, `source_id`.
   Extra keys are rejected. No website is fetched or platform account connected.
2. Open an imported record and save the published job facts: role, seniority, employment
   arrangement, fully remote status, hiring scope, countries, employer region, original
   compensation and closing date. Leave unsupported values unknown.
3. In **Review evidence and screen**, copy exact quotes from the saved title/description.
   Add their public source URLs. Quotes must match verbatim; required skills must occur in
   the source text. Confirm that you checked the original source and the listing is open.
4. Review all mandatory qualifications, experience and assessments against your real facts.
   Record your actual position on residency, work authorization and sponsorship, with an
   explanation and source quote. A remote label is not an international hiring permission.
5. Save evidence and screen. The app records a decision, score, gates, weights, reasons,
   evidence URLs, profile/job versions, master-resume snapshot and evaluation version.
   Inspect **Individual gates and score factors**. Screening never submits an application.
6. Use **Review queue** for unassessed, uncertain or outdated records. Jobs can also be
   filtered by role, source, employer region, eligibility, status, disposition and screened
   minimum monthly compensation. Shortlisting is your own search choice, not approval
   of eligibility. Rejected dispositions are hidden from the unresolved queue.

Candidate-checked quotations are not independently fetched or employer-verified. Source
text is data, never instructions. The rule engine is a conservative initial screen with
explicit review gates, not a complete natural-language or legal interpretation system.

## Decision and score

`INELIGIBLE` takes precedence when any gate fails. `NEEDS_REVIEW` applies when a gate is
unknown; `ELIGIBLE` requires every gate to pass. Gates cover fully remote work, country and
employment arrangement, role, seniority, employer region, active listing/deadline, mandatory
qualifications, authorization, required skills and compensation. Explicit residency and
workplace exclusions override positive quotations and a high numerical score. International
contracting evidence does not establish international employee eligibility.

Initial score weights are relevance 35%, seniority 20%, geography 20%, compensation 15%
and employment 10%. Settings can change them, totaling 100. Relevance uses 60% role fit and
40% recorded required-skill coverage. Geography combines remote and country fit. Unknown
factors receive a neutral 0.5 for scoring, while still preventing an eligible decision.
Confidence reports the fraction of gates with known outcomes, not a probability of an offer.
Missing skills on current masters reduce relevance and request review; the engine does not
invent experience or extract resume contents. Resume choice and tailoring come in Phase 4.

Original compensation units are retained. Screening compares monthly equivalents in your
profile currency: annual amounts divide by 12, monthly amounts retain their value. Hourly
rates require explicit hours/week, weeks/year and an explanation; equivalents are projections,
not guaranteed hours or offers. Foreign currency requires your dated rate, conversion
explanation and public source. One unit of the source currency converts to the entered
amount of profile currency. No rates or hours are fetched or fabricated. Unknown pay follows
Settings; ranges crossing the minimum require review instead of using the upper bound as
proof of a guaranteed minimum. Minimum-pay filters exclude unknown/stale equivalents.

Checks become stale after seven days, earlier if their FX quote expires, or when profile,
job facts or resume context changes. Deadline expiry/closure overrides earlier positives.
A stale check cannot count as eligible; previous snapshots remain in screening history.
Optimistic checks reject a submission if the job/profile/master context changed during it.

## Deduplication and preservation

The normalizer removes known tracking parameters, sorts query keys and preserves identity
parameters and SPA hash routes. Recognized LinkedIn, Wellfound, Greenhouse and Lever URL
variants receive source IDs; ATS IDs include employer scope where needed. PostgreSQL
normalizes every stored identity too, and per-owner unique indexes handle concurrent retries.
Original URLs remain available separately from canonical identity.

A duplicate returns the saved record without overwriting its description or application
history. A conflicting URL and source ID that point to different records aborts the batch.
Same company/title fingerprints produce possible-duplicate warnings, never automatic merges;
separate openings can legitimately share both. URL normalization cannot discover every
semantic duplicate. Existing migration-time collisions fail visibly for review, without
silently deleting data. Inspect/reconcile them before rerunning a pending migration.

## Optional AI classification

The provider interface supports grounded structured suggestions for role, seniority and
employment arrangement. The current adapter uses OpenAI's fixed HTTPS Chat Completions
endpoint, validated JSON Schema outputs, bounded response size, 15-second request timeouts
and configurable bounded retries. Model, supported temperature and retries are configurable.
AI has a separate limit of 10 attempts/hour/account. Ordinary mutations retain their existing
120 attempts/five minutes; uploads remain 10/hour.

To enable deliberately, set these **server-only** values securely in the dashboard runtime:

```dotenv
AI_CLASSIFICATION_ENABLED=true
OPENAI_API_KEY=YOUR_REAL_KEY_ENTERED_SECURELY
OPENAI_CLASSIFICATION_MODEL=gpt-4.1-mini
OPENAI_CLASSIFICATION_TEMPERATURE=0
OPENAI_CLASSIFICATION_RETRIES=1
```

Do not paste a key in chat or commit it. Use your ignored local env file or environment
settings. Allow `api.openai.com` if outbound networking is restricted, then restart the
server. A saved environment draft does not change runtime values or publish a snapshot.
This implementation was tested with mocked provider responses; no live AI key/call was used.

Before each request, confirm that the public title and description may be sent to your
provider. Only the title and first 16,000 description characters are sent: no candidate
profile, resume, contact details or authorization notes. Suggestions need exact source
quotes, remain unconfirmed, and cannot write geographic, salary, legal or overall decisions.
Explicitly check each suggestion before copying soft fields, then screen again. Stale,
invalid, truncated or ungrounded output fails closed; provider errors and keys are not echoed.

## Testing and boundaries

Run `npm run check`, production build, worker pytest/Ruff, `npm run db:test` and all three
local HTTP smoke scripts listed in SETUP.md. They use isolated labelled fixtures and clean
up files, accounts and records. The Phase 3 script exercises concurrent imports/application
inserts, evidence review, source changes, missing skills, filters, outdated inputs and
mocked classification copying. GitHub Actions now defines those same local-stack regressions.

The Python worker remains a read-only diagnostic CLI. Interactive screening lives in one
server-side TypeScript engine; no extra HTTP service is needed. There are no public-feed
adapters, job-platform account connections, document generation, screening-answer automation,
submission adapters or scheduler running. Approving an application record in the CRM is a
manual status. Future submission code must re-evaluate current inputs rather than treating
stored/manual labels as an authorization or employer confirmation. Phase 4 starts when asked.
