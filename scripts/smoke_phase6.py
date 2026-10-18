"""Local scheduling, worker permissions, concurrency and quota integration; no employers."""

import json
import os
import secrets
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
import psycopg
from smoke_local import PAGE, ROOT, require
from smoke_phase2 import read_form, saved, submit, unavailable
from smoke_phase3 import QUOTES, TEXT

sys.path.insert(0, str(ROOT / "worker"))
from app.common.config import Settings
from app.scheduler import Scheduler


def main():
    status = json.loads(
        subprocess.run(
            ["node", "node_modules/supabase/dist/supabase.js", "status", "-o", "json"],
            cwd=ROOT,
            env={**os.environ, "SUPABASE_HOME": str(ROOT / ".local/supabase-cli")},
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    )
    api = status["API_URL"]
    require(
        urlsplit(api).hostname in ("localhost", "127.0.0.1"),
        "Phase 6 only targets local Supabase",
    )
    anon = status.get("PUBLISHABLE_KEY") or status["ANON_KEY"]
    admin = status.get("SECRET_KEY") or status["SERVICE_ROLE_KEY"]
    admin_headers = {"apikey": admin, "Authorization": f"Bearer {admin}"}
    accounts = []
    with (
        httpx.Client(timeout=60) as http,
        httpx.Client(timeout=90) as owner,
        httpx.Client(timeout=90) as other,
    ):
        try:
            require(
                owner.get(
                    PAGE
                    + "/applications/00000000-0000-0000-0000-000000000001/submission"
                ).status_code
                == 307,
                "anonymous handoff protected",
            )
            for browser in (owner, other):
                email, password = (
                    f"phase6-{uuid4()}@example.test",
                    secrets.token_urlsafe(24),
                )
                created = http.post(
                    api + "/auth/v1/admin/users",
                    headers=admin_headers,
                    json={"email": email, "password": password, "email_confirm": True},
                )
                require(
                    created.status_code in (200, 201),
                    "isolated Phase 6 account created",
                )
                account = {"id": created.json()["id"]}
                accounts.append(account)
                r = submit(
                    browser, "/login", "form-0", {"email": email, "password": password}
                )
                require(
                    r.status_code == 303, "Phase 6 account signs in through actual form"
                )
                token = http.post(
                    api + "/auth/v1/token?grant_type=password",
                    headers={"apikey": anon},
                    json={"email": email, "password": password},
                )
                require(token.status_code == 200, "Phase 6 API authentication succeeds")
                account["headers"] = {
                    "apikey": anon,
                    "Authorization": f"Bearer {token.json()['access_token']}",
                }
            headers = {**accounts[0]["headers"], "Prefer": "return=representation"}

            def rows(table, index=0):
                r = http.get(
                    api + f"/rest/v1/{table}?select=*",
                    headers=accounts[index]["headers"],
                )
                require(r.status_code == 200, f"owner query {table} succeeds")
                return r.json()

            def insert(table, payload):
                r = http.post(api + f"/rest/v1/{table}", headers=headers, json=payload)
                require(r.status_code == 201, f"synthetic {table} fixture created")
                return r.json()[0]

            insert(
                "candidate_profiles",
                {
                    "full_name": "Synthetic Handoff Candidate",
                    "email": "fixture@example.test",
                    "city": "Karachi",
                    "daily_target": 1,
                },
            )
            resume_text = (
                "Synthetic Candidate. Built Python APIs at Actual Employer in 2023."
            )
            saved(
                submit(
                    owner,
                    "/resumes",
                    "resume-upload",
                    {
                        "role_category": "backend",
                        "version_name": "Synthetic handoff master",
                        "skills": "Python",
                    },
                    upload=("handoff.txt", resume_text.encode(), "text/plain"),
                ),
                "Private resume version uploaded",
                "private handoff resume uploaded",
            )
            resume = rows("resumes")[0]
            saved(
                submit(owner, "/resumes", f"master-{resume['id']}"),
                "Master selection updated",
                "master selected",
            )
            saved(
                submit(
                    owner,
                    f"/resumes/{resume['id']}/text",
                    "resume-text",
                    {"text_content": resume_text, "verified": "yes"},
                ),
                "Resume text verified",
                "candidate verifies factual transcript",
            )
            job = insert(
                "jobs",
                {
                    "source_platform": "manual",
                    "canonical_url": "https://example.test/synthetic-handoff",
                    "company_name": "Synthetic Handoff Employer",
                    "job_title": "Mid-level Backend Engineer",
                    "description": TEXT,
                    "role_category": "backend",
                    "employment_type": "contract",
                    "seniority": "mid",
                    "workplace_type": "remote",
                    "remote_scope": "worldwide",
                    "eligible_countries": ["Pakistan"],
                    "salary_min_original": 2000,
                    "salary_currency": "USD",
                    "salary_period": "monthly",
                    "listing_status": "active",
                    "employer_region": "USA",
                },
            )
            proof = {
                **{f"quote_{kind}": quote for kind, quote in QUOTES.items()},
                "source_checked": "yes",
                "listing_checked": "yes",
                "qualifications": "met",
                "authorization": "met",
                "authorization_note": "Synthetic source permits international independent contracting.",
                "required_skills": "Python",
            }
            saved(
                submit(owner, f"/jobs/{job['id']}", "screening-form", proof),
                "Screening saved: ELIGIBLE",
                "source evidence reviewed through actual form",
            )
            app = insert("applications", {"job_id": job["id"]})
            path = f"/applications/{app['id']}/submission"
            r = submit(
                owner,
                f"/applications/{app['id']}/prepare",
                "package-prepare",
                {
                    "resume_id": resume["id"],
                    "job_excerpt": "Python required",
                    "resume_excerpt": "Built Python APIs at Actual Employer in 2023.",
                    "questions": "Full name?",
                    "facts_confirm": "yes",
                },
            )
            require(r.status_code == 303, "private package generated")
            preview = r.headers["location"]
            saved(
                submit(
                    owner,
                    preview,
                    "package-review",
                    {"review_confirm": "yes", "sensitive_confirm": "yes"},
                ),
                "Reviewed package applied",
                "candidate applies factual package",
            )
            require(
                rows("applications")[0]["status"] == "prepared",
                "eligible reviewed application is prepared",
            )
            require(
                unavailable(other.get(PAGE + path), "Synthetic Handoff Employer"),
                "foreign handoff page denied",
            )
            require(
                http.get(PAGE + "/schedule").status_code == 307,
                "anonymous scheduling page protected",
            )
            config = Settings(
                _env_file=(ROOT / "worker/.env", ROOT / "worker/.env.scheduler"),
                scheduler_enabled=True,
                scheduler_concurrency=3,
            )
            require(
                config.scheduler_database_url is not None
                and urlsplit(config.scheduler_database_url.get_secret_value()).hostname
                in ("localhost", "127.0.0.1"),
                "integration worker uses only local restricted binding",
            )
            enabled = http.get(
                api + "/rest/v1/scheduler_settings?select=user_id&enabled=eq.true",
                headers=admin_headers,
            )
            require(
                enabled.status_code == 200 and not enabled.json(),
                "integration refuses other opted-in accounts; pause real scheduled work before tests",
            )
            pulses = http.get(
                api
                + "/rest/v1/scheduler_workers?select=id&status=eq.running&last_seen=gt."
                + (datetime.now(timezone.utc) - timedelta(minutes=2))
                .isoformat()
                .replace("+00:00", "Z"),
                headers=admin_headers,
            )
            require(
                pulses.status_code == 200 and not pulses.json(),
                "integration requires other scheduler processes stopped",
            )
            private_page = owner.get(PAGE + "/schedule")
            require(
                "private" in private_page.headers.get("cache-control", "")
                and "no-store" in private_page.headers.get("cache-control", ""),
                "schedule responses disable shared caching",
            )
            worker = Scheduler(config)
            worker.check_identity()
            require(True, "real scheduler login passes least-privilege identity check")
            with worker.connect() as db:
                try:
                    db.execute("select * from public.applications")
                except psycopg.errors.InsufficientPrivilege:
                    require(True, "worker cannot directly read candidate applications")
                else:
                    raise AssertionError(
                        "worker has unintended candidate-table permission"
                    )

            def rpc(name, payload=None):
                result = http.post(
                    api + "/rest/v1/rpc/" + name, headers=headers, json=payload or {}
                )
                require(result.status_code == 200, "owner RPC " + name + " succeeds")
                return result.json() if result.content else None

            def claim_one(_=None):
                with worker.connect() as db:
                    return db.execute(
                        "select public.claim_scheduled_task()"
                    ).fetchone()[0]

            def process_claim(claim):
                with worker.connect() as db:
                    return db.execute(
                        "select public.process_scheduled_task(%s,%s)",
                        (claim["id"], claim["lease"]),
                    ).fetchone()[0]

            local_now = lambda: datetime.now(ZoneInfo("Asia/Karachi")).strftime(
                "%Y-%m-%dT%H:%M"
            )
            schedule = {
                "application_id": app["id"],
                "kind": "review_application",
                "due_at": local_now(),
            }
            original = read_form(owner, "/schedule", "schedule-task")
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(
                    pool.map(
                        lambda _: submit(
                            owner,
                            "/schedule",
                            "schedule-task",
                            schedule,
                            original=original,
                        ),
                        range(2),
                    )
                )
            for result in results:
                saved(
                    result,
                    "Application review scheduled",
                    "concurrent scheduling request acknowledged",
                )
            require(
                len(rows("scheduled_tasks")) == 1,
                "concurrent scheduling yields one task",
            )
            saved(
                submit(
                    owner,
                    "/schedule",
                    "scheduler-settings",
                    {"enabled": "yes", "max_concurrency": "1"},
                ),
                "Background checks enabled",
                "scheduler opt-in saved",
            )
            require(claim_one() is None, "global pause prevents real worker claim")
            saved(
                submit(owner, "/schedule", "global-pause"),
                "Global pause is off",
                "global processing explicitly enabled",
            )
            saved(
                submit(owner, path, "pause-source"),
                "New handoffs paused",
                "source paused independently",
            )
            require(claim_one() is None, "source pause prevents real worker claim")
            saved(
                submit(owner, path, "pause-source"),
                "Human-assisted handoffs enabled",
                "source resumed",
            )
            for seconds in (10, 20):
                rpc(
                    "schedule_application_review",
                    {
                        "p_application_id": app["id"],
                        "p_due_at": (
                            datetime.now(timezone.utc) - timedelta(seconds=seconds)
                        ).isoformat(),
                        "p_request_id": str(uuid4()),
                    },
                )
            with ThreadPoolExecutor(max_workers=8) as pool:
                claims = [c for c in pool.map(claim_one, range(8)) if c]
            require(
                len(claims) == 1,
                "eight simultaneous workers reserve only one configured owner slot",
            )
            saved(
                submit(
                    owner,
                    "/schedule",
                    "scheduler-settings",
                    {"enabled": "yes", "max_concurrency": "3"},
                ),
                "Background checks enabled",
                "owner concurrency limit changes",
            )
            claims.extend([claim_one(), claim_one()])
            require(
                all(claims) and claim_one() is None,
                "global database cap permits three leases and blocks a fourth",
            )
            saved(
                submit(owner, "/schedule", "global-pause"),
                "Global pause is on",
                "global pause switched after leases acquired",
            )
            with ThreadPoolExecutor(max_workers=3) as pool:
                outcomes = list(pool.map(process_claim, claims))
            require(
                outcomes == ["paused"] * 3,
                "all claimed tasks recheck pause before processing",
            )
            require(
                all(
                    t["state"] == "queued" and t["attempts"] == 0
                    for t in rows("scheduled_tasks")
                ),
                "pause releases leases without burning retries",
            )
            saved(
                submit(owner, "/schedule", "global-pause"),
                "Global pause is off",
                "processing resumed",
            )
            for _ in range(3):
                worker.run_cycle()
            require(
                all(t["state"] == "ready" for t in rows("scheduled_tasks")),
                "actual worker checks current snapshots and produces review reminders",
            )
            require(
                not rows("submission_runs")
                and rows("applications")[0]["applied_at"] is None,
                "scheduled checks create neither handoffs nor submissions",
            )
            require(
                rpc("handoff_quota")["remaining"] == 1,
                "readiness work uses no daily submission capacity",
            )
            require(
                rpc("scheduler_metrics")["worker_live"]
                and "<strong>Active</strong>" in owner.get(PAGE + "/schedule").text,
                "fresh worker heartbeat appears in authenticated monitoring",
            )
            require(
                not rows("scheduled_tasks", 1) and not rows("scheduler_attempts", 1),
                "other account cannot read tasks or attempt history",
            )
            result = http.post(
                api + "/rest/v1/rpc/claim_scheduled_task", headers=headers, json={}
            )
            require(
                result.status_code == 401 or result.status_code == 403,
                "candidate API cannot invoke worker claim capability",
            )
            task = rows("scheduled_tasks")[0]
            saved(
                submit(owner, "/schedule", f"resolve-{task['id']}"),
                "Task updated",
                "readiness reminder can be dismissed without submission",
            )
            # Prepare a second valid application, then race two different handoffs at limit one.
            second_job = insert(
                "jobs",
                {
                    k: job[k]
                    for k in (
                        "source_platform",
                        "company_name",
                        "job_title",
                        "description",
                        "role_category",
                        "employment_type",
                        "seniority",
                        "workplace_type",
                        "remote_scope",
                        "eligible_countries",
                        "salary_min_original",
                        "salary_currency",
                        "salary_period",
                        "listing_status",
                        "employer_region",
                    )
                }
                | {"canonical_url": job["canonical_url"] + "-second"},
            )
            saved(
                submit(owner, f"/jobs/{second_job['id']}", "screening-form", proof),
                "Screening saved: ELIGIBLE",
                "second synthetic job screened",
            )
            second_app = insert("applications", {"job_id": second_job["id"]})
            r = submit(
                owner,
                f"/applications/{second_app['id']}/prepare",
                "package-prepare",
                {
                    "resume_id": resume["id"],
                    "job_excerpt": "Python required",
                    "resume_excerpt": "Built Python APIs at Actual Employer in 2023.",
                    "questions": "Full name?",
                    "facts_confirm": "yes",
                },
            )
            require(r.status_code == 303, "second truthful package generated")
            saved(
                submit(
                    owner,
                    r.headers["location"],
                    "package-review",
                    {"review_confirm": "yes", "sensitive_confirm": "yes"},
                ),
                "Reviewed package applied",
                "second package reviewed",
            )
            starts = []
            for application in (app, second_app):
                check_path = f"/applications/{application['id']}/submission"
                dry = submit(owner, check_path, "submission-check")
                require(dry.status_code == 303, "current application dry check saved")
                dry_path = dry.headers["location"]
                starts.append((dry_path, read_form(owner, dry_path, "handoff-start")))
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(
                    pool.map(
                        lambda pair: submit(
                            owner,
                            pair[0],
                            "handoff-start",
                            {"handoff_confirm": "yes"},
                            original=pair[1],
                        ),
                        starts,
                    )
                )
            require(
                sorted(r.status_code for r in results) == [200, 303],
                "simultaneous different applications cannot overrun limit one",
            )
            saved(
                next(r for r in results if r.status_code == 200),
                "Daily handoff limit reached",
                "quota rejection explains pending outcomes and local reset",
            )
            handoffs = [
                r for r in rows("submission_runs") if r["mode"] == "human_assisted"
            ]
            require(
                len(handoffs) == 1 and rpc("handoff_quota")["remaining"] == 0,
                "one durable reservation consumes the slot",
            )
            handoffpath = next(r for r in results if r.status_code == 303).headers[
                "location"
            ]
            saved(
                submit(
                    owner,
                    handoffpath,
                    "handoff-outcome",
                    {
                        "outcome": "candidate_reported",
                        "note": "Synthetic actual receipt for quota integration",
                        "applied_at": local_now(),
                        "outcome_confirm": "yes",
                    },
                ),
                "Actual manual submission recorded",
                "actual receipt remains recordable at full quota",
            )
            quota = rpc("handoff_quota")
            require(
                quota["completed_today"] == 1
                and quota["pending_handoffs"] == 0
                and quota["remaining"] == 0,
                "completion counts once in local-day budget",
            )
            winner = handoffs[0]["application_id"]
            reminder = {
                "application_id": winner,
                "kind": "follow_up",
                "due_at": local_now(),
            }
            saved(
                submit(owner, "/schedule", "schedule-task", reminder),
                "Follow-up reminder scheduled",
                "actual submitted record receives local reminder",
            )
            worker.run_cycle()
            follow = next(
                t for t in rows("scheduled_tasks") if t["kind"] == "follow_up"
            )
            require(
                follow["state"] == "ready" and follow["result_code"] == "follow_up_due",
                "worker delivers due follow-up to local queue",
            )
            saved(
                submit(owner, "/schedule", f"resolve-{follow['id']}"),
                "Task updated",
                "dismissal acknowledges reminder without sending message",
            )
            require(
                next(a for a in rows("applications") if a["id"] == winner)[
                    "follow_up_at"
                ]
                is None,
                "dismissal clears matching due date",
            )
            response_form = read_form(owner, "/schedule", "record-response")
            changes = {
                "application_id": winner,
                "status": "interview",
                "note": "Actual synthetic interview invitation",
                "actual_confirm": "yes",
            }
            saved(
                submit(
                    owner,
                    "/schedule",
                    "record-response",
                    {**changes, "actual_confirm": None},
                    original=response_form,
                ),
                "Confirm this is an actual",
                "actual response acknowledgement required",
            )
            saved(
                submit(
                    owner,
                    "/schedule",
                    "record-response",
                    changes,
                    original=response_form,
                ),
                "Actual response recorded",
                "actual response updates tracker",
            )
            saved(
                submit(
                    owner,
                    "/schedule",
                    "record-response",
                    changes,
                    original=response_form,
                ),
                "Actual response recorded",
                "same response request retry is idempotent",
            )
            events = [
                e for e in rows("application_events") if e["event_type"] == "response"
            ]
            require(
                len(events) == 1
                and next(a for a in rows("applications") if a["id"] == winner)["status"]
                == "interview",
                "one response audit and interview state persisted",
            )
            metrics = rpc("scheduler_metrics")
            require(
                metrics["responses"] == 1
                and metrics["interviews"] == 1
                and sum(d["manual"] for d in metrics["days"]) == 1
                and sum(d["verified"] for d in metrics["days"]) == 0,
                "fourteen-day report separates actual manual reports from provider verification",
            )
            worker.heartbeat("stopped")
            require(
                not rpc("scheduler_metrics")["worker_live"],
                "stopped worker is not shown as running",
            )
            require(
                "Actual synthetic interview invitation"
                in owner.get(PAGE + f"/applications/{winner}").text,
                "response notes visible in actual application record",
            )
        finally:
            if "worker" in locals():
                worker.heartbeat("stopped")
                cleaned = http.delete(
                    api + "/rest/v1/scheduler_workers?id=eq." + str(worker.worker_id),
                    headers=admin_headers,
                )
                require(
                    cleaned.status_code in (200, 204),
                    "isolated worker heartbeat removed",
                )
            for account in accounts:
                listed = http.post(
                    api + "/storage/v1/object/list/resumes",
                    headers=admin_headers,
                    json={"prefix": account["id"], "limit": 100},
                )
                if listed.status_code == 200:
                    paths = [
                        account["id"] + "/" + item["name"]
                        for item in listed.json()
                        if item.get("id")
                    ]
                    if paths:
                        r = http.request(
                            "DELETE",
                            api + "/storage/v1/object/resumes",
                            headers=admin_headers,
                            json={"prefixes": paths},
                        )
                        require(
                            r.status_code == 200,
                            "Phase 6 private fixture files removed",
                        )
                r = http.delete(
                    api + "/auth/v1/admin/users/" + account["id"], headers=admin_headers
                )
                require(
                    r.status_code in (200, 204),
                    "Phase 6 fixture account and all associated private records removed",
                )


if __name__ == "__main__":
    main()
