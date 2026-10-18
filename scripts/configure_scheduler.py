"""Provision an EXECUTE-only local worker login, without printing credentials."""

import os
import secrets
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "worker"))
from app.common.config import Settings


def main() -> int:
    destination = ROOT / "worker/.env.scheduler"
    if destination.exists():
        print(
            "Existing private worker configuration preserved; no credentials changed."
        )
        return 0
    created_file = False
    try:
        config = Settings(_env_file=ROOT / "worker/.env")
        if not config.database_url:
            raise ValueError("Missing local database")
        original = config.database_url.get_secret_value()
        parts = urlsplit(original)
        if parts.hostname not in ("127.0.0.1", "localhost", "::1"):
            raise ValueError("Local helper only")
        username = "remote_jobs_scheduler_runner"
        password = secrets.token_urlsafe(40)
        host = f"[{parts.hostname}]" if ":" in parts.hostname else parts.hostname
        url = urlunsplit(
            (
                parts.scheme,
                f"{username}:{quote(password, safe='')}@{host}:{parts.port or 5432}",
                parts.path,
                parts.query,
                "",
            )
        )
        with psycopg.connect(original, connect_timeout=5) as connection:
            if connection.execute(
                "select 1 from pg_roles where rolname=%s", (username,)
            ).fetchone():
                raise ValueError(
                    "Existing role requires deliberate recovery, not password rotation"
                )
            connection.execute(
                sql.SQL(
                    "create role {} login nosuperuser nocreatedb "
                    "nocreaterole nobypassrls password {}"
                ).format(sql.Identifier(username), sql.Literal(password))
            )
            connection.execute(
                sql.SQL("grant remote_jobs_scheduler to {}").format(
                    sql.Identifier(username)
                )
            )
            descriptor = os.open(
                destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
            )
            created_file = True
            with os.fdopen(descriptor, "w") as output:
                output.write(
                    f"SCHEDULER_DATABASE_URL={url}\nSCHEDULER_ENABLED=false\n"
                    "SCHEDULER_CONCURRENCY=2\nSCHEDULER_POLL_SECONDS=30\n"
                )
        print(
            "Created private local worker configuration with restricted RPC permissions."
        )
        return 0
    except (psycopg.Error, ValueError, OSError):
        if created_file:
            destination.unlink(missing_ok=True)
        print(
            "Worker setup failed. Check local migrations and configuration privately."
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
