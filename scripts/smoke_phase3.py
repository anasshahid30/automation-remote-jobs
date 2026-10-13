"""Local Phase 3 integration plus concurrent retry checks; no external source/AI requests.

Creates two labelled synthetic accounts, then removes their records and private files.
Run while local Supabase and a built Next server are running.
"""

import json
import os
import secrets
import subprocess
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from smoke_local import PAGE, ROOT, require
from smoke_phase2 import read_form, saved, submit, unavailable

TEXT = "Synthetic test fixture, not a real listing. Fully remote backend contract. Hiring independent contractors worldwide, including Pakistan. Mid-level. Employer based in USA. Compensation USD 2,000 per month. Python required. No local work authorization or relocation required. Applications currently open."
QUOTES = {
    "remote": "Fully remote",
    "country": "Hiring independent contractors worldwide, including Pakistan",
    "role": "backend",
    "seniority": "Mid-level",
    "employment": "contract",
    "region": "Employer based in USA",
    "salary": "Compensation USD 2,000 per month",
    "skills": "Python required",
    "authorization": "No local work authorization or relocation required",
}


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
        "Phase 3 tests target only local Supabase",
    )
    anon = status.get("PUBLISHABLE_KEY") or status["ANON_KEY"]
    admin = status.get("SECRET_KEY") or status["SERVICE_ROLE_KEY"]
    admin_headers = {"apikey": admin, "Authorization": f"Bearer {admin}"}
    accounts = []
    with (
        httpx.Client(timeout=45) as http,
        httpx.Client(timeout=60) as owner,
        httpx.Client(timeout=60) as other,
    ):
        try:
            for route in ["/review", "/jobs/import"]:
                r = owner.get(PAGE + route)
                require(
                    r.status_code == 307 and r.headers.get("location") == "/login",
                    f"anonymous {route} protected",
                )
            for browser in [owner, other]:
                email, password = (
                    f"phase3-{uuid4()}@example.test",
                    secrets.token_urlsafe(24),
                )
                created = http.post(
                    api + "/auth/v1/admin/users",
                    headers=admin_headers,
                    json={"email": email, "password": password, "email_confirm": True},
                )
                require(
                    created.status_code in (200, 201),
                    "isolated Phase 3 fixture account created",
                )
                account = {"id": created.json()["id"]}
                accounts.append(account)
                r = submit(
                    browser, "/login", "form-0", {"email": email, "password": password}
                )
                require(
                    r.status_code == 303, "Phase 3 fixture signs in through real form"
                )
                token = http.post(
                    api + "/auth/v1/token?grant_type=password",
                    headers={"apikey": anon},
                    json={"email": email, "password": password},
                )
                require(token.status_code == 200, "fixture API authentication succeeds")
                account["headers"] = {
                    "apikey": anon,
                    "Authorization": f"Bearer {token.json()['access_token']}",
                }

            def rows(table, index=0):
                r = http.get(
                    api + f"/rest/v1/{table}?select=*",
                    headers=accounts[index]["headers"],
                )
                if r.status_code != 200:
                    raise RuntimeError(
                        f"Fixture query {table} failed (HTTP {r.status_code})"
                    )
                return r.json()

            def metrics():
                return http.post(
                    api + "/rest/v1/rpc/dashboard_metrics",
                    headers=accounts[0]["headers"],
                    json={},
                ).json()

            def api_import(payload, index=0):
                return http.post(
                    api + "/rest/v1/rpc/import_jobs",
                    headers=accounts[index]["headers"],
                    json={"p_jobs": payload},
                )

            saved(
                submit(
                    owner,
                    "/settings",
                    "profile-form",
                    {"full_name": "Synthetic Phase 3 Fixture", "city": "Fixture City"},
                ),
                "Profile saved",
                "Phase 3 real settings form works",
            )
            url = f"https://example.test/phase3-{uuid4()}"
            record = {
                "url": url + "?utm_source=one",
                "company": "Synthetic Phase 3 Employer",
                "title": "Mid-level Backend Fixture",
                "description": TEXT,
            }
            saved(
                submit(owner, "/jobs/import", "import-single", record),
                "Import completed: 1 new record",
                "single manual import creates a job",
            )
            job = rows("jobs")[0]
            path = f"/jobs/{job['id']}"
            require(
                job["original_url"] == record["url"] and job["normalized_url"] == url,
                "original URL retained with separate normalized identity",
            )
            duplicate = {
                **record,
                "url": url + "?utm_source=two#description",
                "description": "Duplicate synthetic text must not overwrite the original.",
            }
            saved(
                submit(
                    owner,
                    "/jobs/import",
                    "import-batch",
                    {"json": json.dumps([duplicate])},
                ),
                "0 new record(s), 1 already saved",
                "batch deduplicates tracking variants",
            )
            require(
                len(rows("jobs")) == 1
                and next(r for r in rows("jobs") if r["id"] == job["id"])["description"]
                == TEXT,
                "duplicate import preserves saved source text",
            )
            saved(
                submit(
                    owner,
                    "/jobs/import",
                    "import-batch",
                    {"json": json.dumps([{**record, "url": url + "-other"}])},
                ),
                "possible duplicate(s)",
                "possible semantic duplicate is flagged for review",
            )
            require(
                len(rows("jobs")) == 2, "semantic candidates remain separate records"
            )
            saved(
                submit(
                    owner,
                    "/jobs/import",
                    "import-batch",
                    {
                        "json": json.dumps(
                            [{**record, "unexpected_secret": "synthetic"}]
                        )
                    },
                ),
                "Extra fields are rejected",
                "import rejects unrecognized fields",
            )
            saved(
                submit(owner, "/jobs/import", "import-batch", {"json": "{broken"}),
                "Enter valid JSON",
                "malformed JSON produces a useful error",
            )
            failed = api_import(
                [
                    {
                        "canonical_url": url + "-rollback",
                        "company_name": "Synthetic",
                        "job_title": "Synthetic",
                        "description": "Synthetic",
                    },
                    {
                        "canonical_url": "http://example.test/insecure",
                        "company_name": "Synthetic",
                        "job_title": "Synthetic",
                        "description": "Synthetic",
                    },
                ]
            )
            require(
                failed.status_code >= 400 and len(rows("jobs")) == 2,
                "database batch failure has no partial records",
            )
            payload = [
                {
                    "canonical_url": url + "-concurrent",
                    "source_platform": "manual",
                    "external_job_id": "shared-fixture-id",
                    "company_name": "Synthetic Concurrent Employer",
                    "job_title": "Synthetic Retry Role",
                    "description": "Synthetic concurrency fixture only.",
                }
            ]
            with ThreadPoolExecutor(max_workers=2) as pool:
                responses = list(pool.map(lambda _: api_import(payload), range(2)))
            require(
                all(r.status_code == 200 for r in responses)
                and sorted(r.json()[0]["created"] for r in responses) == [False, True],
                "concurrent import retries create one record",
            )
            require(
                len(rows("jobs")) == 3, "concurrent duplicate was not processed twice"
            )
            saved(
                submit(
                    owner,
                    "/jobs/import",
                    "import-batch",
                    {
                        "json": json.dumps(
                            [{**record, "source_id": "shared-fixture-id"}]
                        )
                    },
                ),
                "match different saved records",
                "conflicting source and URL identities do not merge records",
            )
            require(
                len(rows("jobs")) == 3
                and next(r for r in rows("jobs") if r["id"] == job["id"])["description"]
                == TEXT,
                "identity conflict preserves all records",
            )
            foreign = api_import([{**payload[0], "canonical_url": url}], 1)
            require(
                foreign.status_code == 200 and len(rows("jobs", 1)) == 1,
                "same public job can belong independently to different owners",
            )
            require(
                unavailable(other.get(PAGE + path), "Mid-level Backend Fixture"),
                "other account cannot read owner job or evidence",
            )
            require(
                "Mid-level Backend Fixture" in owner.get(PAGE + "/review").text,
                "unassessed listing appears in review queue",
            )
            changes = {
                "role_category": "backend",
                "employment_type": "contract",
                "seniority": "mid",
                "workplace_type": "remote",
                "remote_scope": "worldwide",
                "eligible_countries": "Pakistan",
                "salary_min_original": "2000",
                "salary_currency": "USD",
                "salary_period": "monthly",
                "listing_status": "active",
                "employer_region": "USA",
            }
            saved(
                submit(owner, path, "job-form", changes),
                "Listing updated",
                "published job facts saved before screening",
            )
            saved(
                submit(owner, path, "screening-form"),
                "Screening saved: NEEDS REVIEW",
                "missing evidence remains needs review",
            )
            require(
                metrics()["eligible_jobs"] == 0 and metrics()["review_jobs"] == 1,
                "dashboard counts unresolved evidence separately",
            )
            old_count = len(rows("eligibility_checks"))
            saved(
                submit(
                    owner,
                    path,
                    "screening-form",
                    {"quote_country": "Invented positive claim"},
                ),
                "Every source quote",
                "invented quote rejected",
            )
            require(
                len(rows("eligibility_checks")) == old_count,
                "invalid evidence has no phantom screening record",
            )
            saved(
                submit(
                    owner,
                    "/resumes",
                    "resume-upload",
                    {"version_name": "Synthetic Python Master", "skills": "Python"},
                    upload=(
                        "phase3-fixture.txt",
                        b"Synthetic resume metadata fixture only.",
                        "text/plain",
                    ),
                ),
                "Private resume version uploaded",
                "verified master skill fixture uploaded privately",
            )
            resume = rows("resumes")[0]
            saved(
                submit(owner, "/resumes", f"master-{resume['id']}"),
                "Master selection updated",
                "master selected for required-skill comparison",
            )
            proof = {
                **{f"quote_{kind}": quote for kind, quote in QUOTES.items()},
                "source_checked": "yes",
                "listing_checked": "yes",
                "qualifications": "met",
                "authorization": "met",
                "authorization_note": "Synthetic source explicitly permits international contracting without local authorization or relocation.",
                "required_skills": "Python",
            }
            saved(
                submit(owner, path, "screening-form", proof),
                "Screening saved: ELIGIBLE",
                "complete candidate-checked evidence produces eligible result",
            )
            check = next(r for r in rows("eligibility_checks") if r["is_current"])
            require(
                check["match_score"] == 100 and check["factors"]["monthly_min"] == 2000,
                "saved score factors include normalized compensation",
            )
            require(
                metrics()["eligible_jobs"] == 1,
                "dashboard eligible count uses current result",
            )
            require(
                "Mid-level Backend Fixture"
                in owner.get(
                    PAGE
                    + "/jobs?decision=ELIGIBLE&source=manual&region=USA&min_monthly=1500"
                ).text,
                "eligibility/source/region/pay filters use current data",
            )
            require(
                "Mid-level Backend Fixture"
                not in owner.get(PAGE + "/jobs?min_monthly=2500").text,
                "minimum pay filter excludes lower equivalents",
            )
            require(
                f'href="{path}#screening-result"'
                not in owner.get(PAGE + "/review").text,
                "eligible job leaves unresolved queue",
            )
            saved(
                submit(owner, path, "disposition-form", {"disposition": "shortlisted"}),
                "Saved your search disposition",
                "manual shortlist does not submit or approve a job",
            )
            require(
                metrics()["eligible_jobs"] == 1,
                "shortlist preserves current eligibility",
            )
            stale = read_form(owner, path, "screening-form")
            saved(
                submit(
                    owner, "/settings", "profile-form", {"salary_min_monthly": "2500"}
                ),
                "Profile saved",
                "preference change invalidates earlier evaluations",
            )
            require(
                metrics()["eligible_jobs"] == 0
                and next(
                    r for r in rows("job_screening_summary") if r["id"] == job["id"]
                )["screening_stale"],
                "stale positive check cannot remain eligible",
            )
            saved(
                submit(owner, path, "screening-form", proof, original=stale),
                "profile changed",
                "old rendered profile snapshot cannot save a result",
            )
            saved(
                submit(
                    owner, "/settings", "profile-form", {"salary_min_monthly": "1500"}
                ),
                "Profile saved",
                "restore fixture preference",
            )
            saved(
                submit(owner, path, "screening-form", proof),
                "Screening saved: ELIGIBLE",
                "fresh evaluation uses updated profile",
            )
            saved(
                submit(
                    owner,
                    "/resumes",
                    "resume-upload",
                    {"version_name": "Synthetic Other Master", "skills": "TypeScript"},
                    upload=(
                        "phase3-other-fixture.txt",
                        b"Synthetic alternate master fixture.",
                        "text/plain",
                    ),
                ),
                "Private resume version uploaded",
                "new resume version invalidates earlier skill context",
            )
            alternative = next(r for r in rows("resumes") if r["id"] != resume["id"])
            saved(
                submit(owner, "/resumes", f"master-{alternative['id']}"),
                "Master selection updated",
                "master skill context changed",
            )
            saved(
                submit(owner, path, "screening-form", proof),
                "Screening saved: NEEDS REVIEW",
                "missing master skill lowers score and requires review",
            )
            current = next(r for r in rows("eligibility_checks") if r["is_current"])
            require(
                current["match_score"] == 86
                and current["factors"]["missing_skills"] == ["Python"],
                "missing required skills are retained in score evidence",
            )
            saved(
                submit(owner, "/resumes", f"master-{resume['id']}"),
                "Master selection updated",
                "restore verified Python master",
            )
            saved(
                submit(
                    owner,
                    path,
                    "job-form",
                    {
                        "description": TEXT
                        + "\nUS-only applicants. Must reside in the United States."
                    },
                ),
                "Listing updated",
                "source restriction saved",
            )
            saved(
                submit(owner, path, "screening-form", proof),
                "Screening saved: INELIGIBLE",
                "hard residency restriction defeats a high match score",
            )
            current = next(r for r in rows("eligibility_checks") if r["is_current"])
            require(
                current["match_score"] >= 80
                and current["pakistan_eligibility"] == "fail",
                "score cannot override geographic exclusion",
            )
            require(
                "Manual review and screening work without an AI key"
                in owner.get(PAGE + path).text,
                "ordinary workflow works with AI disabled",
            )
            suggestion = {
                "role_category": "backend",
                "seniority": "mid",
                "employment_type": "contract",
                "confidence": 0.8,
                "citations": [
                    {"field": "role_category", "quote": "backend"},
                    {"field": "seniority", "quote": "Mid-level"},
                    {"field": "employment_type", "quote": "contract"},
                ],
            }
            job_now = next(r for r in rows("jobs") if r["id"] == job["id"])
            seeded = http.post(
                api + "/rest/v1/job_classifications",
                headers={**accounts[0]["headers"], "Prefer": "return=representation"},
                json={
                    "job_id": job["id"],
                    "job_updated_at": job_now["updated_at"],
                    "provider": "openai",
                    "model": "synthetic-mock-provider",
                    "suggestion": suggestion,
                },
            )
            require(
                seeded.status_code == 201,
                "explicit mocked classifier response saved for UI testing",
            )
            saved(
                submit(owner, path, "apply-classification"),
                "Verify the suggested fields",
                "AI suggestions need candidate confirmation",
            )
            saved(
                submit(
                    owner,
                    path,
                    "apply-classification",
                    {"confirm_classification": "yes"},
                ),
                "Reviewed classification fields copied",
                "reviewed soft classification fields can be copied",
            )
            saved(
                submit(owner, path, "screening-form", proof),
                "Screening saved: INELIGIBLE",
                "AI classification cannot override country restrictions",
            )
            require(
                not rows("eligibility_checks", 1)
                and not rows("job_reviews", 1)
                and not rows("job_classifications", 1),
                "screening, quotes and model suggestions are owner-isolated",
            )
            with ThreadPoolExecutor(max_workers=2) as pool:
                responses = list(
                    pool.map(
                        lambda _: http.post(
                            api + "/rest/v1/applications",
                            headers=accounts[0]["headers"],
                            json={"job_id": job["id"]},
                        ),
                        range(2),
                    )
                )
            require(
                sorted(r.status_code for r in responses) == [201, 409]
                and len(rows("applications")) == 1,
                "concurrent application retries cannot create duplicate records",
            )
            require(
                all(
                    r["status"] == "draft" and r["applied_at"] is None
                    for r in rows("applications")
                ),
                "screening and classification never claim a submitted application",
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
                        deleted = http.request(
                            "DELETE",
                            api + "/storage/v1/object/resumes",
                            headers=admin_headers,
                            json={"prefixes": paths},
                        )
                        require(
                            deleted.status_code == 200,
                            "Phase 3 private fixture files removed",
                        )
                deleted = http.delete(
                    api + "/auth/v1/admin/users/" + account["id"], headers=admin_headers
                )
                require(
                    deleted.status_code in (200, 204),
                    "Phase 3 account and all associated fixture records removed",
                )


if __name__ == "__main__":
    main()
