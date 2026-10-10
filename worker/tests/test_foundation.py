from unittest.mock import MagicMock, patch

import psycopg
import pytest
from pydantic import ValidationError

from app.common.config import Settings
from app.common.health import database_health, worker_health


def settings(**kwargs):
    return Settings(_env_file=None, **kwargs)


def test_defaults_are_paused_and_timezone_aware():
    config = settings()
    assert config.automation_enabled is False
    assert config.daily_target == 30
    assert config.timezone == "Asia/Karachi"
    assert worker_health().automation == "disabled"


@pytest.mark.parametrize("target", [0, 31, -1])
def test_quota_is_bounded(target):
    with pytest.raises(ValidationError):
        settings(daily_target=target)


def test_unknown_timezone_is_rejected():
    with pytest.raises(ValidationError):
        settings(timezone="invented/location")


@pytest.mark.parametrize(
    "url",
    [
        "https://db.example.test",
        "postgresql://user:secret@db.example.test/db",
        "postgresql://user:secret@db.example.test/db?sslmode=require",
    ],
)
def test_remote_database_requires_verified_tls(url):
    with pytest.raises(ValidationError) as error:
        settings(database_url=url)
    assert "user:secret" not in str(error.value)


def test_credentials_are_redacted_from_representation():
    config = settings(database_url="postgresql://user:private@localhost/db")
    assert "private" not in repr(config)


def test_hosted_database_accepts_verified_tls():
    config = settings(
        database_url=(
            "postgresql://user:private@db.example.test/db?sslmode=verify-full&sslrootcert=system"
        )
    )
    assert config.database_url is not None


def test_missing_database_is_not_reported_connected():
    assert database_health(settings()).status == "not_configured"


def test_unavailable_database_never_logs_driver_credentials(capsys):
    with patch("app.common.health.psycopg.connect", side_effect=psycopg.OperationalError("secret")):
        report = database_health(settings(database_url="postgresql://user:private@localhost/db"))
    assert report.status == "unavailable"
    assert "secret" not in report.model_dump_json()
    assert capsys.readouterr().out == ""


def test_probe_checks_schema_and_uses_read_only_timeout():
    connection = MagicMock()
    connection.execute.return_value.fetchone.return_value = ("ok",)
    with patch("app.common.health.psycopg.connect") as connect:
        connect.return_value.__enter__.return_value = connection
        result = database_health(settings(database_url="postgresql://user:private@localhost/db"))
    assert result.status == "ok"
    assert connect.call_args.kwargs["connect_timeout"] == 5
    assert "default_transaction_read_only=on" in connect.call_args.kwargs["options"]
    connection.execute.assert_called_once_with("select public.database_health()")


def test_incomplete_schema_fails_health():
    with patch("app.common.health.psycopg.connect") as connect:
        connect.return_value.__enter__.return_value.execute.return_value.fetchone.return_value = (
            "incomplete",
        )
        result = database_health(settings(database_url="postgresql://user:private@localhost/db"))
    assert result.status == "unavailable"
