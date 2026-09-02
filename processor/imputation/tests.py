#!/usr/bin/env python3
"""Lightweight unit-style checks for isolated imputation components."""

from __future__ import annotations

import numpy as np

from pca_matrix_completion import complete_matrix, standardize_observed_matrix


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def test_no_missing_identity() -> None:
    raw = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]], dtype=float)
    observed = ~np.isnan(raw)
    std = standardize_observed_matrix(raw, observed)

    result = complete_matrix(
        standardized_matrix=std.standardized_matrix,
        observed_mask=std.observed_mask,
        inferable_columns=std.inferable_columns,
        rank=2,
        max_iter=50,
        tol=1e-8,
    )

    recon = result.completed_matrix
    diff = np.abs(recon[observed] - std.standardized_matrix[observed]).max()
    _assert(diff < 1e-8, f"Observed cells changed unexpectedly (max diff {diff})")


def test_low_rank_recovery_with_missing() -> None:
    rng = np.random.default_rng(123)
    u = rng.normal(size=(40, 2))
    v = rng.normal(size=(2, 25))
    raw = u @ v

    observed = rng.random(raw.shape) > 0.30
    raw_with_missing = raw.copy()
    raw_with_missing[~observed] = np.nan

    std = standardize_observed_matrix(raw_with_missing, observed)
    result = complete_matrix(
        standardized_matrix=std.standardized_matrix,
        observed_mask=std.observed_mask,
        inferable_columns=std.inferable_columns,
        rank=2,
        max_iter=150,
        tol=1e-6,
    )

    # Check held-out recovery in standardized space over missing cells where inferable.
    missing_mask = ~observed
    pred = result.completed_matrix[missing_mask]

    # Build comparable standardized truth.
    truth = np.full(raw.shape, np.nan, dtype=float)
    for c in range(raw.shape[1]):
        if not std.inferable_columns[c]:
            continue
        truth[:, c] = (raw[:, c] - std.column_means[c]) / std.column_stds[c]

    rmse = float(np.sqrt(np.mean((pred - truth[missing_mask]) ** 2)))
    _assert(np.isfinite(rmse) and rmse < 1.0, f"Unexpectedly high RMSE for low-rank recovery: {rmse}")


def test_objective_near_monotonic() -> None:
    rng = np.random.default_rng(99)
    raw = rng.normal(size=(30, 12))
    observed = rng.random(raw.shape) > 0.2
    raw_with_missing = raw.copy()
    raw_with_missing[~observed] = np.nan

    std = standardize_observed_matrix(raw_with_missing, observed)
    result = complete_matrix(
        standardized_matrix=std.standardized_matrix,
        observed_mask=std.observed_mask,
        inferable_columns=std.inferable_columns,
        rank=3,
        max_iter=60,
        tol=1e-6,
    )

    hist = result.objective_history
    _assert(len(hist) >= 1, "Objective history empty")

    # Allow tiny numerical jitter.
    non_increasing = all((hist[i] - hist[i + 1]) >= -1e-6 for i in range(len(hist) - 1))
    _assert(non_increasing, "Objective is not near-monotonic")


def main() -> None:
    test_no_missing_identity()
    test_low_rank_recovery_with_missing()
    test_objective_near_monotonic()
    print("All imputation unit checks passed.")


if __name__ == "__main__":
    main()
