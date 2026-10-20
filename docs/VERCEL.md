# Deploy the dashboard on Vercel

Vercel hosts the Next.js dashboard in `dashboard/`. Supabase hosts PostgreSQL, Auth and
private resume storage. The Python scheduler runs separately. Deploying the dashboard
does not move the local database, upload existing resumes or start the worker.

## 1. Create the hosted database

1. Sign in at https://supabase.com/dashboard and create a project in your own account.
   Choose a region near you and save its database password in your password manager.
2. In Auth settings, disable public signups. Create your own user in **Authentication →
   Users**, with an email and password you control. The app has no public registration form.
3. From project settings, obtain the HTTPS project URL and **publishable key** (a legacy
   anon key is also supported). Enter these securely in Vercel in step 2. Never use a
   service-role/secret key in the dashboard or paste credentials into chat.
4. Apply this repository's pending migrations through the Supabase CLI. On your Mac, from
   the existing checkout:

   ```sh
   git pull origin main
   npm ci
   node scripts/supabase.mjs login
   node scripts/supabase.mjs link --project-ref YOUR_PROJECT_REF
   node scripts/supabase.mjs migration list
   node scripts/supabase.mjs db push --dry-run
   ```

   Replace `YOUR_PROJECT_REF` with the project's reference ID. Review the linked target and
   pending migration names, then apply them:

   ```sh
   node scripts/supabase.mjs db push
   node scripts/supabase.mjs migration list
   ```

   This uses migration history and creates the private bucket/policies along with Phases
   1–6. Do not reset the database or copy SQL files individually into an existing project.
   Existing hosted data requires a backup and a target/migration review first. Hosted
   migration compatibility has not yet been verified by this workspace.

## 2. Import the GitHub repository

At https://vercel.com/new, sign in and import
`anasshahid30/automation-remote-jobs`. Use these project settings:

| Setting | Value |
| --- | --- |
| Root Directory | `dashboard` |
| Framework Preset | Next.js |
| Node.js Version | 24.x |
| Install Command | `npm ci --no-audit --no-fund` |
| Build Command | `npm run build` |
| Output Directory | Leave at the Next.js default |
| Production Branch | `main` |

`dashboard/vercel.json` supplies the framework/install/build settings. Set the following
environment variables for **Production**, using your actual hosted project:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | The project's HTTPS URL |
| `SUPABASE_PUBLISHABLE_KEY` | The project's publishable or legacy anon key |
| `AI_CLASSIFICATION_ENABLED` | `false` |

No `NEXT_PUBLIC_` variables or privileged database keys are needed. Do not upload the local
`.env.local`, which points to this workspace's loopback database. Vercel's deployment flag
makes the app reject loopback database URLs. Missing configuration leaves sign-in disabled.
The CLI upload ignore file excludes local environment files and build caches.

Click **Deploy**. The Git integration should redeploy `main` on subsequent pushes. After
Vercel provides the actual HTTPS URL, set it as Supabase Auth's Site URL. Add only intentional
redirect URLs if you later enable email-based authentication; this app currently signs in
with passwords. Redeploy after changing Vercel environment variables. For previews, use a
separate test Supabase project instead of pointing unreviewed changes at candidate data.

If a Vercel project already exists, link that project rather than creating a duplicate.
For a CLI deployment from the repository root on a Mac with working Vercel access:

```sh
npx vercel@64.7.0 login
npx vercel@64.7.0 link
npx vercel@64.7.0 deploy --prod
```

Link the existing project whose Root Directory is `dashboard`; run these commands from
the repository root so that path resolves correctly. The root `.vercelignore` excludes
local configuration, caches and the separate worker. Configure hosted environment
variables in the Vercel dashboard; the CLI does not make local bindings production-ready.
Account/team access is required. Never put a token in a command, repository or chat.

## 3. Verify the public app

- The deployment's `/api/health` should return `status: ok`, `phase: 6`. This only checks
  the web app; it does not prove the database or worker is connected.
- Signed out, `/dashboard`, `/resumes`, `/applications` and `/schedule` redirect to login.
- Sign in with your hosted Auth account, save Settings and confirm the database health
  endpoint `/api/health/database` returns `status: ok` in that authenticated browser.
- Upload a small real resume, confirm private access, then import/screen a job and prepare
  a package. Preparation and dry checks do not submit anything to an employer.
- Verify global pause remains on until you choose to enable manual handoffs/background work.

New resume uploads on Vercel are limited to **4 MiB** to leave room for the rest of the form
under the platform's function request limit. The browser checks size before upload and the
server checks it again. Local hosting keeps the existing **10 MiB** limit. Existing stored
documents are unchanged. Supporting larger Vercel uploads requires a separate authenticated
direct-to-storage upload flow; raising Next.js's body limit cannot raise Vercel's limit.
See https://vercel.com/docs/functions/limitations for platform limits.

## 4. Run scheduling separately

The existing `worker/main.py --scheduler` is a persistent Python process. It does not run
inside a Vercel web deployment or as an automatically configured Vercel Cron job. Without
a worker, the app remains usable and scheduled tasks wait; its status shows no recent
heartbeat.

For a hosted worker, provision a dedicated database login with only membership in
`remote_jobs_scheduler`. Configure its `SCHEDULER_DATABASE_URL` securely with
`sslmode=verify-full&sslrootcert=system`, install `worker/requirements.txt`, then run:

```sh
cd worker
SCHEDULER_ENABLED=true .venv/bin/python main.py --scheduler
```

Use a host that keeps this process running, and confirm its heartbeat in the dashboard.
The local `scripts/configure_scheduler.py` deliberately refuses hosted databases. See
[PHASE6.md](PHASE6.md) for permissions, concurrency, pause and retry behavior. Hosting the
worker, configuring its restricted login and testing it against Supabase remain separate
deployment steps. No employer submission API or automated messaging is connected.

## Current deployment status

On 21 October 2026 (Asia/Karachi), this workspace had no Vercel account binding or hosted
Supabase project. Requests to Vercel's API were rejected by the environment's egress proxy
with HTTP 403, and CLI login did not complete. No Vercel project or public deployment URL
was created. Deployment preparation and local checks do not establish a live deployment.
