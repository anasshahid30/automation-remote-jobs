"""Local-only Phase 2 workflow through rendered forms and real Supabase RLS.

Creates two isolated synthetic accounts, uploads fixture files, and removes all fixtures.
Requires the local Supabase stack and a Next development or production server on port 3000.
No employer, AI service, or submission API is contacted.
"""

import json
import os
import secrets
import subprocess
from datetime import datetime, timedelta
from html.parser import HTMLParser
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
from smoke_local import PAGE, ROOT, require


class Forms(HTMLParser):
    """Read browser defaults, including React's bound Server Action hidden fields."""

    def __init__(self, html: str):
        super().__init__(convert_charrefs=True)
        self.forms: dict[str, list[tuple[str, str]]] = {}
        self.current: str | None = None
        self.textarea: str | None = None
        self.text = ""
        self.select: str | None = None
        self.options: list[tuple[str, bool]] = []
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "form":
            self.current = attrs.get("id", f"form-{len(self.forms)}")
            self.forms[self.current] = []
        if self.current is None:
            return
        name = attrs.get("name")
        if tag == "input" and name and "disabled" not in attrs:
            kind = attrs.get("type", "text")
            if kind not in ("file", "submit", "button") and (
                kind not in ("checkbox", "radio") or "checked" in attrs
            ):
                self.forms[self.current].append((name, attrs.get("value", "")))
        if tag == "textarea" and name:
            self.textarea, self.text = name, ""
        if tag == "select" and name:
            self.select, self.options = name, []
        if tag == "option" and self.select:
            self.options.append((attrs.get("value", ""), "selected" in attrs))

    def handle_data(self, data):
        if self.textarea:
            self.text += data

    def handle_endtag(self, tag):
        if self.current is None:
            return
        if tag == "textarea" and self.textarea:
            self.forms[self.current].append((self.textarea, self.text))
            self.textarea = None
        if tag == "select" and self.select:
            value = next(
                (value for value, selected in self.options if selected),
                self.options[0][0],
            )
            self.forms[self.current].append((self.select, value))
            self.select = None
        if tag == "form":
            self.current = None


def read_form(browser, path: str, name: str):
    page = browser.get(PAGE + path)
    if page.status_code != 200:
        raise RuntimeError(f"Cannot read {name}: HTTP {page.status_code}")
    form = Forms(page.text).forms.get(name)
    if form is None:
        raise RuntimeError(f"Rendered form {name} not found")
    return form


def submit(browser, path, name, changes=None, upload=None, original=None, origin=PAGE):
    fields = original if original is not None else read_form(browser, path, name)
    changes = changes or {}
    parts = [(key, (None, value)) for key, value in fields if key not in changes]
    for key, value in changes.items():
        if value is None:
            continue
        for item in value if isinstance(value, list) else [value]:
            parts.append((key, (None, str(item))))
    if upload:
        parts.append(("file", upload))
    return browser.post(PAGE + path, headers={"Origin": origin}, files=parts)


def saved(response, message: str, label: str):
    require(response.status_code == 200 and message in response.text, label)


def redirected(response, prefix: str, label: str):
    path = urlsplit(response.headers.get("location", "")).path
    require(response.status_code == 303 and path.startswith(prefix), label)
    return path


def unavailable(response, private_text: str):
    # Next returns 200 for a notFound page after a loading boundary starts streaming.
    return (
        response.status_code in (200, 404)
        and "This page could not be found" in response.text
        and private_text not in response.text
    )


