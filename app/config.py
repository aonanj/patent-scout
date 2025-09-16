import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    """Runtime configuration parsed from environment variables.

    Attributes:
    database_url: Postgres connection string. Example:
    postgresql+psycopg://user:pass@host:5432/dbname
    app_debug: Enables extra logging when true.
    """

    database_url: str = os.environ.get("DATABASE_URL", "")
    app_debug: bool = os.environ.get("APP_DEBUG", "0") in {"1", "true", "True"}

def get_settings() -> Settings:
    s = Settings()
    if not s.database_url:
        raise RuntimeError("DATABASE_URL is required")
    return s