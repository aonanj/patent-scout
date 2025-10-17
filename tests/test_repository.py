from __future__ import annotations

import asyncio

import pytest

from app import repository
from app.schemas import PatentDetail, SearchFilters
from tests.conftest import FakeAsyncConnection, FakeAsyncCursor


def test_adaptive_filters_respects_jump_threshold() -> None:
    rows = [
        {"dist": 0.1},
        {"dist": 0.3},
        {"dist": 0.35},
        {"dist": 0.6},
    ]
    keep = repository._adaptive_filters(rows, jump=0.2, limit=10)  # type: ignore[attr-defined]
    assert keep == rows[:3]


def test_cpc_dict_to_code_handles_segments() -> None:
    code = repository._cpc_dict_to_code(  # type: ignore[attr-defined]
        {"section": "G", "class": "06", "subclass": "N", "group": "20", "subgroup": "30"}
    )
    assert code == "G06N20/30"


def test_export_rows_keyword_path() -> None:
    cursor = FakeAsyncCursor(
        fetchall=[
            {
                "pub_id": "US123",
                "title": "AI invention",
                "abstract": "Sample",
                "assignee_name": "OpenAI",
                "pub_date": 20240101,
                "priority_date": 20231231,
                "cpc_str": "G06N",
            }
        ]
    )
    conn = FakeAsyncConnection([cursor])

    rows = asyncio.run(
        repository.export_rows(
            conn,
            keywords="AI vision",
            query_vec=None,
            filters=SearchFilters(),
            limit=10,
        )
    )

    assert rows[0]["cpc"] == "G06N"
    assert "AI invention" in rows[0]["title"]


def test_export_rows_vector_path_limits_results() -> None:
    cursor = FakeAsyncCursor(
        fetchall=[
            {
                "pub_id": "US001",
                "title": "Vector Search",
                "abstract": "Semantic",
                "assignee_name": "Vector Inc",
                "pub_date": 20240101,
                "priority_date": 20230101,
                "cpc_str": "G06F",
                "dist": 0.05,
            },
            {
                "pub_id": "US002",
                "title": "Embeddings",
                "abstract": "Test",
                "assignee_name": "Vector Inc",
                "pub_date": 20240102,
                "priority_date": 20230102,
                "cpc_str": "G06N",
                "dist": 0.06,
            },
        ]
    )
    conn = FakeAsyncConnection([cursor])

    rows = asyncio.run(
        repository.export_rows(
            conn,
            keywords=None,
            query_vec=[0.1, 0.2, 0.3],
            filters=SearchFilters(),
            limit=1,
        )
    )

    assert len(rows) == 1
    assert rows[0]["pub_id"] == "US001"


def test_search_hybrid_keyword_path() -> None:
    count_cursor = FakeAsyncCursor(fetchone={"count": 2})
    results_cursor = FakeAsyncCursor(
        fetchall=[
            {
                "pub_id": "US123",
                "title": "Keyword Hit",
                "abstract": "data",
                "assignee_name": "OpenAI",
                "pub_date": 20240101,
                "kind_code": "A1",
                "cpc": [],
            }
        ]
    )
    conn = FakeAsyncConnection([count_cursor, results_cursor])

    total, items = asyncio.run(
        repository.search_hybrid(
            conn,
            keywords="robotics",
            query_vec=None,
            limit=5,
            offset=0,
            filters=SearchFilters(),
        )
    )

    assert total == 2
    assert items[0].pub_id == "US123"


def test_search_hybrid_vector_path() -> None:
    cursor = FakeAsyncCursor(
        fetchall=[
            {
                "pub_id": "US500",
                "title": "Semantic Hit",
                "abstract": "embedding",
                "assignee_name": "OpenAI",
                "pub_date": 20240103,
                "kind_code": "A1",
                "cpc": [],
                "dist": 0.04,
            },
            {
                "pub_id": "US501",
                "title": "Second Hit",
                "abstract": "embedding",
                "assignee_name": "OpenAI",
                "pub_date": 20240104,
                "kind_code": "A1",
                "cpc": [],
                "dist": 0.05,
            },
        ]
    )
    conn = FakeAsyncConnection([cursor])

    total, items = asyncio.run(
        repository.search_hybrid(
            conn,
            keywords=None,
            query_vec=[0.1, 0.2],
            limit=10,
            offset=0,
            filters=SearchFilters(),
        )
    )

    assert total == 2
    assert items[0].score <= items[1].score


def test_trend_volume_keyword_path() -> None:
    cursor = FakeAsyncCursor(
        fetchall=[
            {"bucket": "2024-01", "count": 3},
            {"bucket": "2024-02", "count": 1},
        ]
    )
    conn = FakeAsyncConnection([cursor])

    rows = asyncio.run(
        repository.trend_volume(
            conn,
            group_by="month",
            filters=SearchFilters(),
            keywords="ai",
        )
    )

    assert rows[0] == ("2024-01", 3)


def test_trend_volume_vector_path_groups_by_assignee() -> None:
    cursor = FakeAsyncCursor(
        fetchall=[
            {
                "pub_id": "US1",
                "pub_date": 20240101,
                "assignee_name": "OpenAI",
                "cpc": [],
                "dist": 0.01,
            },
            {
                "pub_id": "US2",
                "pub_date": 20240102,
                "assignee_name": "OpenAI",
                "cpc": [],
                "dist": 0.02,
            },
            {
                "pub_id": "US3",
                "pub_date": 20240103,
                "assignee_name": "DeepMind",
                "cpc": [],
                "dist": 0.05,
            },
        ]
    )
    conn = FakeAsyncConnection([cursor])

    rows = asyncio.run(
        repository.trend_volume(
            conn,
            group_by="assignee",
            filters=SearchFilters(),
            query_vec=[0.1, 0.2],
        )
    )

    assert rows[0] == ("OpenAI", 2)
    assert rows[1] == ("DeepMind", 1)


def test_get_patent_detail_returns_model() -> None:
    cursor = FakeAsyncCursor(
        fetchone={
            "pub_id": "US999",
            "application_number": "15/000,000",
            "kind_code": "A1",
            "pub_date": 20240101,
            "filing_date": 20220101,
            "title": "Test Patent",
            "abstract": "Example abstract",
            "claims_text": "Claim",
            "assignee_name": "OpenAI",
            "inventor_name": ["Inventor One"],
            "cpc": [],
        }
    )
    conn = FakeAsyncConnection([cursor])

    detail = asyncio.run(repository.get_patent_detail(conn, "US999"))
    assert isinstance(detail, PatentDetail)
    assert detail.title == "Test Patent"