def main():
    status = json.loads(
        subprocess.run(
            ["node", "node_modules/supabase/dist/supabase.js", "status", "-o", "json"],
            cwd=ROOT,
            env={
                **os.environ,
                "SUPABASE_HOME": str(ROOT / ".local/supabase-cli"),
                "SUPABASE_TELEMETRY_DISABLED": "true",
            },
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    )
    api = status["API_URL"]
    require(
        urlsplit(api).hostname in ("localhost", "127.0.0.1"),
        "Phase 2 tests target only local Supabase",
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
            for route in [
                "/dashboard",
                "/settings",
                "/resumes",
                "/jobs",
                "/jobs/new",
                "/applications",
            ]:
                result = owner.get(PAGE + route)
                require(
                    result.status_code == 307
                    and result.headers.get("location") == "/login",
                    f"anonymous {route} protected",
                )
            for browser in [owner, other]:
                email, password = (
                    f"crm-{uuid4()}@example.test",
                    secrets.token_urlsafe(24),
                )
                created = http.post(
                    api + "/auth/v1/admin/users",
                    headers=admin_headers,
                    json={"email": email, "password": password, "email_confirm": True},
                )
                require(
                    created.status_code in (200, 201),
                    "isolated synthetic account created",
                )
                account = {"id": created.json()["id"], "email": email}
                accounts.append(account)
                result = submit(
                    browser, "/login", "form-0", {"email": email, "password": password}
                )
                redirected(
                    result, "/dashboard", "actual sign-in form establishes session"
                )
                token = http.post(
                    api + "/auth/v1/token?grant_type=password",
                    headers={"apikey": anon},
                    json={"email": email, "password": password},
                )
                require(token.status_code == 200, "fixture API session established")
                account["headers"] = {
                    "apikey": anon,
                    "Authorization": f"Bearer {token.json()['access_token']}",
                }

            def rows(table, browser_index=0):
                response = http.get(
                    f"{api}/rest/v1/{table}?select=*",
                    headers=accounts[browser_index]["headers"],
                )
                if response.status_code != 200:
                    raise RuntimeError(
                        f"Fixture query {table} failed with HTTP {response.status_code}"
                    )
                return response.json()

            metrics = http.post(
                api + "/rest/v1/rpc/dashboard_metrics",
                headers=accounts[0]["headers"],
                json={},
            ).json()
            require(
                metrics["jobs"] == 0 and metrics["applications"] == 0,
                "new dashboard has actual zero counts",
            )
            require(
                "Set up your profile" in owner.get(PAGE + "/dashboard").text,
                "empty account has profile guidance",
            )
            result = submit(
                owner,
                "/settings",
                "profile-form",
                {"full_name": "Synthetic CRM Fixture", "city": ""},
            )
            saved(
                result,
                "Enter your real city",
                "missing city is rejected without fabrication",
            )
            require(
                not rows("candidate_profiles"),
                "invalid settings create no partial profile",
            )
            result = submit(
                owner,
                "/settings",
                "profile-form",
                {
                    "full_name": "Synthetic CRM Fixture",
                    "city": "Fixture City",
                    "daily_target": "12",
                    "target_roles": ["backend", "ai_automation", "full_stack"],
                },
            )
            saved(result, "Profile saved", "profile saved through authenticated form")
            profile = rows("candidate_profiles")[0]
            require(
                profile["city"] == "Fixture City"
                and profile["daily_target"] == 12
                and not profile["automation_enabled"],
                "truthful settings and paused automation persist",
            )
            require(
                not rows("candidate_profiles", 1), "other account cannot read profile"
            )

            pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
            for version in ["Fixture v1", "Fixture v2"]:
                result = submit(
                    owner,
                    "/resumes",
                    "resume-upload",
                    {"version_name": version, "skills": "Python, TypeScript"},
                    upload=("synthetic-fixture.pdf", pdf, "application/pdf"),
                )
                saved(
                    result,
                    "Private resume version uploaded",
                    f"{version} uploaded privately",
                )
            resumes = sorted(rows("resumes"), key=lambda row: row["version_name"])
            require(
                len(resumes) == 2
                and resumes[0]["sha256"] != ""
                and resumes[0]["file_size"] == len(pdf),
                "version metadata and content fingerprint saved",
            )
            result = submit(
                owner,
                "/resumes",
                "resume-upload",
                {"version_name": "Fixture v1"},
                upload=("synthetic-fixture.pdf", pdf, "application/pdf"),
            )
            saved(
                result,
                "That version name already exists",
                "duplicate version rejected with upload compensation",
            )
            listing = http.post(
                api + "/storage/v1/object/list/resumes",
                headers=admin_headers,
                json={"prefix": accounts[0]["id"], "limit": 100},
            ).json()
            require(len(listing) == 2, "duplicate upload leaves no orphan file")
            saved(
                submit(
                    owner,
                    "/resumes",
                    "resume-upload",
                    {"version_name": "Invalid fixture"},
                    upload=("fixture.pdf", b"Not a PDF", "application/pdf"),
                ),
                "The resume file is invalid",
                "mismatched file contents rejected",
            )
            maximum = b"x" * (10 * 1024 * 1024)
            saved(
                submit(
                    owner,
                    "/resumes",
                    "resume-upload",
                    {"role_category": "full_stack", "version_name": "Boundary fixture"},
                    upload=("boundary-fixture.txt", maximum, "text/plain"),
                ),
                "Private resume version uploaded",
                "exact 10 MiB file accepted through proxy and Server Action",
            )
            saved(
                submit(
                    owner,
                    "/resumes",
                    "resume-upload",
                    {"version_name": "Oversized fixture"},
                    upload=("oversized-fixture.txt", maximum + b"x", "text/plain"),
                ),
                "Choose a resume file",
                "file larger than 10 MiB rejected before Storage",
            )
            for resume in resumes:
                result = submit(owner, "/resumes", f"master-{resume['id']}")
                saved(
                    result,
                    "Master selection updated",
                    "master switched through authenticated form",
                )
            require(
                len(rows("resumes")) == 3
                and sum(row["is_master"] for row in rows("resumes")) == 1,
                "master switch preserves versions with one current master",
            )
            own_file = owner.get(PAGE + f"/resumes/{resumes[0]['id']}/file")
            require(
                own_file.status_code == 302
                and "no-store" in own_file.headers.get("cache-control", ""),
                "owner gets short-lived private file redirect",
            )
            signed_url = own_file.headers["location"]
            require(
                urlsplit(signed_url).hostname in ("localhost", "127.0.0.1"),
                "signed fixture URL stays local",
            )
            fetched = http.get(signed_url)
            require(
                fetched.status_code == 200 and fetched.content == pdf,
                "signed file returns exact original bytes",
            )
            require(
                other.get(PAGE + f"/resumes/{resumes[0]['id']}/file").status_code
                == 404,
                "other account cannot open private resume",
            )
            require(
                http.get(
                    api
                    + "/storage/v1/object/public/resumes/"
                    + resumes[0]["storage_path"]
                ).status_code
                != 200,
                "resume cannot be read through public bucket URL",
            )
            http.request(
                "DELETE",
                api + "/storage/v1/object/resumes",
                headers=accounts[0]["headers"],
                json={"prefixes": [resumes[0]["storage_path"]]},
            )
            require(
                http.get(signed_url).status_code == 200,
                "registered resume file cannot be deleted by owner Storage API",
            )

            job_changes = {
                "canonical_url": f"https://example.test/fixture-{uuid4()}",
                "company_name": "Synthetic Employer",
                "job_title": "Synthetic Backend Role",
                "description": "Synthetic integration fixture only. Not an actual employer listing.",
            }
            result = submit(owner, "/jobs/new", "job-form", job_changes)
            job_path = redirected(
                result, "/jobs/", "saved job created through actual form"
            )
            job = rows("jobs")[0]
            require(
                job["salary_min_annual"] is None
                and job["salary_min_original"] is None
                and job["remote_scope"] == "unknown",
                "unknown compensation and eligibility remain unknown",
            )
            saved(
                submit(owner, "/jobs/new", "job-form", job_changes),
                "This listing is already saved",
                "duplicate job URL is rejected",
            )
            old_job_form = read_form(owner, job_path, "job-form")
            saved(
                submit(
                    owner,
                    job_path,
                    "job-form",
                    {
                        "job_title": "Updated Synthetic Backend",
                        "salary_min_original": "2000",
                        "salary_currency": "USD",
                        "salary_period": "monthly",
                    },
                ),
                "Listing updated",
                "job edits preserve source compensation units",
            )
            require(
                rows("jobs")[0]["salary_min_annual"] is None
                and rows("jobs")[0]["salary_min_original"] == 2000,
                "monthly salary is not fabricated as normalized annual salary",
            )
            saved(
                submit(
                    owner,
                    job_path,
                    "job-form",
                    {"job_title": "Stale overwrite"},
                    original=old_job_form,
                ),
                "Reload before editing again",
                "stale job edit is rejected",
            )
            require(
                "Updated Synthetic Backend"
                in owner.get(PAGE + "/jobs?q=Synthetic").text,
                "job search renders saved data",
            )
            require(
                "Updated Synthetic Backend"
                not in owner.get(PAGE + "/jobs?q=nomatch").text,
                "job search filters unmatched records",
            )
            require(
                unavailable(other.get(PAGE + job_path), "Updated Synthetic Backend")
                and not rows("jobs", 1),
                "other account cannot read owner job",
            )

            create_form = read_form(owner, job_path, "create-application")
            app_path = redirected(
                submit(owner, job_path, "create-application", original=create_form),
                "/applications/",
                "application draft created",
            )
            redirected(
                submit(owner, job_path, "create-application", original=create_form),
                app_path,
                "draft creation is idempotent",
            )
            require(
                len(rows("applications")) == 1
                and rows("application_events")[0]["event_type"] == "record_created",
                "draft and audit event committed together",
            )
            saved(
                submit(owner, app_path, "application-form", {"status": "submitted"}),
                "Confirm the real submission",
                "unsupported submission claim rejected",
            )
            saved(
                submit(owner, app_path, "application-form", {"status": "prepared"}),
                "Choose a resume version",
                "prepared status requires a selected version",
            )
            saved(
                submit(
                    owner,
                    app_path,
                    "application-form",
                    {
                        "status": "prepared",
                        "resume_id": resumes[0]["id"],
                        "notes": "Synthetic prepared package",
                    },
                ),
                "Application record saved",
                "prepared record linked to a preserved resume version",
            )
            stale_app_form = read_form(owner, app_path, "application-form")
            saved(
                submit(owner, app_path, "application-form", {"status": "needs_review"}),
                "Application record saved",
                "status tracking saved with audit",
            )
            saved(
                submit(
                    owner,
                    app_path,
                    "application-form",
                    {"notes": "Stale overwrite"},
                    original=stale_app_form,
                ),
                "Reload before editing again",
                "stale application edit is rejected",
            )
            local_now = datetime.now(ZoneInfo("Asia/Karachi"))
            saved(
                submit(
                    owner,
                    app_path,
                    "application-form",
                    {
                        "status": "submitted",
                        "applied_at": (local_now + timedelta(days=1)).strftime(
                            "%Y-%m-%dT%H:%M"
                        ),
                        "confirmation_note": "Synthetic reference",
                        "manual_confirm": "yes",
                    },
                ),
                "cannot be recorded in the future",
                "future submission date rejected",
            )
            saved(
                submit(
                    owner,
                    app_path,
                    "application-form",
                    {
                        "status": "submitted",
                        "applied_at": local_now.strftime("%Y-%m-%dT%H:%M"),
                        "confirmation_note": "Synthetic fixture receipt only",
                        "manual_confirm": "yes",
                        "follow_up_at": (local_now - timedelta(minutes=2)).strftime(
                            "%Y-%m-%dT%H:%M"
                        ),
                    },
                ),
                "Application record saved",
                "explicit candidate-reported fixture recorded without a real submission",
            )
            app = rows("applications")[0]
            require(
                app["confirmation_evidence"]["kind"] == "candidate_reported"
                and app["submission_method"] == "human_assisted",
                "manual report never becomes provider-verified evidence",
            )
            dashboard = owner.get(PAGE + "/dashboard")
            require(
                'data-metric="Manual submissions today"' in dashboard.text
                and "provider-verified" in owner.get(PAGE + app_path).text,
                "dashboard and tracker clearly label manual reports",
            )
            metrics = http.post(
                api + "/rest/v1/rpc/dashboard_metrics",
                headers=accounts[0]["headers"],
                json={},
            ).json()
            require(
                metrics["manual_today"] == 1
                and metrics["applications"] == 1
                and metrics["follow_ups_due"] == 1,
                "real dashboard counts match the saved fixture records",
            )
            saved(
                submit(
                    owner,
                    app_path,
                    "application-form",
                    {"status": "interview", "notes": "Synthetic interview follow-up"},
                ),
                "Application record saved",
                "interview and response tracking saved",
            )
            metrics = http.post(
                api + "/rest/v1/rpc/dashboard_metrics",
                headers=accounts[0]["headers"],
                json={},
            ).json()
            require(
                metrics["interviews"] == 1 and metrics["responses"] == 1,
                "interview and response counts reflect actual status",
            )
            require(
                "Needs review" in owner.get(PAGE + app_path).text
                and len(rows("application_events")) >= 5,
                "activity history shows saved transitions",
            )
            require(
                unavailable(other.get(PAGE + app_path), "Updated Synthetic Backend")
                and not rows("applications", 1)
                and not rows("application_events", 1),
                "application and event history remain isolated",
            )
            malicious = http.patch(
                api + "/rest/v1/applications?id=eq." + app["id"],
                headers={**accounts[1]["headers"], "Prefer": "return=representation"},
                json={"notes": "Foreign edit"},
            )
            require(
                malicious.status_code == 200
                and malicious.json() == []
                and rows("applications")[0]["notes"] == "Synthetic interview follow-up",
                "cross-owner update affects no records",
            )
            saved(
                submit(owner, job_path, "delete-job", {"confirm_delete": "yes"}),
                "This listing has application history",
                "job deletion cannot silently erase application history",
            )
            result = submit(
                owner,
                app_path,
                "application-form",
                {"notes": "CSRF edit"},
                origin="https://untrusted.example.test",
            )
            require(
                result.status_code >= 400
                and rows("applications")[0]["notes"] != "CSRF edit",
                "untrusted-origin Server Action rejected",
            )
            saved(
                submit(owner, app_path, "delete-application", {"confirm_delete": None}),
                "Confirm which application",
                "record deletion requires explicit checkbox confirmation",
            )
            redirected(
                submit(
                    owner, app_path, "delete-application", {"confirm_delete": "yes"}
                ),
                "/applications",
                "confirmed application deletion succeeds",
            )
            require(
                not rows("applications")
                and not rows("application_events")
                and len(rows("resumes")) == 3,
                "explicit deletion removes CRM history and retains resume versions",
            )
            redirected(
                submit(owner, job_path, "delete-job", {"confirm_delete": "yes"}),
                "/jobs",
                "job CRUD deletion succeeds once no history remains",
            )
            require(not rows("jobs"), "deleted job disappears from account data")
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
                        removed = http.request(
                            "DELETE",
                            api + "/storage/v1/object/resumes",
                            headers=admin_headers,
                            json={"prefixes": paths},
                        )
                        require(
                            removed.status_code == 200,
                            "synthetic private fixture files removed",
                        )
                deleted = http.delete(
                    api + "/auth/v1/admin/users/" + account["id"], headers=admin_headers
                )
                require(
                    deleted.status_code in (200, 204),
                    "isolated account, CRM data, events and budget removed",
                )


if __name__ == "__main__":
    main()
