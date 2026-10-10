# Phase 2: candidate profile and application tracker

Run the setup in [SETUP.md](SETUP.md). For an existing installation, apply pending schema
changes with `npm run db:migrate`, then start the dashboard with `npm run dev`. Sign in
with your local account or your deliberately configured hosted account. Local account
creation uses `worker/.venv/bin/python scripts/create_local_user.py` and secure prompts.

## Use your workspace

1. **Settings:** enter your real name, contact details and city. Save compensation, roles,
   employer regions, seniority, employment types and a daily goal from 1 to 30. Reporting
   defaults to Asia/Karachi. Authorization and sponsorship notes are your own verified
   statements. The city is never invented and automation stays paused.
2. **Resumes:** upload PDF, UTF-8 text or DOCX files up to 10 MiB. Give each role/version
   a unique name. Select a master for backend, AI/automation and full-stack. Every upload
   creates a separate private file with its size, original filename and SHA-256 fingerprint.
   Switching a master retains older files and the versions selected on applications.
   Preview PDF or download any version through a signed link valid for 60 seconds.
3. **Jobs:** add a real HTTPS listing URL and paste its actual description. Save only
   published restrictions and compensation. Leave unknown fields unknown. Edit, search
   and filter listings. Saving the URL does not fetch it or assess eligibility. No sample
   jobs are seeded into your account.
4. **Applications:** create a draft from a saved job. Select an uploaded resume version,
   enter your own cover letter and notes, update status, and record a follow-up date.
   Search and filter the tracker. Every saved change records activity in the same database
   transaction. Concurrent edits are checked: reload if another save changed the record.
5. **Manual submissions:** complete an employer's official form yourself. Only afterwards
   record the actual time, receipt/reference and explicit confirmation. The tracker labels
   this as a candidate report. Prepared records require a resume; failed records require
   a reason; future submission dates are rejected. Approval is a manual CRM status.
6. **Dashboard:** saved jobs, applications, needs-review records, failures, interviews,
   responses, follow-ups and activity come from your own database records. Today's manual
   reports use your profile's timezone. Response counts include submitted records whose
   current status is responded, interview, offer or rejected.

Job and application lists show 25 records per page. Application activity shows the most
recent 50 events, with the complete history retained in the database. Follow-ups are saved
dates and a due count; there are no reminders, emails or scheduled actions yet.

## Deletion and limits

Deleting an application requires a confirmation checkbox and browser confirmation, and
removes its activity history. It retains the saved job and uploaded resume files. A job
with an application cannot be deleted; mark it closed, or explicitly delete the application
first. Resume versions have no deletion UI in this phase.

Dashboard actions share fixed per-account budgets: 10 upload attempts per hour and 120
other mutation attempts per five minutes. Failed attempts count too. These protect dashboard
actions across processes; they are not the future daily submission quota or general Data API
rate limits. Wait for the window to expire if a budget is exhausted.

Storage and metadata cannot share a transaction. If metadata insertion fails after upload,
the action tries to delete that newly uploaded, unregistered file. A failed cleanup or an
ambiguous network timeout can leave a private orphan. Inspect Storage privately before
retrying; never remove registered resume files to clear an orphan.

## Phase boundaries

Import normalization, deterministic eligibility, match scores and evidence review belong
to Phase 3. AI cover letters, resume tailoring and verified screening answers belong to
Phase 4. Authorized submissions belong to Phase 5, and scheduling/quotas to Phase 6.
No external accounts are connected, messages sent, applications submitted or source
confirmations fabricated by this implementation. Hosted migrations and deployment were
not performed by the local validation.
