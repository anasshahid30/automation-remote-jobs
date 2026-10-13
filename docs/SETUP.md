# Setup on macOS

Run commands from the repository root (`automation-remote-jobs/`). Use this existing
checkout; a separate worktree or duplicate application is unnecessary.

## Prerequisites

- Node.js 24 LTS (`nvm install 24 && nvm use 24` if you use nvm).
- Python 3.12 (`brew install python@3.12` if needed).
- Docker Desktop running for local Supabase. Allow roughly 8 GiB RAM and 10 GiB free disk.
  If resources are limited, use a hosted Supabase project instead.

Dependencies are pinned in both npm lockfiles and `worker/requirements.txt`.
`requirements.in` records direct Python dependencies; only regenerate the lock during
an intentional dependency update. Normal setup uses the frozen files below.

## Install

```sh
npm ci
npm --prefix dashboard ci
python3.12 -m venv worker/.venv
worker/.venv/bin/python -m pip install -r worker/requirements.txt
```

The dashboard runs without Supabase configuration, but sign-in is disabled and the database
probe cannot report success. No AI or job-platform credentials are required for ordinary Phases 1–4 workflows.

## Local Supabase (recommended first)

```sh
npm run db:start
npm run db:migrate
npm run db:config
worker/.venv/bin/python scripts/create_local_user.py
```

`db:start` uses Supabase's official slim images from `ghcr.io`. It starts PostgreSQL,
Auth, Data API, private Storage and the gateway. Studio, realtime, mail, analytics and edge
functions are disabled because this workflow does not use them. Generated service credentials
are kept out of terminal output. A private diagnostic log is at `.local/supabase-command.log`.

In this cloud machine, Docker's proxy-only client settings caused the slim images' BusyBox
health probes to send localhost requests through an outbound proxy. The wrapper uses a
separate empty Docker client config for local services when it detects that exact proxy-only
configuration. The existing client config remains untouched and the Docker daemon retains
its registry proxy. Health checks remain enabled; package/image verification remains enabled.

`db:config` retrieves local configuration without printing keys. It creates ignored
`dashboard/.env.local` and `worker/.env` with private file permissions, and refuses to
overwrite an existing file. Re-running it is unnecessary unless you deliberately switch
configuration. It never configures a hosted project.

The account helper prompts for your real email and a password without echoing the password.
It creates a local account only; it does not send email or contact a hosted service.

Start the dashboard:

```sh
npm run dev
```

Open the local app on port 3000 in your browser, choose **Open secure workspace**, and sign
in using your local account. Start with Settings, upload your real resumes, then use Jobs
and Applications. See [PHASE2.md](PHASE2.md) and [PHASE3.md](PHASE3.md). Cloud onboarding does not provide a web preview.

## Checks (new terminal at repository root)

```sh
npm run check
npm --prefix dashboard run build
worker/.venv/bin/ruff check worker scripts
(cd worker && .venv/bin/pytest)
npm run db:test
(cd worker && .venv/bin/python main.py --health)
(cd worker && .venv/bin/python main.py --check-database)
worker/.venv/bin/python scripts/smoke_local.py
worker/.venv/bin/python scripts/smoke_phase2.py
worker/.venv/bin/python scripts/smoke_phase3.py
worker/.venv/bin/python scripts/smoke_phase4.py
worker/.venv/bin/python scripts/smoke_phase5.py
```

The smoke test requires the dashboard on port 3000, a completed production build for the
client-key scan, and local Supabase. It creates then deletes a temporary test account;
it does not submit jobs or modify your account. The Phase 2 test creates two isolated accounts,
exercises real forms and private file access, then deletes its fixture files and accounts.
All tests reject hosted Supabase targets. The Phase 3 test also checks source evidence,
current eligibility, concurrent retries and mocked classification copying. Results identify each passed assertion.
For a production server, stop your dev server and run `npm --prefix dashboard run start`.

## Hosted Supabase (optional)

1. Create/select your project and securely create your own Auth account. Disable public
   signups. Do not paste credentials in chat.
2. Review `docs/DATABASE.md` before applying migrations. Match the configured PostgreSQL
   major version to your project. Use the pinned CLI through `node scripts/supabase.mjs`
   for `login`, `link --project-ref YOUR_PROJECT_REF`, `migration list`, and
   `db push --dry-run`. Apply only after reviewing the target and pending SQL; never reset it.
3. Copy `dashboard/.env.example` to `dashboard/.env.local` if no config file exists. Set
   `SUPABASE_URL` to the project HTTPS URL and `SUPABASE_PUBLISHABLE_KEY` to the publishable
   (or legacy anon) key. The dashboard rejects privileged keys.
4. Optionally copy `worker/.env.example` to `worker/.env` and set `DATABASE_URL` securely
   using a direct/session pooler connection. Add `sslmode=verify-full&sslrootcert=system`.
   URL-encode special characters in the password. Use a dedicated read-only diagnostic
   role with EXECUTE on `public.database_health()` where possible. Do not use the owner's
   database connection as a future submission worker identity.
5. Allow your specific project API/pooler domains in restricted cloud network settings,
   restart the dashboard after configuration changes, and rerun the database probe.
   Hosted connection and migrations have not been verified by this local setup.

## Troubleshooting

- npm cache is unwritable in cloud: `npm ci --cache /tmp/remote-jobs-npm-cache` (and the
  equivalent `npm --prefix dashboard ci --cache /tmp/remote-jobs-npm-cache`).
- Supabase CLI home is unwritable: use the supplied npm scripts; they set `SUPABASE_HOME`
  to the repository's ignored `.local/supabase-cli` without changing your system HOME.
- Image download/storage failure: inspect the private CLI log and Docker disk usage.
  The included wrapper uses official slim images; never disable TLS or checksum checks.
  Avoid deleting another project's volumes or images to make space.
- Database unavailable: confirm Docker is running, rerun `db:start` and `db:migrate`,
  check configuration privately, then run the worker probe. Missing configuration exits 1.
- SQL tests fail: preserve their output and investigate. Do not bypass RLS or weaken tests.

Use `npm run db:stop` to stop local services while preserving their data; do not use
`db reset`, `stop --no-backup` or volume deletion against existing data.

Optional AI classification needs explicit server configuration and per-request consent.
See PHASE3.md for the key/model settings, privacy boundary and mocked-versus-live validation.
Import and screening continue to work with AI disabled.

Phase 5 requires no new dependency or credential. Apply pending migrations with
`npm run db:migrate` and follow [the handoff walkthrough](PHASE5.md). No employer-approved
API access was available during setup, so the supported route is the candidate-operated
official form. API policy/receipt behavior is tested only with a local mock.
