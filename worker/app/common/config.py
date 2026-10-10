from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    database_url: SecretStr | None = None
    automation_enabled: bool = False
    daily_target: int = Field(default=30, ge=1, le=30)
    timezone: str = "Asia/Karachi"

    @field_validator("database_url", mode="before")
    @classmethod
    def validate_database_url(cls, value: str | SecretStr | None) -> str | SecretStr | None:
        if not value:
            return None
        raw = value.get_secret_value() if isinstance(value, SecretStr) else value
        parts = urlsplit(raw)
        if parts.scheme not in ("postgres", "postgresql") or not parts.hostname:
            raise ValueError("DATABASE_URL must be a PostgreSQL connection URL")
        if parts.hostname not in ("localhost", "127.0.0.1", "::1"):
            query = parse_qs(parts.query)
            if query.get("sslmode") != ["verify-full"]:
                raise ValueError("Hosted PostgreSQL requires sslmode=verify-full")
            if query.get("sslrootcert") != ["system"]:
                raise ValueError("Hosted PostgreSQL requires sslrootcert=system")
        return value

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("Use a valid IANA timezone") from exc
        return value
