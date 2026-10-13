# Phase 4: truthful application preparation

Run `npm run db:migrate` after pulling, then start the dashboard. No additional credentials
are required. The pinned PDF parser installs from the dashboard lockfile.

1. In Resumes, upload real master files and select a master for each target role.
2. Choose **Verify resume text**. Extract a draft from PDF, DOCX or UTF-8 text, compare it
   with the private original, correct any errors and explicitly verify its facts. Scanned
   PDFs have no usable text: paste an accurate transcript. Extraction never verifies facts.
3. In **Verified answers**, enter an exact employer question and your factual answer.
   Confirm its accuracy. Similar or partial questions do not reuse that answer.
4. Open an application record and choose **Prepare application package**. The matching
   role master is recommended; an already selected application version is preserved as
   the default. Select an owned version with verified text. Copy a relevant exact job
   passage and resume passage, enter screening questions one per line, and confirm the sources.
5. Generate the private preview. Check the cover letter, tailored resume, selected version,
   answer sources, review items and current eligibility. Resolve unanswered questions in
   the library and regenerate. Sensitive answers require review even when already verified.
6. Confirm document accuracy and all employer answers, then apply the reviewed package.
   The tracker associates the exact original resume version, cover letter and answers.
   It becomes Prepared only if the current screening summary is eligible; otherwise it
   stays Needs review. This checks the existing summary; a future submission adapter must
   independently recompute current eligibility. No employer is contacted.

The generator uses an extractive approach: the tailored resume brings your selected source
excerpt to the top and retains the full verified transcript unchanged. The concise cover
letter cites exact job and experience excerpts, company and role. It adds no employer
research, qualifications, dates, metrics, certifications or personal familiarity. It does
not rewrite prose with a language model, and does not require an AI key. Choose excerpts
that communicate useful experience without unrelated personal information.

Routine name/contact/location questions use candidate-entered profile fields. Other answers
require an exact candidate-verified library match. Unknown answers remain blank; the engine
does not infer work authorization, addresses, sponsorship, relocation, salary concessions,
clearance, assessments, legal statements or commitments. Every library question outside
the small routine contact whitelist requires candidate review, even if labeled Routine.
No-match, unverified or conflicting answers remain unresolved. Check the official form for
additional questions: an empty question list does not prove the employer has none.

Every generated package has an immutable ID, request ID, engine version, selected resume ID,
original source text, excerpts, answer provenance and input revisions. Retries with the same
request ID return one version. New generation creates a new version. Changes to job facts,
profile, resume transcript or the answer library make earlier packages stale and prevent
review. Historical documents and reviews remain readable; they are snapshots, not current
authorization. Changing a master selection preserves the application-specific file version.
The application record lists its latest 20 package versions; older versions remain in the database.

Downloads are private UTF-8 TXT attachments with company/application/version filenames.
The original PDF/DOCX/TXT remains available separately. Generated TXT is a factual preparation
document, not a layout-preserving PDF or DOCX export. Files are served from authenticated,
owner-filtered immutable database snapshots with `private, no-store`; no public bucket is used.
Keep the original formatted resume when the employer requires that format. Master files
are never overwritten. Resume text is limited to 60,000 characters, PDF extraction to 50 pages,
and DOCX text-member decompression to 1 MiB. No OCR is performed.

The local test suite covers factual generation, exact question matching, sensitive review,
PDF/DOCX/TXT extraction, source-version rejection, concurrent idempotency, private downloads,
cross-owner denial, immutable history and fixture cleanup. Submission adapters, real platform
authorization, provider confirmation, scheduler and submission quotas belong to later phases.
