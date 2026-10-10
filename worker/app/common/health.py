from typing import Literal

import psycopg
from pydantic import BaseModel

from app.common.config import Settings


class HealthReport(BaseModel):
    status: Literal["ok", "not_configured", "unavailable"]
    component: Literal["worker", "database"]
    phase: int = 1
    automation: Literal["disabled"] = "disabled"
    message: str | None = None


def worker_health() -> HealthReport:
    # The Phase 1 executable has no automation path, even if a flag is set.
    return HealthReport(status="ok", component="worker")


def database_health(settings: Settings) -> HealthReport:
    if not settings.database_url:
        return HealthReport(status="not_configured", component="database")
    try:
        with psycopg.connect(
            settings.database_url.get_secret_value(),
            connect_timeout=5,
            options="-c statement_timeout=5000 -c default_transaction_read_only=on",
        ) as connection:
            result = connection.execute("select public.database_health()").fetchone()
        if result != ("ok",):
            return HealthReport(status="unavailable", component="database")
        return HealthReport(status="ok", component="database")
    except psycopg.Error:
        # Do not print driver errors; they can contain connection credentials or PII.
        return HealthReport(
            status="unavailable",
            component="database",
            message="Check connectivity, TLS, credentials, and migration status privately.",
        )
