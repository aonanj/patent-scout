from __future__ import annotations

import pytest

import asyncio

import alerts_runner


@pytest.fixture(autouse=True)
def reset_mailgun_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MAILGUN_DOMAIN", "")
    monkeypatch.setenv("MAILGUN_API_KEY", "")
    monkeypatch.setenv("MAILGUN_FROM_NAME", "SynapseIP Alerts")
    monkeypatch.setenv("MAILGUN_FROM_EMAIL", "alerts@example.com")
    monkeypatch.setenv("MAILGUN_BASE_URL", "https://api.mailgun.net/v3")
    alerts_runner.MAILGUN_DOMAIN = ""
    alerts_runner.MAILGUN_API_KEY = ""
    alerts_runner.MAILGUN_FROM_NAME = "SynapseIP Alerts"
    alerts_runner.MAILGUN_FROM_EMAIL = "alerts@example.com"
    alerts_runner.MAILGUN_BASE_URL = "https://api.mailgun.net/v3"


def test_extract_filters_normalizes_payload() -> None:
    payload = {
        "keywords": "ai search",
        "assignee": "OpenAI",
        "cpc": ["G06N", "G06F"],
        "date_from": "2024-01-01",
        "date_to": "2024-02-01",
    }
    result = alerts_runner._extract_filters(payload)
    assert result == (
        "ai search",
        "OpenAI",
        '["G06N", "G06F"]',
        "2024-01-01",
        "2024-02-01",
    )


def test_extract_filters_handles_invalid_payload() -> None:
    result = alerts_runner._extract_filters(None)
    assert result == (None, None, None, None, None)


def test_from_header_formats_sender(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MAILGUN_FROM_NAME", "Scout")
    monkeypatch.setenv("MAILGUN_FROM_EMAIL", "alerts@phaethon.llc")
    alerts_runner.MAILGUN_FROM_NAME = "Scout"
    alerts_runner.MAILGUN_FROM_EMAIL = "alerts@phaethon.llc"
    assert alerts_runner._from_header() == "Scout <alerts@phaethon.llc>"


def test_send_mailgun_email_prints_when_unconfigured(capsys: pytest.CaptureFixture[str]) -> None:
    asyncio.run(alerts_runner.send_mailgun_email("user@example.com", "Subject", "Body"))
    captured = capsys.readouterr().out
    assert "Mailgun not configured" in captured


def test_send_mailgun_email_invokes_httpx(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, str]] = []

    class DummyResponse:
        status_code = 200
        text = ""

    class DummyAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, auth, data):
            calls.append({"url": url, "subject": data["subject"]})
            return DummyResponse()

    monkeypatch.setenv("MAILGUN_DOMAIN", "mg.example.com")
    monkeypatch.setenv("MAILGUN_API_KEY", "key-123")
    monkeypatch.setenv("MAILGUN_FROM_NAME", "Scout")
    monkeypatch.setenv("MAILGUN_FROM_EMAIL", "alerts@example.com")
    monkeypatch.setenv("MAILGUN_BASE_URL", "https://api.mailgun.net/v3")
    monkeypatch.setattr("alerts_runner.httpx.AsyncClient", DummyAsyncClient)

    alerts_runner.MAILGUN_DOMAIN = "mg.example.com"
    alerts_runner.MAILGUN_API_KEY = "key-123"
    alerts_runner.MAILGUN_FROM_NAME = "Scout"
    alerts_runner.MAILGUN_FROM_EMAIL = "alerts@example.com"
    alerts_runner.MAILGUN_BASE_URL = "https://api.mailgun.net/v3"

    asyncio.run(alerts_runner.send_mailgun_email("user@example.com", "Subject", "Body", "<p>Body</p>"))
    assert calls and calls[0]["subject"] == "Subject"
