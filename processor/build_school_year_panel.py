#!/usr/bin/env python3
"""Build strict school-year panel CSV from College Scorecard MERGED files.

Two-pass behavior:
1) Extract observed school-year rows for shortlist IDs.
2) Densify missing intermediate years and add fixed future-year extrapolation rows.

Fails loudly on unexpected conditions with non-zero exit status.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

import pandas as pd

YEAR_FILE_LABELS: Sequence[str] = (
    "2012_13",
    "2013_14",
    "2014_15",
    "2015_16",
    "2016_17",
    "2017_18",
    "2018_19",
    "2019_20",
    "2020_21",
    "2021_22",
    "2022_23",
)

OUTPUT_COLUMNS: Sequence[str] = (
    "id",
    "school",
    "year",
    "netPrice",
    "graduationRate",
    "medianDebt",
    "medianEarnings",
    "admissionRate",
    "satAverage",
    "actMidpoint",
    "tuitionInState",
    "tuitionOutOfState",
    "pellGrantRate",
    "federalLoanRate",
    "retentionRate",
)

METRIC_COLUMNS: Sequence[str] = (
    "netPrice",
    "graduationRate",
    "medianDebt",
    "medianEarnings",
    "admissionRate",
    "satAverage",
    "actMidpoint",
    "tuitionInState",
    "tuitionOutOfState",
    "pellGrantRate",
    "federalLoanRate",
    "retentionRate",
)

# Treat all of these as missing when reading raw files.
NULL_TOKENS = {"", "NULL", "PrivacySuppressed", "PS", "NA"}

DIRECT_FIELD_MAP = {
    "admissionRate": "ADM_RATE",
    "medianDebt": "GRAD_DEBT_MDN",
    "medianEarnings": "MD_EARN_WNE_P10",
    "satAverage": "SAT_AVG",
    "actMidpoint": "ACTCMMID",
    "tuitionInState": "TUITIONFEE_IN",
    "tuitionOutOfState": "TUITIONFEE_OUT",
    "pellGrantRate": "PCTPELL",
    "federalLoanRate": "PCTFLOAN",
}

FALLBACK_FIELDS = {
    "graduationRate": [
        "C150_L4_POOLED_SUPP",
        "C150_4_POOLED_SUPP",
        "C150_L4_POOLED",
        "C150_4_POOLED",
        "C150_4",
        "C150_L4",
    ],
    "netPrice": ["NPT4_PUB", "NPT4_PRIV", "NPT4", "NPT4_PROG", "NPT4_OTHER"],
    "retentionRate": ["RET_FT4", "RET_FTL4"],
}


class EtlError(RuntimeError):
    """Raised for strict ETL failures."""


@dataclass
class DensificationMetrics:
    observed_rows_total: int
    synthesized_rows_total: int
    synthesized_interpolated_rows_total: int
    synthesized_extrapolated_rows_total: int
    rows_total_after_densification: int
    schools_with_gaps_filled: int
    max_gap_length_single_school: int
    missing_metric_cells_observed: int
    missing_metric_cells_final: int


def fail(code: str, message: str) -> None:
    print(f"{code}: {message}", file=sys.stderr)
    raise EtlError(message)


def year_label_to_int(year_label: str) -> int:
    try:
        start, _ = year_label.split("_")
        return int(start)
    except Exception as exc:
        fail("E_YEAR", f"Cannot parse year label '{year_label}': {exc}")


def _required_input_columns() -> List[str]:
    cols = {"UNITID", "INSTNM"}
    cols.update(DIRECT_FIELD_MAP.values())
    return sorted(cols)


def _coalesce_columns(df: pd.DataFrame, columns: Iterable[str]) -> pd.Series:
    present = [c for c in columns if c in df.columns]
    if not present:
        fail("E_SCHEMA", f"None of fallback columns exist: {list(columns)}")

    out = df[present[0]]
    for col in present[1:]:
        out = out.combine_first(df[col])
    return out


def _empty_metric_values() -> dict:
    return {metric: pd.NA for metric in METRIC_COLUMNS}


def load_school_metadata_ids(schools_metadata_path: Path) -> List[int]:
    if not schools_metadata_path.exists():
        fail("E_INPUT", f"Schools metadata CSV not found: {schools_metadata_path}")

    try:
        df = pd.read_csv(schools_metadata_path, dtype=str)
    except Exception as exc:
        fail("E_INPUT", f"Failed to parse schools metadata CSV '{schools_metadata_path}': {exc}")

    if "id" not in df.columns:
        fail("E_SCHEMA", "schools_metadata.csv must contain required column 'id'")

    ids_series = pd.to_numeric(df["id"], errors="coerce")
    bad_mask = ids_series.isna()
    if bad_mask.any():
        sample = df.loc[bad_mask, ["id"]].head(10).to_dict(orient="records")
        fail("E_SCHEMA", f"Found non-numeric ids in schools_metadata.csv. Sample: {sample}")

    ids = ids_series.astype(int).tolist()
    if not ids:
        fail("E_COVERAGE", "schools_metadata.csv contains zero school IDs")

    dupes = pd.Series(ids).value_counts()
    dupes = dupes[dupes > 1]
    if not dupes.empty:
        fail("E_KEY", f"Duplicate IDs in schools_metadata.csv: {dupes.to_dict()}")

    return ids


def preflight_merged_files(raw_data_dir: Path) -> None:
    if not raw_data_dir.exists() or not raw_data_dir.is_dir():
        fail("E_INPUT", f"Raw data directory missing or not a directory: {raw_data_dir}")

    required_direct_cols = _required_input_columns()

    for label in YEAR_FILE_LABELS:
        path = raw_data_dir / f"MERGED{label}_PP.csv"
        if not path.exists():
            fail("E_INPUT", f"Missing required input file: {path}")

        try:
            header_df = pd.read_csv(path, nrows=0, dtype=str)
        except Exception as exc:
            fail("E_INPUT", f"Failed to read header for '{path}': {exc}")

        missing = [c for c in required_direct_cols if c not in header_df.columns]
        if missing:
            fail("E_SCHEMA", f"File '{path.name}' missing required columns: {missing}")

        for metric_name, fallback_cols in FALLBACK_FIELDS.items():
            present = [c for c in fallback_cols if c in header_df.columns]
            if not present:
                fail(
                    "E_SCHEMA",
                    f"File '{path.name}' missing all fallback columns for {metric_name}: {fallback_cols}",
                )


def extract_observed_rows(raw_data_dir: Path, shortlist_ids: List[int]) -> pd.DataFrame:
    shortlist_set = set(shortlist_ids)
    rows: List[pd.DataFrame] = []

    for label in YEAR_FILE_LABELS:
        year_int = year_label_to_int(label)
        path = raw_data_dir / f"MERGED{label}_PP.csv"
        try:
            header_df = pd.read_csv(path, nrows=0, dtype=str)
        except Exception as exc:
            fail("E_INPUT", f"Failed to read header for '{path}': {exc}")

        usecols_set = set(_required_input_columns())
        for fallback_cols in FALLBACK_FIELDS.values():
            for col in fallback_cols:
                if col in header_df.columns:
                    usecols_set.add(col)
        usecols = sorted(usecols_set)
        try:
            df = pd.read_csv(
                path,
                usecols=usecols,
                dtype=str,
                keep_default_na=True,
                na_values=list(NULL_TOKENS),
            )
        except Exception as exc:
            fail("E_INPUT", f"Failed reading '{path}': {exc}")

        df["UNITID"] = df["UNITID"].astype("string").str.strip()
        df = df[df["UNITID"].str.match(r"^\d+$", na=False)]
        df["id"] = df["UNITID"].astype("int64")
        df = df[df["id"].isin(shortlist_set)].copy()

        if df.empty:
            continue

        df["school"] = df["INSTNM"].astype("string").str.strip()
        if df["school"].isna().any() or (df["school"] == "").any():
            bad_count = int(df["school"].isna().sum() + (df["school"] == "").sum())
            fail("E_SCHEMA", f"Found {bad_count} matched rows with missing INSTNM in {path.name}")

        df["year"] = year_int

        for out_col, source_col in DIRECT_FIELD_MAP.items():
            df[out_col] = pd.to_numeric(df[source_col], errors="coerce")

        for out_col, fallback_cols in FALLBACK_FIELDS.items():
            df[out_col] = pd.to_numeric(_coalesce_columns(df, fallback_cols), errors="coerce")

        year_df = df[list(OUTPUT_COLUMNS)].copy()
        rows.append(year_df)

    if not rows:
        fail("E_COVERAGE", "No observed rows found for shortlist IDs in configured year range")

    observed = pd.concat(rows, ignore_index=True)

    duplicate_mask = observed.duplicated(subset=["id", "year"], keep=False)
    if duplicate_mask.any():
        sample = observed.loc[duplicate_mask, ["id", "year"]].drop_duplicates().head(10)
        fail("E_DUPLICATE", f"Observed data has duplicate (id, year) keys. Sample: {sample.to_dict(orient='records')}")

    missing_schools = sorted(set(shortlist_ids) - set(observed["id"].unique().tolist()))
    if missing_schools:
        fail(
            "E_COVERAGE",
            f"{len(missing_schools)} shortlisted schools had zero observed rows in {YEAR_FILE_LABELS[0]}..{YEAR_FILE_LABELS[-1]}. Sample: {missing_schools[:10]}",
        )

    return observed


def densify_intermediate_years_and_extrapolate(
    observed: pd.DataFrame, future_years_to_add: int = 2
) -> tuple[pd.DataFrame, DensificationMetrics, pd.DataFrame]:
    synth_rows: List[dict] = []
    per_school_stats: List[dict] = []

    schools_with_gaps_filled = 0
    max_gap_length_single_school = 0
    total_interpolated = 0
    total_extrapolated = 0

    for school_id, group in observed.groupby("id", sort=True):
        years_observed = sorted(group["year"].astype(int).unique().tolist())
        if not years_observed:
            fail("E_COVERAGE", f"Internal error: school {school_id} has empty observed year set")

        y_min = years_observed[0]
        y_max = years_observed[-1]
        full = set(range(y_min, y_max + 1))
        missing_years = sorted(full - set(years_observed))
        future_years = [y_max + i for i in range(1, future_years_to_add + 1)]

        interpolated_count = len(missing_years)
        extrapolated_count = len(future_years)
        synthesized_count = interpolated_count + extrapolated_count

        total_interpolated += interpolated_count
        total_extrapolated += extrapolated_count

        if interpolated_count > 0:
            schools_with_gaps_filled += 1
            max_gap_length_single_school = max(max_gap_length_single_school, interpolated_count)

        school_names = group["school"].dropna().astype(str).unique().tolist()
        if not school_names:
            fail("E_SCHEMA", f"No school name available to densify school id {school_id}")
        school_name = school_names[0]

        per_school_stats.append(
            {
                "id": int(school_id),
                "observed_years_count": len(years_observed),
                "synthesized_interpolated_years_count": interpolated_count,
                "synthesized_extrapolated_years_count": extrapolated_count,
                "synthesized_years_count": synthesized_count,
            }
        )

        for year in missing_years:
            row = {"id": int(school_id), "school": school_name, "year": int(year)}
            row.update(_empty_metric_values())
            synth_rows.append(row)

        for year in future_years:
            row = {"id": int(school_id), "school": school_name, "year": int(year)}
            row.update(_empty_metric_values())
            synth_rows.append(row)

    synth_df = pd.DataFrame(synth_rows, columns=OUTPUT_COLUMNS)

    combined = pd.concat([observed, synth_df], ignore_index=True)
    combined = combined.sort_values(["id", "year"], kind="mergesort").reset_index(drop=True)

    duplicate_mask = combined.duplicated(subset=["id", "year"], keep=False)
    if duplicate_mask.any():
        sample = combined.loc[duplicate_mask, ["id", "year"]].drop_duplicates().head(10)
        fail("E_DUPLICATE", f"Combined data has duplicate (id, year) keys after densification. Sample: {sample.to_dict(orient='records')}")

    missing_metric_cells_observed = int(observed[list(METRIC_COLUMNS)].isna().sum().sum())
    missing_metric_cells_final = int(combined[list(METRIC_COLUMNS)].isna().sum().sum())

    metrics = DensificationMetrics(
        observed_rows_total=int(len(observed)),
        synthesized_rows_total=int(len(synth_df)),
        synthesized_interpolated_rows_total=int(total_interpolated),
        synthesized_extrapolated_rows_total=int(total_extrapolated),
        rows_total_after_densification=int(len(combined)),
        schools_with_gaps_filled=int(schools_with_gaps_filled),
        max_gap_length_single_school=int(max_gap_length_single_school),
        missing_metric_cells_observed=missing_metric_cells_observed,
        missing_metric_cells_final=missing_metric_cells_final,
    )

    per_school_df = pd.DataFrame(per_school_stats).sort_values(["synthesized_years_count", "id"], ascending=[False, True])
    return combined, metrics, per_school_df


def final_output_checks(df: pd.DataFrame) -> None:
    if list(df.columns) != list(OUTPUT_COLUMNS):
        fail("E_SCHEMA", f"Output schema mismatch. Expected {list(OUTPUT_COLUMNS)} got {list(df.columns)}")

    if df[["id", "year"]].isna().any().any():
        fail("E_KEY", "Output has null values in id/year key fields")

    allowed_years = {year_label_to_int(y) for y in YEAR_FILE_LABELS}
    max_config_year = max(allowed_years)
    allowed_years.update({max_config_year + 1, max_config_year + 2})
    observed_years = set(pd.to_numeric(df["year"], errors="coerce").dropna().astype(int).tolist())
    if not observed_years.issubset(allowed_years):
        extra = sorted(observed_years - allowed_years)
        fail("E_YEAR", f"Output has years outside configured domain: {extra}")


def print_success_summary(
    output_path: Path,
    shortlist_count: int,
    schools_in_output: int,
    metrics: DensificationMetrics,
    per_school_df: pd.DataFrame,
) -> None:
    ratio = 0.0
    if metrics.rows_total_after_densification > 0:
        ratio = metrics.synthesized_rows_total / metrics.rows_total_after_densification

    print("=== school-year ETL summary ===")
    print(f"output_csv: {output_path}")
    print(f"shortlisted_schools_total: {shortlist_count}")
    print(f"schools_in_output: {schools_in_output}")
    print(f"observed_rows_total: {metrics.observed_rows_total}")
    print(f"synthesized_rows_total: {metrics.synthesized_rows_total}")
    print(f"synthesized_interpolated_rows_total: {metrics.synthesized_interpolated_rows_total}")
    print(f"synthesized_extrapolated_rows_total: {metrics.synthesized_extrapolated_rows_total}")
    print(f"rows_total_after_densification: {metrics.rows_total_after_densification}")
    print(f"schools_with_gaps_filled: {metrics.schools_with_gaps_filled}")
    print(f"max_gap_length_single_school: {metrics.max_gap_length_single_school}")
    print(f"synthesized_ratio: {ratio:.6f}")
    print(f"missing_metric_cells_observed: {metrics.missing_metric_cells_observed}")
    print(f"missing_metric_cells_final: {metrics.missing_metric_cells_final}")

    top = per_school_df.head(15)
    print("\nTop schools by synthesized_years_count:")
    if top.empty:
        print("(none)")
    else:
        print(top.to_string(index=False))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build strict school-year panel CSV from College Scorecard MERGED files")
    parser.add_argument(
        "--schools-metadata",
        default="data/schools_metadata.csv",
        help="Path to schools metadata CSV (expects id column)",
    )
    parser.add_argument(
        "--raw-data-dir",
        default="data/College_Scorecard_Raw_Data_03232026",
        help="Directory containing MERGEDYYYY_YY_PP.csv files",
    )
    parser.add_argument(
        "--output-csv",
        default="data/shared-schools-by-year.csv",
        help="Output CSV path",
    )
    parser.add_argument(
        "--na-token",
        default="NA",
        help="Token to write for missing values in output CSV",
    )
    parser.add_argument(
        "--future-years-to-add",
        type=int,
        default=2,
        help="How many future years to synthesize per school beyond latest observed year",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    schools_metadata_path = Path(args.schools_metadata).resolve()
    raw_data_dir = Path(args.raw_data_dir).resolve()
    output_csv = Path(args.output_csv).resolve()

    try:
        shortlist_ids = load_school_metadata_ids(schools_metadata_path)
        preflight_merged_files(raw_data_dir)

        observed = extract_observed_rows(raw_data_dir, shortlist_ids)
        if args.future_years_to_add < 0:
            fail("E_CONFIG", "--future-years-to-add must be >= 0")
        combined, metrics, per_school_df = densify_intermediate_years_and_extrapolate(
            observed, future_years_to_add=args.future_years_to_add
        )
        final_output_checks(combined)

        output_csv.parent.mkdir(parents=True, exist_ok=True)
        combined.to_csv(output_csv, index=False, na_rep=args.na_token)

        schools_in_output = int(combined["id"].nunique())
        print_success_summary(output_csv, len(shortlist_ids), schools_in_output, metrics, per_school_df)
        return 0
    except EtlError:
        return 1
    except Exception as exc:
        print(f"E_UNEXPECTED: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
