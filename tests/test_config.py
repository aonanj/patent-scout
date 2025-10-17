from __future__ import annotations

import importlib

import pytest

import app.config as config_module


def test_get_settings_returns_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost/db")
    monkeypatch.setenv("APP_DEBUG", "1")
    cfg = importlib.reload(config_module)
    settings = cfg.get_settings()
    assert settings.database_url.endswith("/db")
    assert settings.app_debug is True


def test_get_settings_requires_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "")
    cfg = importlib.reload(config_module)
    with pytest.raises(RuntimeError):
        cfg.get_settings()
