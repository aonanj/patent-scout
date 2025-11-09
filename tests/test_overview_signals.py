import math

import pytest

from app.overview_signals import (
    SignalComputation,
    signal_bridge,
    signal_crowd_out,
    signal_emerging_gap,
    signal_focus_shift,
)


def test_signal_focus_shift_positive_trend() -> None:
    result = signal_focus_shift(
        dist_series=[0.62, 0.58, 0.54, 0.5],
        share_series=[0.18, 0.22, 0.27, 0.31],
        n_samples=80,
    )
    assert result.ok
    assert result.confidence > 0
    assert result.status() in {"weak", "medium", "strong"}


def test_signal_focus_shift_insufficient_history() -> None:
    result = signal_focus_shift(
        dist_series=[0.62],
        share_series=[0.2],
        n_samples=3,
    )
    assert not result.ok
    assert result.confidence == 0
    assert result.status() == "none"


def test_signal_focus_shift_partial_trend_is_detected() -> None:
    result = signal_focus_shift(
        dist_series=[0.62, 0.6, 0.6, 0.59, 0.59],
        share_series=[0.19, 0.2, 0.23, 0.27, 0.3],
        n_samples=32,
    )
    assert result.ok
    assert result.confidence > 0
    assert result.status() in {"weak", "medium", "strong"}


def test_signal_emerging_gap_detects_sparse_hotspot() -> None:
    result = signal_emerging_gap(
        overview_series=[0.42, 0.53, 0.97],
        cohort_scores=[0.1, 0.2, 0.3, 0.4, 0.75, 0.8, 0.88, 0.9, 0.92, 0.94],
        neighbor_momentum=0.65,
    )
    assert result.ok
    assert result.confidence >= 0.6 - 1e-6


def test_signal_emerging_gap_no_signal_when_percentile_low() -> None:
    result = signal_emerging_gap(
        overview_series=[0.21, 0.24],
        cohort_scores=[0.1, 0.2, 0.3, 0.4],
        neighbor_momentum=0.8,
    )
    assert not result.ok
    assert result.confidence == 0


def test_signal_emerging_gap_flags_sparse_even_with_cool_neighbors() -> None:
    result = signal_emerging_gap(
        overview_series=[0.41, 0.45, 0.98],
        cohort_scores=[0.1, 0.2, 0.3, 0.4, 0.75, 0.8, 0.88, 0.9, 0.92, 0.94],
        neighbor_momentum=0.12,
    )
    assert result.ok
    assert result.confidence > 0


def test_signal_crowd_out_detects_density_increase() -> None:
    result = signal_crowd_out(
        overview_series=[0.55, 0.48, 0.41, 0.36],
        density_series=[0.22, 0.28, 0.34, 0.39],
    )
    assert result.ok
    assert result.status() in {"weak", "medium", "strong"}


def test_signal_crowd_out_flags_static_crowding_pressure() -> None:
    result = signal_crowd_out(
        overview_series=[0.34, 0.31, 0.3],
        density_series=[0.61, 0.64, 0.66],
    )
    assert result.ok
    assert result.confidence > 0


def test_signal_bridge_identifies_interface_gap() -> None:
    result = signal_bridge(
        openness=0.12,
        inter_weight=0.72,
        mom_left=0.64,
        mom_right=0.58,
    )
    assert result.ok
    assert result.confidence > 0


def test_signal_bridge_requires_growth_on_both_sides() -> None:
    result = signal_bridge(
        openness=0.12,
        inter_weight=0.72,
        mom_left=0.12,
        mom_right=0.75,
    )
    assert not result.ok
    assert math.isclose(result.confidence, 0.0)


def test_signal_bridge_handles_asymmetric_growth() -> None:
    result = signal_bridge(
        openness=0.22,
        inter_weight=0.58,
        mom_left=0.76,
        mom_right=0.18,
    )
    assert result.ok
    assert result.confidence > 0


def test_status_bucket_mapping() -> None:
    assert SignalComputation(True, 0.7, "", {}).status() == "strong"
    assert SignalComputation(True, 0.5, "", {}).status() == "medium"
    assert SignalComputation(True, 0.2, "", {}).status() == "weak"
    assert SignalComputation(False, 0.9, "", {}).status() == "none"
