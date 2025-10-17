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
    sqlalchemy_database_uri: str = os.environ.get("SQLALCHEMY_DATABASE_URI", "")
    app_debug: bool = os.environ.get("APP_DEBUG", "0") in {"1", "true", "True"}

def get_settings() -> Settings:
    s = Settings()
    if not s.database_url:
        raise RuntimeError("DATABASE_URL is required")
    if not s.sqlalchemy_database_uri:
        raise RuntimeError("SQLALCHEMY_DATABASE_URI is required")
    return s