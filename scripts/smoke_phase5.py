"""Local Phase 5 handoff integration. Synthetic fixtures; no employer is contacted."""

import json
import os
import secrets
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
from smoke_local import PAGE, ROOT, require
from smoke_phase2 import read_form, saved, submit, unavailable
from smoke_phase3 import QUOTES, TEXT


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
        "Phase 5 only targets local Supabase",
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
                    f"phase5-{uuid4()}@example.test",
                    secrets.token_urlsafe(24),
                )
                created = http.post(
                    api + "/auth/v1/admin/users",
                    headers=admin_headers,
                    json={"email": email, "password": password, "email_confirm": True},
                )
                require(
                    created.status_code in (200, 201),
                    "isolated Phase 5 account created",
                )
                account = {"id": created.json()["id"]}
                accounts.append(account)
                r = submit(
                    browser, "/login", "form-0", {"email": email, "password": password}
                )
                require(
                    r.status_code == 303, "Phase 5 account signs in through actual form"
                )
                token = http.post(
                    api + "/auth/v1/token?grant_type=password",
                    headers={"apikey": anon},
                    json={"email": email, "password": password},
                )
                require(token.status_code == 200, "Phase 5 API authentication succeeds")
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
            original = read_form(owner, path, "submission-check")
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(
                    pool.map(
                        lambda _: submit(
                            owner, path, "submission-check", original=original
                        ),
                        range(2),
                    )
                )
            require(
                all(r.status_code == 303 for r in results)
                and results[0].headers["location"] == results[1].headers["location"],
                "simultaneous dry checks resolve to one run",
            )
            dry = rows("submission_runs")[0]
            require(
                dry["state"] == "dry_run_passed" and dry["report"]["ready"],
                "current file, factual content, answers and eligibility pass",
            )
            require(
                rows("applications")[0]["applied_at"] is None,
                "dry check never reports submission",
            )
            runpath = results[0].headers["location"]
            start_form = read_form(owner, runpath, "handoff-start")
            saved(
                submit(
                    owner,
                    runpath,
                    "handoff-start",
                    {"handoff_confirm": "yes"},
                    original=start_form,
                ),
                "Run not saved",
                "default global pause blocks handoff",
            )
            saved(
                submit(owner, path, "pause-global"),
                "Human-assisted handoffs enabled",
                "global handoffs explicitly enabled",
            )
            saved(
                submit(owner, path, "pause-source"),
                "New handoffs paused",
                "source pause enabled",
            )
            saved(
                submit(
                    owner,
                    runpath,
                    "handoff-start",
                    {"handoff_confirm": "yes"},
                    original=start_form,
                ),
                "Run not saved",
                "source pause independently blocks handoff",
            )
            saved(
                submit(owner, path, "pause-source"),
                "Human-assisted handoffs enabled",
                "source handoffs enabled",
            )
            saved(
                submit(
                    owner,
                    runpath,
                    "handoff-start",
                    {"handoff_confirm": None},
                    original=start_form,
                ),
                "Confirm that you will complete",
                "handoff requires candidate acknowledgement",
            )
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(
                    pool.map(
                        lambda _: submit(
                            owner,
                            runpath,
                            "handoff-start",
                            {"handoff_confirm": "yes"},
                            original=start_form,
                        ),
                        range(2),
                    )
                )
            require(
                all(r.status_code == 303 for r in results)
                and results[0].headers["location"] == results[1].headers["location"],
                "concurrent handoff requests produce one durable claim",
            )
            handoffpath = results[0].headers["location"]
            handoff = next(
                r for r in rows("submission_runs") if r["mode"] == "human_assisted"
            )
            require(
                handoff["state"] == "handoff_ready"
                and rows("applications")[0]["applied_at"] is None,
                "ready handoff is not counted as submitted",
            )
            require(
                "Open employer’s official form" in owner.get(PAGE + handoffpath).text,
                "ready handoff exposes original official form link",
            )
            # More recent history must never hide an older active duplicate guard.
            for _ in range(31):
                r = http.post(
                    api + "/rest/v1/rpc/record_submission_run",
                    headers=headers,
                    json={
                        "p_application_id": app["id"],
                        "p_package_id": handoff["package_id"],
                        "p_request_id": str(uuid4()),
                        "p_mode": "dry_run",
                        "p_snapshot": handoff["input_snapshot"],
                        "p_report": {**dry["report"], "ready": False},
                    },
                )
                require(r.status_code == 200, "synthetic history record added")
            require(
                "An existing handoff blocks another attempt"
                in owner.get(PAGE + path).text,
                "active claim stays visible beyond latest 30 history rows",
            )
            outcome = read_form(owner, handoffpath, "handoff-outcome")
            saved(
                submit(
                    owner,
                    handoffpath,
                    "handoff-outcome",
                    {
                        "outcome": "uncertain",
                        "note": "Synthetic form timed out; receipt unknown.",
                        "outcome_confirm": "yes",
                    },
                    original=outcome,
                ),
                "Outcome marked uncertain",
                "candidate records uncertainty",
            )
            require(
                "Open employer’s official form"
                not in owner.get(PAGE + handoffpath).text,
                "uncertain result asks for receipt check before retry",
            )
            saved(
                submit(
                    owner,
                    runpath,
                    "handoff-start",
                    {"request_id": str(uuid4()), "handoff_confirm": "yes"},
                    original=start_form,
                ),
                "Handoff blocked",
                "new request cannot duplicate uncertain handoff",
            )
            require(
                rows("applications")[0]["applied_at"] is None,
                "uncertain outcome remains unsubmitted",
            )
            saved(
                submit(owner, path, "pause-global"),
                "New handoffs paused",
                "kill switch pauses new handoffs",
            )
            saved(
                submit(
                    owner,
                    handoffpath,
                    "handoff-outcome",
                    {
                        "outcome": "cancelled",
                        "note": "Candidate verified that no application was submitted.",
                        "outcome_confirm": "yes",
                    },
                ),
                "Handoff cancelled",
                "verified cancellation can be recorded during pause",
            )
            saved(
                submit(owner, path, "pause-global"),
                "Human-assisted handoffs enabled",
                "global enabled for replacement handoff",
            )
            r = submit(
                owner,
                runpath,
                "handoff-start",
                {"request_id": str(uuid4()), "handoff_confirm": "yes"},
                original=start_form,
            )
            require(
                r.status_code == 303,
                "confirmed no-submission cancellation permits replacement",
            )
            finalpath = r.headers["location"]
            outcome = read_form(owner, finalpath, "handoff-outcome")
            future = (
                datetime.now(ZoneInfo("Asia/Karachi")) + timedelta(days=1)
            ).strftime("%Y-%m-%dT%H:%M")
            saved(
                submit(
                    owner,
                    finalpath,
                    "handoff-outcome",
                    {
                        "outcome": "candidate_reported",
                        "note": "Synthetic receipt only",
                        "applied_at": future,
                        "outcome_confirm": "yes",
                    },
                    original=outcome,
                ),
                "Outcome not saved",
                "future receipt cannot be reported as submitted",
            )
            actual = datetime.now(ZoneInfo("Asia/Karachi")).strftime("%Y-%m-%dT%H:%M")
            saved(
                submit(
                    owner,
                    finalpath,
                    "handoff-outcome",
                    {
                        "outcome": "candidate_reported",
                        "note": "Synthetic fixture receipt after manual submission",
                        "applied_at": actual,
                        "outcome_confirm": "yes",
                    },
                    original=outcome,
                ),
                "Actual manual submission recorded",
                "real outcome form records candidate report",
            )
            application = rows("applications")[0]
            require(
                application["status"] == "submitted"
                and application["confirmation_evidence"]["kind"]
                == "candidate_reported",
                "manual completion never claims provider verification",
            )
            require(
                application["confirmation_evidence"]["package_id"]
                == handoff["package_id"],
                "receipt retains exact package provenance",
            )
            require(
                not rows("submission_runs", 1) and not rows("submission_controls", 1),
                "RLS hides private run history and pause controls",
            )
            for method, payload in [
                ("PATCH", {"state": "candidate_reported"}),
                ("DELETE", None),
            ]:
                r = http.request(
                    method,
                    api + "/rest/v1/submission_runs?id=eq." + handoff["id"],
                    headers=headers,
                    json=payload,
                )
                require(
                    r.status_code == 403, "direct attempt rewriting or deletion denied"
                )
            r = http.delete(
                api + "/rest/v1/applications?id=eq." + app["id"], headers=headers
            )
            require(
                r.status_code == 409,
                "duplicate protection survives application deletion attempt",
            )
            # Changed factual inputs produce a failed historical check, without a success count.
            saved(
                submit(
                    owner,
                    f"/resumes/{resume['id']}/text",
                    "resume-text",
                    {
                        "text_content": resume_text + " Verified new fact.",
                        "verified": "yes",
                    },
                ),
                "Resume text verified",
                "source facts can change after historical submission",
            )
            r = submit(owner, path, "submission-check")
            require(
                r.status_code == 303,
                "changed sources still produce reviewable dry report",
            )
            latest = max(rows("submission_runs"), key=lambda r: r["created_at"])
            require(
                latest["state"] == "blocked" and not latest["report"]["ready"],
                "stale package and previous submission block new readiness",
            )
        finally:
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
                            "Phase 5 private fixture files removed",
                        )
                r = http.delete(
                    api + "/auth/v1/admin/users/" + account["id"], headers=admin_headers
                )
                require(
                    r.status_code in (200, 204),
                    "Phase 5 fixture account and all associated private records removed",
                )


if __name__ == "__main__":
    main()
