"""Diagnostic CLI only. Run from worker/; no scheduler or HTTP service is needed yet."""

import argparse

from pydantic import ValidationError

from app.common.config import Settings
from app.common.health import database_health, worker_health


def main() -> int:
    parser = argparse.ArgumentParser(description="Remote Job Agent Phase 1 worker")
    probes = parser.add_mutually_exclusive_group(required=True)
    probes.add_argument("--health", action="store_true", help="Check the worker runtime")
    probes.add_argument(
        "--check-database", action="store_true", help="Read-only schema health probe"
    )
    args = parser.parse_args()
    try:
        settings = Settings()
    except ValidationError:
        print(
            '{"status":"invalid_configuration","message":"Check worker configuration privately."}'
        )
        return 2
    report = database_health(settings) if args.check_database else worker_health()
    print(report.model_dump_json(exclude_none=True))
    return 0 if report.status == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
