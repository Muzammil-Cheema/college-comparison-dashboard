#!/usr/bin/env python3
"""CLI entrypoint for isolated PCA-based matrix completion.

All generated artifacts are written under processor/imputation by default.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

import numpy as np
import pandas as pd

from config import (
    DEFAULT_CV_MASK_FRAC,
    DEFAULT_INPUT_PANEL,
    DEFAULT_SCHOOLS_METADATA,
    DEFAULT_MAX_ITER,
    DEFAULT_OUTPUT_CSV,
    DEFAULT_OUTPUT_METADATA,
    DEFAULT_OUTPUT_PANEL,
    DEFAULT_RANK_GRID,
    DEFAULT_SEED,
    DEFAULT_TMP_DIR,
    DEFAULT_TOL,
    ImputationConfig,
    METRIC_BOUNDS,
)
from io_panel import (
    apply_master_filter,
    build_wide_panel,
    load_panel_dataframe,
    resolve_metric_columns,
    wide_to_long_output,
)
from pca_matrix_completion import (
    complete_matrix,
    destandardize_completed_matrix,
    standardize_observed_matrix,
)
from rank_selection import select_rank_with_masked_cv


def _parse_rank_grid(text: str) -> list[int]:
    values = []
    for chunk in text.split(","):
        stripped = chunk.strip()
        if not stripped:
            continue
        values.append(int(stripped))
    if not values:
        raise ValueError("rank grid cannot be empty")
    return values


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run isolated PCA matrix completion for school-year panel")
    parser.add_argument("--input-panel", default=DEFAULT_INPUT_PANEL)
    parser.add_argument("--schools-metadata", default=DEFAULT_SCHOOLS_METADATA)
    parser.add_argument("--output-panel", default=DEFAULT_OUTPUT_PANEL)
    parser.add_argument("--output-metadata", default=DEFAULT_OUTPUT_METADATA)
    parser.add_argument("--output-csv", default=DEFAULT_OUTPUT_CSV)
    parser.add_argument("--tmp-dir", default=DEFAULT_TMP_DIR)

    parser.add_argument("--rank-grid", default=",".join(str(x) for x in DEFAULT_RANK_GRID))
    parser.add_argument("--cv-mask-frac", type=float, default=DEFAULT_CV_MASK_FRAC)
    parser.add_argument("--max-iter", type=int, default=DEFAULT_MAX_ITER)
    parser.add_argument("--tol", type=float, default=DEFAULT_TOL)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)

    parser.add_argument(
        "--no-master-filter",
        action="store_true",
        help="Skip filtering to schools_metadata ids (diagnostic mode)",
    )
    return parser


def _objective_non_increasing(objectives: Sequence[float], eps: float = 1e-9) -> bool:
    if len(objectives) <= 1:
        return True
    return all((objectives[i] - objectives[i + 1]) >= -eps for i in range(len(objectives) - 1))


def _infer_bounds_for_metric(metric: str) -> tuple[float | None, float | None]:
    if metric in METRIC_BOUNDS:
        return METRIC_BOUNDS[metric]

    key = metric.lower()
    percent_like = any(token in key for token in ["rate", "pct", "percent", "share", "ratio", "prop"])
    money_like = any(
        token in key
        for token in ["price", "cost", "debt", "earning", "income", "tuition", "salary", "grant", "aid", "loan"]
    )
    score_like = "sat" in key or "act" in key

    if percent_like:
        return 0.0, 1.0
    if score_like:
        return 0.0, None
    if money_like:
        return 0.0, None
    return None, None


def _apply_metric_bounds(
    imputed_wide: np.ndarray,
    column_pairs: list[tuple[str, int]],
    observed_mask: np.ndarray,
) -> tuple[np.ndarray, dict]:
    clipped = imputed_wide.copy()
    metrics = sorted({metric for metric, _ in column_pairs})
    clip_counts_by_metric = {metric: 0 for metric in metrics}

    for col_idx, (metric, _year) in enumerate(column_pairs):
        bounds = _infer_bounds_for_metric(metric)
        lo, hi = bounds
        if lo is None and hi is None:
            continue

        col = clipped[:, col_idx]
        # Only constrain cells that were originally missing (candidate imputed cells).
        target_mask = ~observed_mask[:, col_idx]
        if not np.any(target_mask):
            continue

        before = col.copy()
        if lo is not None:
            col[target_mask] = np.maximum(col[target_mask], lo)
        if hi is not None:
            col[target_mask] = np.minimum(col[target_mask], hi)
        clipped[:, col_idx] = col

        changed = np.isfinite(before[target_mask]) & np.isfinite(col[target_mask]) & (before[target_mask] != col[target_mask])
        clip_counts_by_metric[metric] += int(np.sum(changed))

    return clipped, clip_counts_by_metric


def _is_missing_text(value: object) -> bool:
    if value is None:
        return True
    text = str(value).strip()
    return text == "" or text.upper() in {"NA", "NULL", "NAN"}


def _build_merged_imputed_csv(
    original_csv_path: Path,
    output_df: pd.DataFrame,
    output_csv_path: Path,
) -> dict:
    raw = pd.read_csv(original_csv_path, dtype=str)
    if "id" not in raw.columns or "year" not in raw.columns or "school" not in raw.columns:
        raise ValueError("Input panel must include id, school, year columns for merged CSV export")

    relevant_cols = [col for col in raw.columns if col not in {"id", "school", "year"}]

    base = raw.copy()
    base["id"] = pd.to_numeric(base["id"], errors="coerce").astype("Int64")
    base["year"] = pd.to_numeric(base["year"], errors="coerce").astype("Int64")
    base = base[base["id"].notna() & base["year"].notna()].copy()
    base["id"] = base["id"].astype(int)
    base["year"] = base["year"].astype(int)

    aux_cols = ["id", "year"]
    for col in relevant_cols:
        if col in output_df.columns:
            aux_cols.append(col)
        source_col = f"{col}_source"
        if source_col in output_df.columns:
            aux_cols.append(source_col)

    aux = output_df[sorted(set(aux_cols), key=aux_cols.index)].copy()
    merged = base.merge(aux, on=["id", "year"], how="left", suffixes=("_orig", "_imp"))

    bit_arrays = []
    for col in relevant_cols:
        orig_col = f"{col}_orig" if f"{col}_orig" in merged.columns else col
        imp_col = f"{col}_imp"
        source_col = f"{col}_source"

        orig_vals = merged[orig_col]
        orig_missing = orig_vals.map(_is_missing_text)

        imp_vals = pd.to_numeric(merged[imp_col], errors="coerce") if imp_col in merged.columns else pd.Series(np.nan, index=merged.index)
        if source_col in merged.columns:
            imputed_used = (merged[source_col] == "imputed") & imp_vals.notna() & orig_missing
        else:
            imputed_used = pd.Series(False, index=merged.index)

        # Fill missing originals from imputed values where available.
        orig_num = pd.to_numeric(orig_vals, errors="coerce")
        final_num = orig_num.where(~orig_missing, imp_vals)
        merged[col] = final_num

        bit_arrays.append(imputed_used.astype(int).astype(str))

    if bit_arrays:
        bitmask = bit_arrays[0]
        for bits in bit_arrays[1:]:
            bitmask = bitmask + bits
    else:
        bitmask = pd.Series("", index=merged.index)

    out = merged[["id", "school", "year", *relevant_cols]].copy()
    out["imputation_bitmask"] = bitmask
    out["imputation_bit_order"] = "|".join(relevant_cols)
    out = out.sort_values(["id", "year"], kind="mergesort").reset_index(drop=True)

    output_csv_path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(output_csv_path, index=False, na_rep="NA")

    rows_with_any_imputation = int((out["imputation_bitmask"] != ("0" * len(relevant_cols))).sum()) if relevant_cols else 0
    return {
        "output_csv": str(output_csv_path),
        "relevant_columns": relevant_cols,
        "bitmask_width": len(relevant_cols),
        "rows_with_any_imputation": rows_with_any_imputation,
        "total_rows": int(len(out)),
    }


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    input_panel = Path(args.input_panel).resolve()
    schools_metadata = Path(args.schools_metadata).resolve()
    output_panel = Path(args.output_panel).resolve()
    output_metadata = Path(args.output_metadata).resolve()
    output_csv = Path(args.output_csv).resolve()
    tmp_dir = Path(args.tmp_dir).resolve()

    rank_grid = _parse_rank_grid(args.rank_grid)
    config = ImputationConfig(
        rank_grid=rank_grid,
        cv_mask_frac=args.cv_mask_frac,
        max_iter=args.max_iter,
        tol=args.tol,
        seed=args.seed,
    )
    config.validate()

    input_hash_before = _sha256(input_panel)

    input_header_df = pd.read_csv(input_panel, dtype=str, nrows=0)
    metrics = resolve_metric_columns(list(input_header_df.columns))
    panel_df = load_panel_dataframe(input_panel, metrics=metrics)
    if not args.no_master_filter:
        panel_df = apply_master_filter(panel_df, schools_metadata)

    wide_panel = build_wide_panel(panel_df=panel_df, metrics=metrics)

    standardization = standardize_observed_matrix(
        raw_matrix=wide_panel.wide_values,
        observed_mask=wide_panel.observed_mask,
    )

    rank_selection = select_rank_with_masked_cv(
        standardized_matrix=standardization.standardized_matrix,
        observed_mask=standardization.observed_mask,
        inferable_columns=standardization.inferable_columns,
        column_stds=np.where(np.isfinite(standardization.column_stds), standardization.column_stds, 1.0),
        rank_grid=list(config.rank_grid),
        cv_mask_frac=config.cv_mask_frac,
        max_iter=config.max_iter,
        tol=config.tol,
        seed=config.seed,
    )

    completion = complete_matrix(
        standardized_matrix=standardization.standardized_matrix,
        observed_mask=standardization.observed_mask,
        inferable_columns=standardization.inferable_columns,
        rank=rank_selection.selected_rank,
        max_iter=config.max_iter,
        tol=config.tol,
    )

    imputed_wide = destandardize_completed_matrix(
        completed_standardized=completion.completed_matrix,
        column_means=standardization.column_means,
        column_stds=standardization.column_stds,
        inferable_columns=standardization.inferable_columns,
    )

    imputed_wide, clip_counts_by_metric = _apply_metric_bounds(
        imputed_wide=imputed_wide,
        column_pairs=wide_panel.column_pairs,
        observed_mask=standardization.observed_mask,
    )

    # Never overwrite observed cells with model outputs.
    imputed_wide[standardization.observed_mask] = wide_panel.wide_values[standardization.observed_mask]

    output_df = wide_to_long_output(
        wide_panel=wide_panel,
        observed_values=wide_panel.wide_values,
        imputed_values=imputed_wide,
        inferable_columns=standardization.inferable_columns,
    )

    output_panel.parent.mkdir(parents=True, exist_ok=True)
    output_metadata.parent.mkdir(parents=True, exist_ok=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    output_df.to_json(output_panel, orient="records", indent=2)
    merged_csv_summary = _build_merged_imputed_csv(
        original_csv_path=input_panel,
        output_df=output_df,
        output_csv_path=output_csv,
    )

    cv_scores_path = tmp_dir / "rank-cv-scores.json"
    cv_scores_path.write_text(json.dumps(rank_selection.cv_rows, indent=2) + "\n", encoding="utf-8")

    input_hash_after = _sha256(input_panel)

    metric_source_counts = {}
    for metric in metrics:
        source_col = f"{metric}_source"
        counts = output_df[source_col].value_counts(dropna=False).to_dict()
        metric_source_counts[metric] = {str(k): int(v) for k, v in counts.items()}

    metadata = {
        "model": "pca_matrix_completion",
        "model_version": "v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "input_panel": str(input_panel),
        "schools_metadata": None if args.no_master_filter else str(schools_metadata),
        "output_panel": str(output_panel),
        "tmp_rank_cv_scores": str(cv_scores_path),
        "config": {
            "rank_grid": list(config.rank_grid),
            "cv_mask_frac": config.cv_mask_frac,
            "max_iter": config.max_iter,
            "tol": config.tol,
            "seed": config.seed,
            "schools_metadata_filter_enabled": not args.no_master_filter,
        },
        "shape": {
            "school_count": int(len(wide_panel.ids)),
            "year_count": int(len(wide_panel.years)),
            "metric_count": int(len(wide_panel.metrics)),
            "matrix_rows": int(wide_panel.wide_values.shape[0]),
            "matrix_cols": int(wide_panel.wide_values.shape[1]),
        },
        "range_constraints": {
            "metric_bounds": {
                metric: {"min": bounds[0], "max": bounds[1]} for metric, bounds in {m: _infer_bounds_for_metric(m) for m in metrics}.items()
            },
            "clip_counts_by_metric": {metric: int(count) for metric, count in clip_counts_by_metric.items()},
        },
        "rank_selection": {
            "selected_rank": int(rank_selection.selected_rank),
            "holdout_count": int(rank_selection.holdout_count),
            "cv_rows": rank_selection.cv_rows,
        },
        "completion": {
            "iterations_run": int(completion.iterations_run),
            "converged": bool(completion.converged),
            "stop_reason": completion.stop_reason,
            "objective_history": [float(x) for x in completion.objective_history],
            "objective_non_increasing": _objective_non_increasing(completion.objective_history),
        },
        "column_observed_counts": {
            f"{metric}__{year}": int(count)
            for (metric, year), count in zip(wide_panel.column_pairs, standardization.observed_counts)
        },
        "column_inferable": {
            f"{metric}__{year}": bool(flag)
            for (metric, year), flag in zip(wide_panel.column_pairs, standardization.inferable_columns)
        },
        "metric_source_counts": metric_source_counts,
        "input_integrity": {
            "sha256_before": input_hash_before,
            "sha256_after": input_hash_after,
            "unchanged": input_hash_before == input_hash_after,
        },
        "merged_csv_export": merged_csv_summary,
    }

    output_metadata.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    print("=== isolated imputation summary ===")
    print(f"schools: {len(wide_panel.ids)}")
    print(f"years: {len(wide_panel.years)}")
    print(f"selected_rank: {rank_selection.selected_rank}")
    print(f"iterations: {completion.iterations_run}")
    print(f"objective_non_increasing: {_objective_non_increasing(completion.objective_history)}")
    print(f"output_panel: {output_panel}")
    print(f"output_metadata: {output_metadata}")
    print(f"output_csv: {output_csv}")
    print(f"input_unchanged: {input_hash_before == input_hash_after}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
