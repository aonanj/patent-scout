from __future__ import annotations

import numpy as np
import pytest

from app import whitespace_api as ws_api


def test_to_int_date_and_from_int_date_round_trip() -> None:
    value = ws_api._to_int_date("2024-01-05")  # type: ignore[attr-defined]
    assert value == 20240105
    assert ws_api._from_int_date(value).isoformat() == "2024-01-05"  # type: ignore[attr-defined]


def test_from_int_date_handles_invalid() -> None:
    assert ws_api._from_int_date(20241301) is None  # type: ignore[attr-defined]


def test_local_density_computes_mean_similarity() -> None:
    dist = np.array([[0.0, 0.1], [0.1, 0.0]], dtype=np.float32)
    density = ws_api.local_density(dist)
    assert density.shape == (2,)
    assert np.allclose(density, [0.95, 0.95])


def test_cluster_labels_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ws_api, "_HAVE_LEIDEN", False)
    dist = np.array(
        [
            [0.0, 0.1, 0.8],
            [0.1, 0.0, 0.82],
            [0.8, 0.82, 0.0],
        ],
        dtype=np.float32,
    )
    idx = np.array(
        [
            [0, 1, 2],
            [1, 0, 2],
            [2, 0, 1],
        ],
        dtype=np.int32,
    )
    labels = ws_api.cluster_labels(dist, idx, resolution=0.5)
    assert tuple(labels)[:2] == (0, 0)
    assert labels[2] in {1, 0}


def test_build_knn_returns_expected_shapes() -> None:
    points = np.array(
        [
            [1.0, 0.0],
            [0.0, 1.0],
            [1.0, 1.0],
        ],
        dtype=np.float32,
    )
    dist, idx = ws_api.build_knn(points, k=2)
    assert dist.shape == (3, 2)
    assert idx.shape == (3, 2)

