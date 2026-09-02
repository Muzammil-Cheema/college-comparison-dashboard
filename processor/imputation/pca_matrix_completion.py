"""Core PCA/SVD-based matrix completion utilities."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np


@dataclass
class StandardizationResult:
    standardized_matrix: np.ndarray
    observed_mask: np.ndarray
    column_means: np.ndarray
    column_stds: np.ndarray
    inferable_columns: np.ndarray
    observed_counts: np.ndarray


@dataclass
class CompletionResult:
    completed_matrix: np.ndarray
    objective_history: list[float]
    iterations_run: int
    converged: bool
    stop_reason: str


def standardize_observed_matrix(raw_matrix: np.ndarray, observed_mask: np.ndarray) -> StandardizationResult:
    if raw_matrix.shape != observed_mask.shape:
        raise ValueError("raw_matrix and observed_mask must have the same shape")

    n_rows, n_cols = raw_matrix.shape
    standardized = raw_matrix.astype(float).copy()

    column_means = np.full(n_cols, np.nan, dtype=float)
    column_stds = np.full(n_cols, np.nan, dtype=float)
    inferable_columns = np.zeros(n_cols, dtype=bool)
    observed_counts = observed_mask.sum(axis=0).astype(int)

    for col_idx in range(n_cols):
        mask = observed_mask[:, col_idx]
        if not np.any(mask):
            standardized[:, col_idx] = np.nan
            continue

        inferable_columns[col_idx] = True
        observed_values = raw_matrix[mask, col_idx].astype(float)

        mean = float(np.mean(observed_values))
        std = float(np.std(observed_values, ddof=0))
        if not np.isfinite(std) or std <= 0:
            std = 1.0

        column_means[col_idx] = mean
        column_stds[col_idx] = std

        standardized[mask, col_idx] = (observed_values - mean) / std
        standardized[~mask, col_idx] = np.nan

    return StandardizationResult(
        standardized_matrix=standardized,
        observed_mask=observed_mask.copy(),
        column_means=column_means,
        column_stds=column_stds,
        inferable_columns=inferable_columns,
        observed_counts=observed_counts,
    )


def initialize_completed_matrix(
    standardized_matrix: np.ndarray,
    observed_mask: np.ndarray,
    inferable_columns: np.ndarray,
) -> np.ndarray:
    """Fill missing cells for optimization start.

    Because columns are standardized with mean 0, mean-imputation in standardized space is 0.
    Non-inferable columns are also set to 0 for linear algebra stability, then re-masked later.
    """

    filled = standardized_matrix.copy()
    missing_mask = ~observed_mask
    filled[missing_mask] = 0.0

    # Keep explicit zeros in non-inferable columns to avoid NaNs in SVD.
    for col_idx, inferable in enumerate(inferable_columns):
        if not inferable:
            filled[:, col_idx] = 0.0

    return filled


def _truncated_svd_reconstruction(matrix: np.ndarray, rank: int) -> np.ndarray:
    max_rank = min(matrix.shape)
    use_rank = min(rank, max_rank)
    if use_rank <= 0:
        raise ValueError("rank must be >= 1")

    u, singular_values, vt = np.linalg.svd(matrix, full_matrices=False)
    u_k = u[:, :use_rank]
    s_k = singular_values[:use_rank]
    vt_k = vt[:use_rank, :]
    return (u_k * s_k) @ vt_k


def complete_matrix(
    standardized_matrix: np.ndarray,
    observed_mask: np.ndarray,
    inferable_columns: np.ndarray,
    rank: int,
    max_iter: int,
    tol: float,
) -> CompletionResult:
    """Iterative matrix completion with fixed-rank SVD reconstruction.

    Updates only originally missing cells for inferable columns.
    Objective is measured over observed cells in standardized space.
    """

    if max_iter <= 0:
        raise ValueError("max_iter must be > 0")
    if tol <= 0:
        raise ValueError("tol must be > 0")

    current = initialize_completed_matrix(standardized_matrix, observed_mask, inferable_columns)

    objective_history: list[float] = []
    converged = False
    stop_reason = "max_iter_reached"

    inferable_mask_2d = np.broadcast_to(inferable_columns.reshape(1, -1), observed_mask.shape)
    updatable_mask = (~observed_mask) & inferable_mask_2d

    prev_obj: Optional[float] = None

    for iteration in range(1, max_iter + 1):
        reconstructed = _truncated_svd_reconstruction(current, rank=rank)

        next_current = current.copy()
        next_current[updatable_mask] = reconstructed[updatable_mask]
        next_current[observed_mask] = standardized_matrix[observed_mask]

        residual = standardized_matrix[observed_mask] - reconstructed[observed_mask]
        obj = float(np.sum(residual * residual))
        objective_history.append(obj)

        if prev_obj is not None:
            improvement = prev_obj - obj
            threshold = tol * max(abs(prev_obj), 1.0)
            if abs(improvement) <= threshold:
                converged = True
                stop_reason = "objective_plateau"
                current = next_current
                break
        prev_obj = obj
        current = next_current

    return CompletionResult(
        completed_matrix=current,
        objective_history=objective_history,
        iterations_run=len(objective_history),
        converged=converged,
        stop_reason=stop_reason,
    )


def destandardize_completed_matrix(
    completed_standardized: np.ndarray,
    column_means: np.ndarray,
    column_stds: np.ndarray,
    inferable_columns: np.ndarray,
) -> np.ndarray:
    if completed_standardized.shape[1] != len(column_means):
        raise ValueError("Column stats shape mismatch")

    restored = np.full_like(completed_standardized, np.nan, dtype=float)

    for col_idx in range(completed_standardized.shape[1]):
        if not inferable_columns[col_idx]:
            continue

        mean = column_means[col_idx]
        std = column_stds[col_idx]
        restored[:, col_idx] = completed_standardized[:, col_idx] * std + mean

    return restored
