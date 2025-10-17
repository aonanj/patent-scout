"""Signal calculation utilities for whitespace analysis.

This module centralizes the computations that collapse lower-level metrics
into user-facing signal strengths. Each signal returns both a coarse status
and supporting metadata so the API layer can decide how much detail to expose.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

import numpy as np

SignalKind = Literal["focus_shift", "emerging_gap", "crowd_out", "bridge"]
SignalStatus = Literal["none", "weak", "medium", "strong"]


@dataclass(frozen=True, slots=True)
class SignalComputation:
    """Outcome of evaluating a single signal rule."""

    ok: bool
    confidence: float
    message: str
    debug: dict[str, float]

    def status(self) -> SignalStatus:
        """Map the confidence value to a discrete status bucket."""
        if not self.ok or self.confidence <= 0:
            return "none"
        if self.confidence >= 0.66:
            return "strong"
        if self.confidence >= 0.33:
            return "medium"
        return "weak"


def slope_conf(series: Sequence[float]) -> tuple[float, float]:
    """Return slope and a simple t-statistic confidence proxy for a time series."""
    if len(series) < 2:
        return 0.0, 0.0
    y = np.array(series, dtype=float)
    x = np.arange(len(y), dtype=float)
    x = (x - x.mean()) / (x.std() + 1e-9)
    A = np.c_[x, np.ones_like(x)]
    beta, _, _, _ = np.linalg.lstsq(A, y, rcond=None)
    slope = float(beta[0])
    resid = y - (A @ beta)
    se = float((resid.std() + 1e-9) / np.sqrt((x**2).sum()))
    t_value = abs(slope / se)
    return slope, t_value


def pct_rank(value: float, ref: Sequence[float]) -> float:
    """Percentile rank of `value` relative to `ref`."""
    if not ref:
        return 0.0
    arr = np.array(ref, dtype=float)
    return float(np.sum(arr <= value) / max(1, len(arr)))


def signal_focus_shift(dist_series: Sequence[float], share_series: Sequence[float], n_samples: int) -> SignalComputation:
    """Detect whether filings are converging toward the keyword focus."""
    if len(dist_series) < 3 or len(share_series) < 3 or n_samples < 4:
        return SignalComputation(False, 0.0, "Not enough recent filings to judge movement toward the focus.", {"samples": float(n_samples)})

    s_dist, t_dist = slope_conf([-d for d in dist_series])  # positive slope => distance decreasing
    s_share, t_share = slope_conf(share_series)

    dist_up = s_dist > 0
    share_up = s_share > 0
    soft_dist = s_dist > -0.02
    soft_share = s_share > -0.02
    trend_votes = int(dist_up) + int(share_up)
    ok = (trend_votes >= 1) and soft_dist and soft_share

    conf = min(1.0, 0.5 * (max(0.0, t_dist) + max(0.0, t_share))) * min(1.0, n_samples / 40.0)
    if trend_votes == 1:
        conf *= 0.6
    conf = float(np.clip(conf, 0.0, 1.0))

    if not ok:
        conf = 0.0
        message = "The assignee's latest patent filings stay anchored in prior themes; no sustained convergence toward the selected keywords is visible."
    elif trend_votes == 1:
        message = "The assignee has begun converging patent filings toward the selected keywords, but the change remains uneven across volume and location."
    else:
        message = "The assignee's recent patent filings converge around the selected keywords and now make up a growing share of their portfolio."

    debug = {
        "slope_dist": float(s_dist),
        "slope_share": float(s_share),
        "t_dist": float(t_dist),
        "t_share": float(t_share),
        "samples": float(n_samples),
        "trend_votes": float(trend_votes),
        "soft_dist": float(soft_dist),
        "soft_share": float(soft_share),
    }
    return SignalComputation(ok, conf, message, debug)


def signal_emerging_gap(
    whitespace_series: Sequence[float],
    cohort_scores: Sequence[float],
    neighbor_momentum: float,
) -> SignalComputation:
    """Flag when the assignee sits in a sparse pocket with rising nearby activity."""
    if not whitespace_series:
        return SignalComputation(False, 0.0, "No whitespace scores available for this scope.", {"momentum": float(neighbor_momentum)})

    current_score = float(whitespace_series[-1])
    percentile = pct_rank(current_score, cohort_scores)
    strong_sparse = percentile >= 0.95
    heated_neighbors = neighbor_momentum > 0.2
    ok = (percentile >= 0.85 and heated_neighbors) or strong_sparse

    conf = float(np.clip(0.55 * percentile + 0.45 * max(0.0, neighbor_momentum), 0.0, 1.0))
    if ok and not heated_neighbors:
        conf *= 0.75

    if not ok:
        conf = 0.0
        message = "The assignee's latest filings land in technology areas that other applicants already cover; no open pocket of whitespace is emerging near this focus."
    elif heated_neighbors:
        message = "The assignee is filing into a lightly contested pocket near the focus while neighboring applicants accelerate, signalling a chance to establish a lead before the area fills."
    else:
        message = "The assignee is filing into a lightly contested pocket near the focus, but neighboring applicants are only inching forward, so the window may stay open longer."

    debug = {
        "current_score": current_score,
        "percentile": float(percentile),
        "neighbor_momentum": float(neighbor_momentum),
        "strong_sparse": float(strong_sparse),
        "heated_neighbors": float(heated_neighbors),
    }
    return SignalComputation(ok, conf, message, debug)


def signal_crowd_out(
    whitespace_series: Sequence[float],
    density_series: Sequence[float],
) -> SignalComputation:
    """Warn when whitespace is collapsing and density is rising."""
    if len(whitespace_series) < 2 or len(density_series) < 2:
        return SignalComputation(False, 0.0, "Insufficient history to spot a crowd-out trend.", {})

    slope_ws, t_ws = slope_conf(whitespace_series)   # negative slope desired
    slope_den, t_den = slope_conf(density_series)    # positive slope desired

    recent_ws = float(whitespace_series[-1])
    start_ws = float(whitespace_series[0])
    recent_density = float(density_series[-1])
    start_density = float(density_series[0])

    ws_decline = (slope_ws < -0.002) or (recent_ws < start_ws - 0.05)
    density_gain = (slope_den > 0.002) or (recent_density > start_density + 0.05)
    crowded_now = (recent_ws <= np.quantile(whitespace_series, 0.35)) and (
        recent_density >= np.quantile(density_series, 0.65)
    )

    ok = (ws_decline and density_gain) or (crowded_now and (density_gain or slope_den >= -0.001))

    conf = min(1.0, 0.45 * (max(0.0, t_den) + max(0.0, abs(t_ws))))  # emphasise trend strength
    if not (ws_decline and density_gain) and ok:
        conf *= 0.7
    conf = float(np.clip(conf, 0.0, 1.0))

    if not ok:
        conf = 0.0
        message = "Recent competitor filings still leave breathing room around the selected focus; no material crowd-out pressure is showing up."
    elif ws_decline and density_gain:
        message = "Competitors are filing aggressively around the selected focus, shrinking available whitespace and concentrating coverage."
    else:
        message = "Competitor filings remain stacked around an already tight focus area, keeping steady pressure on the remaining whitespace."

    debug = {
        "slope_ws": float(slope_ws),
        "slope_density": float(slope_den),
        "t_ws": float(t_ws),
        "t_density": float(t_den),
        "ws_decline": float(ws_decline),
        "density_gain": float(density_gain),
        "crowded_now": float(crowded_now),
        "recent_ws": recent_ws,
        "recent_density": recent_density,
    }
    return SignalComputation(ok, conf, message, debug) # type: ignore[return]


def signal_bridge(
    openness: float,
    inter_weight: float,
    mom_left: float,
    mom_right: float,
) -> SignalComputation:
    """Spot adjacencies between two rising clusters with little coverage."""
    momentum_floor = 0.2
    openness_limit = 0.35
    weight_target = 0.5
    shared_growth = min(mom_left, mom_right) >= momentum_floor
    avg_growth = (mom_left + mom_right) / 2.0
    balanced_growth = shared_growth or (avg_growth >= 0.45 and min(mom_left, mom_right) >= 0.15)

    ok = (openness <= openness_limit) and (inter_weight >= weight_target) and balanced_growth
    conf = float(np.clip(min(mom_left, mom_right) * inter_weight, 0.0, 1.0))
    if ok and not shared_growth:
        conf *= 0.85

    if not ok:
        conf = 0.0
        message = "Recent filings do not reveal a clear linking opportunity between neighboring technology areas near the focus."
    elif shared_growth:
        message = "Neighboring technology areas near the focus are both accelerating in patent filings while the space between them stays thin, signalling a bridge opportunity."
    else:
        message = "At least one neighboring technology area is ramping patent filings while the gap between topics remains under-served, suggesting a bridge opportunity to connect them."

    debug = {
        "openness": float(openness),
        "inter_weight": float(inter_weight),
        "momentum_left": float(mom_left),
        "momentum_right": float(mom_right),
        "balanced_growth": float(balanced_growth),
        "shared_growth": float(shared_growth),
    }
    return SignalComputation(ok, conf, message, debug)
