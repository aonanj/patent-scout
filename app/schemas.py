from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SearchFilters(BaseModel):
    assignee: str | None = None
    cpc: str | None = None # Prefix match supported, e.g., "G06N".
    date_from: int | None = None # YYYYMMDD
    date_to: int | None = None # YYYYMMDD


class SearchRequest(BaseModel):
    keywords: str | None = None
    semantic_query: str | None = None
    limit: int = 50
    offset: int = 0
    filters: SearchFilters = Field(default_factory=SearchFilters)


class PatentHit(BaseModel):
    pub_id: str
    title: str | None = None
    abstract: str | None = None
    assignee_name: str | None = None
    pub_date: int | None = None
    kind_code: str | None = None
    cpc: list[dict] | None = None
    priority_date: int | None = None
    score: float | None = None # distance or rank fusion score


class SearchResponse(BaseModel):
    total: int
    items: list[PatentHit]


class TrendRequest(BaseModel):
    group_by: Literal["month", "cpc", "assignee", "applicant"] = "month"
    filters: SearchFilters = Field(default_factory=SearchFilters)
    semantic_query: str | None = None
    keywords: str | None = None


class TrendPoint(BaseModel):
    bucket: str
    count: int
    top_assignee: str | None = None


class TrendResponse(BaseModel):
    points: list[TrendPoint]


class PatentDetail(BaseModel):
    pub_id: str
    application_number: str | None = None
    kind_code: str | None = None
    pub_date: int | None = None
    filing_date: int | None = None
    title: str | None = None
    abstract: str | None = None
    claims_text: str | None = None
    assignee_name: str | None = None
    inventor_name: list[str] | None = None
    cpc: list[dict] | None = None