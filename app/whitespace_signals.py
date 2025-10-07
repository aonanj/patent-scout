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
    """Detect whether filings are migrating toward the keyword focus."""
    if len(dist_series) < 3 or len(share_series) < 3 or n_samples < 5:
        return SignalComputation(False, 0.0, "Not enough recent filings to judge movement toward the focus.", {"samples": float(n_samples)})

    s_dist, t_dist = slope_conf([-d for d in dist_series])  # positive slope => distance decreasing
    s_share, t_share = slope_conf(share_series)
    ok = (s_dist > 0) and (s_share > 0)
    conf = min(1.0, 0.5 * (t_dist + t_share)) * min(1.0, n_samples / 50.0)
    if not ok:
        conf = 0.0
        message = "Filings are not consistently moving closer to the focus topic."
    else:
        message = "Filings are trending closer to the focus and making up more of the assignee's activity."

    debug = {
        "slope_dist": float(s_dist),
        "slope_share": float(s_share),
        "t_dist": float(t_dist),
        "t_share": float(t_share),
        "samples": float(n_samples),
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
    ok = (percentile >= 0.90) and (neighbor_momentum > 0.3)
    conf = float(np.clip(0.6 * percentile + 0.4 * neighbor_momentum, 0.0, 1.0))
    if not ok:
        conf = 0.0
        message = "Recent filings do not sit in a standout sparse area near the focus."
    else:
        message = "Recent filings land in a sparse pocket near the focus while neighboring clusters are heating up."

    debug = {
        "current_score": current_score,
        "percentile": float(percentile),
        "neighbor_momentum": float(neighbor_momentum),
    }
    return SignalComputation(ok, conf, message, debug)


def signal_crowd_out(
    whitespace_series: Sequence[float],
    density_series: Sequence[float],
) -> SignalComputation:
    """Warn when whitespace is collapsing and density is rising."""
    if len(whitespace_series) < 3 or len(density_series) < 3:
        return SignalComputation(False, 0.0, "Insufficient history to spot a crowd-out trend.", {})

    slope_ws, t_ws = slope_conf(whitespace_series)   # negative slope desired
    slope_den, t_den = slope_conf(density_series)    # positive slope desired
    ok = (slope_ws < 0) and (slope_den > 0)
    conf = min(1.0, 0.5 * (t_den + abs(t_ws)))
    if not ok:
        conf = 0.0
        message = "Whitespace levels look stable; no crowd-out pressure detected."
    else:
        message = "Whitespace is tightening while density increases around the focus."

    debug = {
        "slope_ws": float(slope_ws),
        "slope_density": float(slope_den),
        "t_ws": float(t_ws),
        "t_density": float(t_den),
    }
    return SignalComputation(ok, conf, message, debug)


def signal_bridge(
    openness: float,
    inter_weight: float,
    mom_left: float,
    mom_right: float,
) -> SignalComputation:
    """Spot adjacencies between two rising clusters with little coverage."""
    ok = (openness <= 0.2) and (inter_weight >= 0.6) and (min(mom_left, mom_right) > 0.3)
    conf = float(np.clip(min(mom_left, mom_right) * inter_weight, 0.0, 1.0))
    if not ok:
        conf = 0.0
        message = "No clear bridge opportunity between adjacent growing clusters."
    else:
        message = "Two growing clusters sit close together with little coverage at the interface."

    debug = {
        "openness": float(openness),
        "inter_weight": float(inter_weight),
        "momentum_left": float(mom_left),
        "momentum_right": float(mom_right),
    }
    return SignalComputation(ok, conf, message, debug)
