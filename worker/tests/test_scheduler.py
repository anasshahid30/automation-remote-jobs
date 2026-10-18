import json
from threading import Barrier, Event, Lock
from unittest.mock import MagicMock, patch

import psycopg
import pytest
from pydantic import ValidationError

from app.common.config import Settings
from app.scheduler import Scheduler, failure_code, run_scheduler


def config(**kwargs):
    return Settings(_env_file=None, **kwargs)


@pytest.mark.parametrize(
    "field,value",
    [
        ("scheduler_concurrency", 0),
        ("scheduler_concurrency", 4),
        ("scheduler_poll_seconds", 29),
        ("scheduler_poll_seconds", 61),
    ],
)
def test_worker_limits_are_bounded(field, value):
    with pytest.raises(ValidationError):
        config(**{field: value})


def test_scheduler_defaults_are_disabled_and_do_not_reuse_diagnostic_binding(capsys):
    settings = config(database_url="postgresql://diagnostic:secret@localhost/db")
    assert settings.scheduler_database_url is None
    assert run_scheduler(settings, once=True, stop=Event()) == 1
    assert json.loads(capsys.readouterr().out)["status"] == "disabled"


def test_enabled_worker_requires_separate_binding(capsys):
    assert run_scheduler(config(scheduler_enabled=True), once=True, stop=Event()) == 1
    assert json.loads(capsys.readouterr().out)["status"] == "not_configured"


def test_scheduler_remote_connection_requires_verified_tls():
    with pytest.raises(ValidationError):
        config(scheduler_database_url="postgresql://worker:secret@db.example.test/db")


def test_privileged_identity_never_reaches_claims(capsys):
    settings = config(
        scheduler_enabled=True, scheduler_database_url="postgresql://admin:secret@localhost/db"
    )
    with (
        patch.object(Scheduler, "connect") as connect,
        patch.object(Scheduler, "run_cycle") as cycle,
    ):
        connect.return_value.__enter__.return_value.execute.return_value.fetchone.return_value = (
            False,
        )
        assert run_scheduler(settings, once=True, stop=Event()) == 1
        cycle.assert_not_called()
    assert "secret" not in capsys.readouterr().out


@pytest.mark.parametrize(
    "error,expected",
    [
        (psycopg.OperationalError("credential-shaped private error"), "temporary_database"),
        (psycopg.errors.SerializationFailure(), "temporary_database"),
        (psycopg.errors.DeadlockDetected(), "temporary_database"),
        (psycopg.errors.QueryCanceled(), "temporary_database"),
        (psycopg.errors.InvalidPassword(), "permanent_database"),
        (psycopg.errors.InsufficientPrivilege(), "permanent_database"),
        (psycopg.errors.UndefinedTable(), "permanent_database"),
    ],
)
def test_only_transient_failures_retry(error, expected):
    assert failure_code(error) == expected


def test_process_threads_are_bounded_and_all_are_awaited():
    scheduler = Scheduler(config(scheduler_concurrency=3))
    barrier, lock = Barrier(3), Lock()
    active = 0
    peak = 0

    def process():
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        barrier.wait(timeout=3)
        with lock:
            active -= 1
        return "ready"

    with patch.object(scheduler, "heartbeat"), patch.object(scheduler, "process_one", process):
        result = scheduler.run_cycle()
    assert peak == 3 and active == 0
    assert result["tasks"] == {"ready": 3}
    assert result["external_submissions"] == "disabled"


def test_lost_processing_response_uses_same_lease_and_redacted_failure_code():
    scheduler = Scheduler(config())
    claim = {
        "id": "10000000-0000-0000-0000-000000000001",
        "lease": "20000000-0000-0000-0000-000000000001",
    }
    connection = MagicMock()
    connection.execute.side_effect = [
        MagicMock(fetchone=lambda: (claim,)),
        psycopg.OperationalError("secret contents"),
        MagicMock(),
    ]
    with patch.object(scheduler, "connect") as connect:
        connect.return_value.__enter__.return_value = connection
        assert scheduler.process_one() == "task_error"
    call = connection.execute.call_args_list[-1]
    assert str(call.args[1][0]) == claim["id"]
    assert str(call.args[1][1]) == claim["lease"]
    assert call.args[1][2] == "temporary_database"
    assert "secret contents" not in str(call)


def test_unavailable_worker_logs_no_raw_credentials_and_exits(capsys):
    settings = config(
        scheduler_enabled=True, scheduler_database_url="postgresql://worker:private@localhost/db"
    )
    with (
        patch.object(Scheduler, "check_identity"),
        patch.object(Scheduler, "heartbeat") as pulse,
        patch.object(Scheduler, "run_cycle", side_effect=psycopg.OperationalError("private")),
    ):
        assert run_scheduler(settings, once=True, stop=Event()) == 1
        assert pulse.call_args_list[-1].args == ("stopped",)
    output = capsys.readouterr().out
    assert "private" not in output
    assert json.loads(output)["status"] == "unavailable"


def test_stop_signal_prevents_another_batch():
    stop = Event()
    settings = config(
        scheduler_enabled=True, scheduler_database_url="postgresql://worker:private@localhost/db"
    )

    def batch():
        stop.set()
        return {"status": "ok"}

    with (
        patch.object(Scheduler, "check_identity"),
        patch.object(Scheduler, "heartbeat") as pulse,
        patch.object(Scheduler, "run_cycle", side_effect=batch) as cycle,
    ):
        assert run_scheduler(settings, once=False, stop=stop) == 0
        assert cycle.call_count == 1
        assert pulse.call_args_list[-1].args == ("stopped",)
