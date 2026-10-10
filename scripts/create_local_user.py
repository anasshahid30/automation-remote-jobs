"""Create your local Auth account using secure prompts. Refuses hosted destinations."""

import getpass
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

import httpx

root = Path(__file__).resolve().parents[1]
result = subprocess.run(
    ["node", "node_modules/supabase/dist/supabase.js", "status", "-o", "json"],
    cwd=root,
    capture_output=True,
    text=True,
    check=True,
    env={
        **os.environ,
        "SUPABASE_HOME": str(root / ".local/supabase-cli"),
        "SUPABASE_TELEMETRY_DISABLED": "true",
        "SUPABASE_USE_SLIM_IMAGES": "true",
    },
)
status = json.loads(result.stdout)
api = status["API_URL"]
if urlsplit(api).hostname not in ("localhost", "127.0.0.1"):
    raise SystemExit("This helper only supports a local Supabase instance.")
email = input("Your email: ").strip()
password = getpass.getpass("Choose a local password (12+ characters): ")
if len(password) < 12:
    raise SystemExit("Password must contain at least 12 characters.")
admin = status.get("SERVICE_ROLE_KEY") or status["SECRET_KEY"]
with httpx.Client(timeout=10) as http:
    response = http.post(
        f"{api}/auth/v1/admin/users",
        headers={
            "apikey": admin,
            "Authorization": f"Bearer {admin}",
        },
        json={"email": email, "password": password, "email_confirm": True},
    )
if response.status_code not in (200, 201):
    raise SystemExit(
        f"Account was not created (HTTP {response.status_code}). Check local Auth privately."
    )
print(
    "Local account created. Sign in through the dashboard with the credentials you chose."
)
