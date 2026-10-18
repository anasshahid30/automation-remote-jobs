"""Bounded local task processor. It has no employer, email or submission API client."""

import json
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from uuid import UUID, uuid4

import psycopg

from app.common.config import Settings


def failure_code(error: Exception) -> str:
    code = getattr(error, "sqlstate", None)
    if code and (code.startswith("28") or code.startswith("42")):
        return "permanent_database"
    if isinstance(error, psycopg.OperationalError) or code in (
        "40001",
        "40P01",
        "55P03",
        "57014",
        "53300",
        "57P01",
    ):
        return "temporary_database"
    return "permanent_database"


class Scheduler:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.worker_id = uuid4()

    def connect(self):
        if not self.settings.scheduler_database_url:
            raise ValueError("Scheduler database is not configured")
        return psycopg.connect(
            self.settings.scheduler_database_url.get_secret_value(),
            connect_timeout=5,
            application_name="remote-job-scheduler",
            options="-c statement_timeout=10000 -c lock_timeout=3000",
        )

    def check_identity(self) -> None:
        # Never reuse an owner/admin connection or the read-only diagnostic binding.
        with self.connect() as connection:
            row = connection.execute("""
                select not rolsuper and not rolbypassrls and not rolcreaterole
                  and not rolcreatedb
                  and pg_has_role(current_user,'remote_jobs_scheduler','MEMBER')
                  and not has_table_privilege(current_user,'public.applications',
                    'SELECT,INSERT,UPDATE,DELETE')
                  and not has_table_privilege(current_user,'public.resume_facts','SELECT')
                from pg_roles where rolname=current_user
            """).fetchone()
        if row != (True,):
            raise ValueError("Use the restricted scheduler database identity")

    def heartbeat(self, status: str) -> None:
        with self.connect() as connection:
            connection.execute("select public.scheduler_heartbeat(%s,%s)", (self.worker_id, status))

    def process_one(self) -> str:
        with self.connect() as connection:
            row = connection.execute("select public.claim_scheduled_task()").fetchone()
        claim = row[0] if row else None
        if not claim:
            return "idle"
        task_id, lease = UUID(claim["id"]), UUID(claim["lease"])
        try:
            with self.connect() as connection:
                result = connection.execute(
                    "select public.process_scheduled_task(%s,%s)", (task_id, lease)
                ).fetchone()
            return result[0] if result else "obsolete"
        except psycopg.Error as error:
            # If completion committed but its response was lost, this RPC is a no-op.
            # Expired leases recover only idempotent local tasks, never submission runs.
            with self.connect() as connection:
                connection.execute(
                    "select public.fail_scheduled_task(%s,%s,%s)",
                    (task_id, lease, failure_code(error)),
                )
            return "task_error"

    def run_cycle(self) -> dict:
        self.heartbeat("running")
        with ThreadPoolExecutor(max_workers=self.settings.scheduler_concurrency) as pool:
            results = list(
                pool.map(lambda _: self.process_one(), range(self.settings.scheduler_concurrency))
            )
        return {
            "status": "ok",
            "component": "scheduler",
            "worker_id": str(self.worker_id),
            "phase": 6,
            "tasks": {state: results.count(state) for state in sorted(set(results))},
            "external_submissions": "disabled",
        }


def run_scheduler(settings: Settings, *, once: bool, stop: Event) -> int:
    if not settings.scheduler_enabled:
        print(json.dumps({"status": "disabled", "component": "scheduler"}))
        return 1
    if not settings.scheduler_database_url:
        print(json.dumps({"status": "not_configured", "component": "scheduler"}))
        return 1
    scheduler = Scheduler(settings)
    try:
        scheduler.check_identity()
    except (psycopg.Error, ValueError):
        print(
            json.dumps(
                {
                    "status": "unavailable",
                    "component": "scheduler",
                    "message": "Check the restricted worker binding privately.",
                }
            )
        )
        return 1
    exit_code = 0
    try:
        while not stop.is_set():
            try:
                report = scheduler.run_cycle()
            except (psycopg.Error, ValueError):
                report = {"status": "unavailable", "component": "scheduler"}
                exit_code = 1
                try:
                    scheduler.heartbeat("degraded")
                except psycopg.Error:
                    pass  # A stale heartbeat is visible when the database is unreachable.
            print(json.dumps(report), flush=True)
            if once:
                break
            stop.wait(settings.scheduler_poll_seconds)
    finally:
        try:
            scheduler.heartbeat("stopped")
        except psycopg.Error:
            pass
    return exit_code
