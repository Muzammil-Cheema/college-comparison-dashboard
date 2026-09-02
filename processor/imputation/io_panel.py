"""I/O and reshaping helpers for imputation panel workflows."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Sequence

import numpy as np
import pandas as pd

from config import METRICS


@dataclass
class WidePanel:
    ids: np.ndarray
    schools: np.ndarray
    years: np.ndarray
    metrics: Sequence[str]
    wide_values: np.ndarray
    observed_mask: np.ndarray
    column_pairs: list[tuple[str, int]]
    panel_df: pd.DataFrame


def resolve_metric_columns(input_columns: Sequence[str], default_metrics: Sequence[str] = METRICS) -> list[str]:
    reserved = {"id", "school", "year", "schoolId"}
    excluded_suffixes = ("_source",)
    excluded_exact = {"imputation_bitmask", "imputation_bit_order"}

    discovered = []
    for col in input_columns:
        if col in reserved:
            continue
        if col in excluded_exact:
            continue
        if any(col.endswith(sfx) for sfx in excluded_suffixes):
            continue
        discovered.append(col)

    if discovered:
        return discovered
    return list(default_metrics)


def _read_school_ids(schools_metadata_path: Path) -> set[int]:
    if not schools_metadata_path.exists():
        raise FileNotFoundError(f"Schools metadata not found: {schools_metadata_path}")

    df = pd.read_csv(schools_metadata_path, dtype=str)
    if "id" not in df.columns:
        raise ValueError("schools_metadata.csv must contain an 'id' column")

    ids = pd.to_numeric(df["id"], errors="coerce")
    if ids.isna().any():
        sample = df.loc[ids.isna(), ["id"]].head(10).to_dict(orient="records")
        raise ValueError(f"schools_metadata.csv contains non-numeric id values. Sample: {sample}")

    return set(ids.astype(int).tolist())


def load_panel_dataframe(input_panel_path: Path, metrics: Sequence[str]) -> pd.DataFrame:
    if not input_panel_path.exists():
        raise FileNotFoundError(f"Input panel not found: {input_panel_path}")

    df = pd.read_csv(input_panel_path, dtype=str)

    if "id" not in df.columns and "schoolId" in df.columns:
        df = df.rename(columns={"schoolId": "id"})

    required_core = {"id", "school", "year"}
    missing = [col for col in required_core if col not in df.columns]
    if missing:
        raise ValueError(f"Input panel missing required columns: {missing}")

    for metric in metrics:
        if metric not in df.columns:
            df[metric] = np.nan

    ordered_cols = ["id", "school", "year", *metrics]
    df = df[ordered_cols].copy()
    df["id"] = pd.to_numeric(df["id"], errors="coerce").astype("Int64")
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")

    df = df[df["id"].notna() & df["year"].notna()].copy()
    df["id"] = df["id"].astype(int)
    df["year"] = df["year"].astype(int)
    df["school"] = df["school"].astype(str).str.strip()

    for metric in metrics:
        df[metric] = pd.to_numeric(df[metric], errors="coerce")

    duplicate_mask = df.duplicated(subset=["id", "year"], keep=False)
    if duplicate_mask.any():
        sample = df.loc[duplicate_mask, ["id", "year"]].drop_duplicates().head(10).to_dict(orient="records")
        raise ValueError(f"Duplicate (id, year) keys found in input panel. Sample: {sample}")

    return df.sort_values(["id", "year"]).reset_index(drop=True)


def apply_master_filter(panel_df: pd.DataFrame, schools_metadata_path: Path) -> pd.DataFrame:
    school_ids = _read_school_ids(schools_metadata_path)
    out = panel_df[panel_df["id"].isin(school_ids)].copy()

    missing_ids = sorted(school_ids - set(out["id"].unique().tolist()))
    if missing_ids:
        raise ValueError(
            f"{len(missing_ids)} schools in schools_metadata missing from panel input. Sample: {missing_ids[:10]}"
        )

    return out.sort_values(["id", "year"]).reset_index(drop=True)


def build_wide_panel(panel_df: pd.DataFrame, metrics: Sequence[str] = METRICS) -> WidePanel:
    ids = np.array(sorted(panel_df["id"].unique().tolist()), dtype=int)
    years = np.array(sorted(panel_df["year"].unique().tolist()), dtype=int)

    school_map: Dict[int, str] = (
        panel_df[["id", "school"]]
        .drop_duplicates(subset=["id"], keep="first")
        .set_index("id")["school"]
        .to_dict()
    )
    schools = np.array([school_map[int(sid)] for sid in ids], dtype=object)

    row_count = len(ids)
    col_count = len(metrics) * len(years)
    wide_values = np.full((row_count, col_count), np.nan, dtype=float)
    column_pairs: list[tuple[str, int]] = []

    row_index_by_id = {int(sid): idx for idx, sid in enumerate(ids)}

    col_idx = 0
    for metric in metrics:
        metric_pivot = panel_df.pivot(index="id", columns="year", values=metric).reindex(index=ids, columns=years)
        values = metric_pivot.to_numpy(dtype=float)
        for year_idx, year in enumerate(years):
            wide_values[:, col_idx] = values[:, year_idx]
            column_pairs.append((metric, int(year)))
            col_idx += 1

    observed_mask = ~np.isnan(wide_values)

    return WidePanel(
        ids=ids,
        schools=schools,
        years=years,
        metrics=metrics,
        wide_values=wide_values,
        observed_mask=observed_mask,
        column_pairs=column_pairs,
        panel_df=panel_df.copy(),
    )


def wide_to_long_output(
    wide_panel: WidePanel,
    observed_values: np.ndarray,
    imputed_values: np.ndarray,
    inferable_columns: np.ndarray,
) -> pd.DataFrame:
    if observed_values.shape != imputed_values.shape:
        raise ValueError("observed_values and imputed_values shape mismatch")

    pair_to_col = {pair: idx for idx, pair in enumerate(wide_panel.column_pairs)}

    records = []
    for row_idx, school_id in enumerate(wide_panel.ids):
        school_name = wide_panel.schools[row_idx]

        for year in wide_panel.years:
            record = {
                "id": int(school_id),
                "school": school_name,
                "year": int(year),
            }

            for metric in wide_panel.metrics:
                col_idx = pair_to_col[(metric, int(year))]
                observed = observed_values[row_idx, col_idx]
                predicted = imputed_values[row_idx, col_idx]

                source_col = f"{metric}_source"
                if np.isfinite(observed):
                    record[metric] = float(observed)
                    record[source_col] = "observed"
                else:
                    if inferable_columns[col_idx] and np.isfinite(predicted):
                        record[metric] = float(predicted)
                        record[source_col] = "imputed"
                    else:
                        record[metric] = None
                        record[source_col] = "missing"

            records.append(record)

    out = pd.DataFrame(records)
    return out.sort_values(["id", "year"]).reset_index(drop=True)
