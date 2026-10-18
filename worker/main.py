"""Read-only diagnostics and the opt-in Phase 6 local scheduler. Run from worker/."""

import argparse
import signal
from threading import Event

from pydantic import ValidationError

from app.common.config import Settings
from app.common.health import database_health, worker_health
from app.scheduler import run_scheduler


def main() -> int:
    parser = argparse.ArgumentParser(description="Remote Job Agent worker")
    probes = parser.add_mutually_exclusive_group(required=True)
    probes.add_argument("--health", action="store_true", help="Check the worker runtime")
    probes.add_argument(
        "--check-database", action="store_true", help="Read-only schema health probe"
    )
    probes.add_argument("--run-once", action="store_true", help="Process one bounded task batch")
    probes.add_argument("--scheduler", action="store_true", help="Run the local task scheduler")
    args = parser.parse_args()
    try:
        settings = Settings()
    except ValidationError:
        print(
            '{"status":"invalid_configuration","message":"Check worker configuration privately."}'
        )
        return 2
    if args.run_once or args.scheduler:
        stop = Event()
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, lambda *_: stop.set())
        return run_scheduler(settings, once=args.run_once, stop=stop)
    report = database_health(settings) if args.check_database else worker_health()
    print(report.model_dump_json(exclude_none=True))
    return 0 if report.status == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
