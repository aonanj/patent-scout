from __future__ import annotations

import asyncio

import pytest

from app import auth as auth_module


class DummySigningKey:
    def __init__(self) -> None:
        self.key = "secret"


class DummyJwkClient:
    def __init__(self, key: DummySigningKey | None = None) -> None:
        self._key = key or DummySigningKey()
        self.calls: list[str] = []

    def get_signing_key_from_jwt(self, token: str) -> DummySigningKey:
        self.calls.append(token)
        return self._key


@pytest.fixture(autouse=True)
def auth_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTH0_DOMAIN", "https://auth.example.com")
    monkeypatch.setenv("AUTH0_API_AUDIENCE", "https://api.example.com")
    auth_module.AUTH0_DOMAIN = "https://auth.example.com"
    auth_module.API_AUDIENCE = "https://api.example.com"


def test_get_current_user_success(monkeypatch: pytest.MonkeyPatch) -> None:
    dummy_client = DummyJwkClient()
    monkeypatch.setattr(auth_module.jwt, "PyJWKClient", lambda url: dummy_client)
    monkeypatch.setattr(
        auth_module.jwt,
        "decode",
        lambda token, key, algorithms, audience, issuer: {"sub": "user123"},
    )

    payload = asyncio.run(auth_module.get_current_user("token-abc"))
    assert payload["sub"] == "user123"
    assert dummy_client.calls == ["token-abc"]


def test_get_current_user_expired(monkeypatch: pytest.MonkeyPatch) -> None:
    dummy_client = DummyJwkClient()
    monkeypatch.setattr(auth_module.jwt, "PyJWKClient", lambda url: dummy_client)

    def _raise(*args, **kwargs):
        raise auth_module.jwt.ExpiredSignatureError("expired")

    monkeypatch.setattr(auth_module.jwt, "decode", _raise)

    with pytest.raises(auth_module.UnauthorizedException) as exc:
        asyncio.run(auth_module.get_current_user("token-expired"))
    assert "expired" in str(exc.value.detail)


def test_get_current_user_missing_claim(monkeypatch: pytest.MonkeyPatch) -> None:
    dummy_client = DummyJwkClient()
    monkeypatch.setattr(auth_module.jwt, "PyJWKClient", lambda url: dummy_client)

    def _raise(*args, **kwargs):
        raise auth_module.jwt.MissingRequiredClaimError("audience")

    monkeypatch.setattr(auth_module.jwt, "decode", _raise)

    with pytest.raises(auth_module.UnauthorizedException) as exc:
        asyncio.run(auth_module.get_current_user("token-missing"))
    assert "audience" in str(exc.value.detail)
