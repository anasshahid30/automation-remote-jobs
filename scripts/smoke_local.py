"""Explicit local-only integration checks. Creates and deletes one isolated Auth test user.

Run with worker/.venv/bin/python scripts/smoke_local.py while local Supabase and Next.js run.
No real job source is contacted and no application is submitted.
"""

import json
import os
import re
import secrets
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
PAGE = "http://127.0.0.1:3000"


def require(condition: bool, label: str) -> None:
    if not condition:
        raise RuntimeError(f"FAIL: {label}")
    print(f"PASS: {label}")


def main() -> None:
    result = subprocess.run(
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
    )
    status = json.loads(result.stdout)
    api = status["API_URL"]
    require(
        urlsplit(api).hostname in ("localhost", "127.0.0.1"),
        "tests target local Supabase",
    )
    anon = status.get("PUBLISHABLE_KEY") or status["ANON_KEY"]
    admin = status.get("SECRET_KEY") or status["SERVICE_ROLE_KEY"]
    user_id = None
    with httpx.Client(timeout=15) as http, httpx.Client(timeout=30) as browser:
        admin_headers = {"apikey": admin, "Authorization": f"Bearer {admin}"}
        try:
            require(
                http.get(f"{PAGE}/api/health").json()["status"] == "ok",
                "dashboard liveness",
            )
            response = browser.get(f"{PAGE}/dashboard")
            require(
                response.status_code == 307
                and response.headers.get("location") == "/login",
                "anonymous dashboard redirects to sign-in",
            )
            require(
                browser.get(f"{PAGE}/api/health/database").status_code == 401,
                "anonymous database health is denied",
            )
            require(
                http.get(
                    f"{api}/rest/v1/candidate_profiles?select=id",
                    headers={"apikey": anon},
                ).status_code
                in (401, 403),
                "anonymous API cannot read candidate records",
            )

            email, password = (
                f"phase1-{uuid4()}@example.test",
                secrets.token_urlsafe(24),
            )
            created = http.post(
                f"{api}/auth/v1/admin/users",
                headers=admin_headers,
                json={"email": email, "password": password, "email_confirm": True},
            )
            require(created.status_code in (200, 201), "local test account created")
            user_id = created.json()["id"]
            registration = http.post(
                f"{api}/auth/v1/signup",
                headers={"apikey": anon},
                json={"email": email, "password": password},
            )
            require(
                registration.status_code == 422
                and registration.json().get("error_code") == "signup_disabled",
                "public account registration remains disabled",
            )
            direct_login = http.post(
                f"{api}/auth/v1/token?grant_type=password",
                headers={"apikey": anon},
                json={"email": email, "password": password},
            )
            require(
                direct_login.status_code == 200,
                f"test account authenticates to Supabase API (HTTP {direct_login.status_code}, "
                f"code {direct_login.json().get('error_code')})",
            )

            # Submit the actual rendered Next.js server action; use real Auth cookies.
            page = browser.get(f"{PAGE}/login")
            action = re.search(r'name="(\$ACTION_ID_[^\"]+)"', page.text)
            require(action is not None, "accessible sign-in form exposes server action")
            assert action is not None
            signed_in = browser.post(
                f"{PAGE}/login",
                headers={"Origin": PAGE},
                files={
                    action.group(1): (None, ""),
                    "email": (None, email),
                    "password": (None, password),
                },
            )
            require(
                signed_in.status_code == 303
                and urlsplit(signed_in.headers.get("location", "")).path
                == "/dashboard",
                f"sign-in succeeds through dashboard (HTTP {signed_in.status_code}, "
                f"path {urlsplit(signed_in.headers.get('location', '')).path}, "
                f"error {parse_qs(urlsplit(signed_in.headers.get('location', '')).query).get('error')})",
            )
            require(
                "HttpOnly" in ";".join(signed_in.headers.get_list("set-cookie")),
                "session cookies are HttpOnly",
            )
            dashboard = browser.get(f"{PAGE}/dashboard")
            require(
                dashboard.status_code == 200 and "Your workspace" in dashboard.text,
                "authenticated dashboard renders",
            )
            probe = browser.get(f"{PAGE}/api/health/database")
            require(
                probe.status_code == 200 and probe.json()["status"] == "ok",
                "authenticated Supabase database probe passes",
            )

            session = http.post(
                f"{api}/auth/v1/token?grant_type=password",
                headers={"apikey": anon},
                json={"email": email, "password": password},
            )
            require(
                session.status_code == 200,
                "test account can authenticate to Supabase API",
            )
            headers = {
                "apikey": anon,
                "Authorization": f"Bearer {session.json()['access_token']}",
            }
            profile = http.post(
                f"{api}/rest/v1/candidate_profiles",
                headers=headers,
                json={"full_name": "Phase 1 Test Fixture", "email": email},
            )
            require(
                profile.status_code == 201, "authenticated profile insert obeys RLS"
            )
            own = http.get(
                f"{api}/rest/v1/candidate_profiles?select=user_id,automation_enabled",
                headers=headers,
            )
            require(
                own.status_code == 200
                and own.json() == [{"user_id": user_id, "automation_enabled": False}],
                "owner reads only own paused profile",
            )
            require(
                admin not in dashboard.text and anon not in dashboard.text,
                "keys absent from rendered dashboard",
            )

            static = ROOT / "dashboard/.next/static"
            require(static.exists(), "build output exists for client-secret scan")
            require(
                all(
                    admin.encode() not in p.read_bytes()
                    and anon.encode() not in p.read_bytes()
                    for p in static.rglob("*.js")
                ),
                "Supabase keys absent from client JavaScript",
            )
        finally:
            if user_id:
                deleted = http.delete(
                    f"{api}/auth/v1/admin/users/{user_id}", headers=admin_headers
                )
                require(
                    deleted.status_code in (200, 204),
                    "isolated test account and profile removed",
                )


if __name__ == "__main__":
    main()
