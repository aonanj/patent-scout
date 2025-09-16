from __future__ import annotations

import os
from typing import Sequence

from openai import OpenAI

_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
_client = OpenAI()

async def embed(text: str) -> Sequence[float]:
    out = _client.embeddings.create(model=_MODEL, input=text)
    return out.data[0].embedding
