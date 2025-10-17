from __future__ import annotations

import asyncio

import pytest

from app import embed as embed_module


class DummyEmbeddingResponse:
    def __init__(self, vector: list[float]) -> None:
        self.data = [type("obj", (), {"embedding": vector})()]


class DummyEmbeddingsEndpoint:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def create(self, *, model: str, input: str) -> DummyEmbeddingResponse:
        self.calls.append((model, input))
        return DummyEmbeddingResponse([0.1, 0.2, 0.3])


class DummyOpenAIClient:
    def __init__(self) -> None:
        self.embeddings = DummyEmbeddingsEndpoint()


def test_embed_uses_openai_client(monkeypatch: pytest.MonkeyPatch) -> None:
    dummy_client = DummyOpenAIClient()
    monkeypatch.setattr(embed_module, "_client", dummy_client)
    vector = asyncio.run(embed_module.embed("hello world"))
    assert list(vector) == [0.1, 0.2, 0.3]
    assert dummy_client.embeddings.calls == [(embed_module._MODEL, "hello world")]
