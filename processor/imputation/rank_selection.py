"""Masked cross-validation rank selection for PCA-based matrix completion."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from pca_matrix_completion import complete_matrix


@dataclass
class RankSelectionResult:
    selected_rank: int
    cv_rows: list[dict]
    holdout_count: int


def select_rank_with_masked_cv(
    standardized_matrix: np.ndarray,
    observed_mask: np.ndarray,
    inferable_columns: np.ndarray,
    column_stds: np.ndarray,
    rank_grid: list[int],
    cv_mask_frac: float,
    max_iter: int,
    tol: float,
    seed: int,
) -> RankSelectionResult:
    inferable_2d = np.broadcast_to(inferable_columns.reshape(1, -1), observed_mask.shape)
    candidate_mask = observed_mask & inferable_2d
    candidate_indices = np.argwhere(candidate_mask)

    if len(candidate_indices) == 0:
        raise ValueError("No observed inferable cells available for CV masking")

    rng = np.random.default_rng(seed)
    holdout_count = max(1, int(round(cv_mask_frac * len(candidate_indices))))
    holdout_count = min(holdout_count, len(candidate_indices))

    selected_positions = rng.choice(len(candidate_indices), size=holdout_count, replace=False)
    holdout_indices = candidate_indices[selected_positions]

    holdout_rows = holdout_indices[:, 0]
    holdout_cols = holdout_indices[:, 1]
    truth = standardized_matrix[holdout_rows, holdout_cols]

    cv_rows: list[dict] = []

    for rank in rank_grid:
        train_matrix = standardized_matrix.copy()
        train_matrix[holdout_rows, holdout_cols] = np.nan
        train_observed_mask = ~np.isnan(train_matrix)

        completion = complete_matrix(
            standardized_matrix=train_matrix,
            observed_mask=train_observed_mask,
            inferable_columns=inferable_columns,
            rank=rank,
            max_iter=max_iter,
            tol=tol,
        )

        pred = completion.completed_matrix[holdout_rows, holdout_cols]
        error_std = pred - truth
        rmse_std = float(np.sqrt(np.mean(error_std * error_std)))

        orig_error = error_std * column_stds[holdout_cols]
        rmse_original = float(np.sqrt(np.mean(orig_error * orig_error)))

        cv_rows.append(
            {
                "rank": int(rank),
                "rmse_standardized": rmse_std,
                "rmse_original": rmse_original,
                "iterations_run": int(completion.iterations_run),
                "converged": bool(completion.converged),
                "stop_reason": completion.stop_reason,
            }
        )

    cv_rows.sort(key=lambda row: (row["rmse_original"], row["rank"]))
    selected_rank = int(cv_rows[0]["rank"])

    return RankSelectionResult(
        selected_rank=selected_rank,
        cv_rows=cv_rows,
        holdout_count=int(holdout_count),
    )
