#!/usr/bin/env python3
"""Find College Scorecard schools that meet tunable availability thresholds.

Default behavior is read-only (`--write-output` is off), so it can be safely tested
without creating persistent outputs.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import pandas as pd

# =========================
# Tunable global parameters
# =========================
MIN_YEARS_PER_ATTRIBUTE = 7
OVERALL_AVAILABILITY_THRESHOLD = 0.9

YEAR_FILE_LABELS = [
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
]

# Optional sampling filters.
REQUIRE_MAIN_CAMPUS = True
CONTIGUOUS_STATES_ONLY = True
ALLOWED_PREDDEG = {"2", "3"}  # 2: associates, 3: bachelors

NULL_VALUES = {"", "NULL", "PrivacySuppressed", "NA", "PS"}

CONTIGUOUS_STATES = {
    "AL",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
}

# Dashboard-oriented attributes and fallback Scorecard columns.
ATTRIBUTE_COLUMN_FALLBACKS = {
    "netPrice": ["NPT4_PUB", "NPT4_PRIV", "NPT4", "NPT4_PROG", "NPT4_OTHER"],
    "graduationRate": [
        "C150_L4_POOLED_SUPP",
        "C150_4_POOLED_SUPP",
        "C150_L4_POOLED",
        "C150_4_POOLED",
        "C150_L4",
        "C150_4",
    ],
    "medianDebt": ["GRAD_DEBT_MDN"],
    # Scorecard releases vary by available "years-after-entry" earnings columns.
    "medianEarnings": [
        "MD_EARN_WNE_P10",
        "MD_EARN_WNE_P11",
        "MD_EARN_WNE_P9",
        "MD_EARN_WNE_P8",
        "MD_EARN_WNE_P7",
        "MD_EARN_WNE_P6",
        "MD_EARN_WNE_5YR",
        "MD_EARN_WNE_4YR",
        "MD_EARN_WNE_1YR",
    ],
    # Mobility proxy in College Scorecard institution dataset.
    "mobilityRate": ["PCTPELL"],
    "admissionRate": ["ADM_RATE"],
}


def is_present(value: Optional[str]) -> bool:
    return (value or "").strip() not in NULL_VALUES


def to_number(value: str) -> Optional[float]:
    text = (value or "").strip()
    if text in NULL_VALUES:
        return None
    try:
        num = float(text)
    except ValueError:
        return None
    if num.is_integer():
        return int(num)
    return num


def select_first_available(row: Dict[str, str], columns: Iterable[str]) -> Optional[float]:
    for col in columns:
        val = row.get(col)
        if is_present(val):
            parsed = to_number(val or "")
            if parsed is not None:
                return parsed
    return None


def select_admission_rate(row: Dict[str, str]) -> Optional[float]:
    adm_rate = select_first_available(row, ["ADM_RATE"])
    if adm_rate is not None:
        return adm_rate

    # Open-admission schools often have null ADM_RATE; treat as 100% admission.
    open_adm = (row.get("OPENADMP") or "").strip()
    if open_adm == "1":
        return 1.0
    return None


def should_keep_row(row: Dict[str, str]) -> bool:
    if REQUIRE_MAIN_CAMPUS and (row.get("MAIN") or "").strip() != "1":
        return False

    if ALLOWED_PREDDEG:
        preddeg = (row.get("PREDDEG") or "").strip()
        if preddeg not in ALLOWED_PREDDEG:
            return False

    if CONTIGUOUS_STATES_ONLY:
        state = (row.get("STABBR") or "").strip()
        if state not in CONTIGUOUS_STATES:
            return False

    return True


def year_to_display(year_file_label: str) -> str:
    left, right = year_file_label.split("_")
    return f"{left}-{right}"


def collect_school_year_data(raw_data_dir: Path) -> Dict[str, dict]:
    school_map: Dict[str, dict] = {}

    for year_file_label in YEAR_FILE_LABELS:
        year_field = year_to_display(year_file_label)
        file_path = raw_data_dir / f"MERGED{year_file_label}_PP.csv"
        if not file_path.exists():
            raise FileNotFoundError(f"Missing input file: {file_path}")

        with file_path.open(newline="", encoding="utf-8", errors="replace") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                if not should_keep_row(row):
                    continue

                unitid = (row.get("UNITID") or "").strip()
                instnm = (row.get("INSTNM") or "").strip()
                if not unitid or not instnm:
                    continue

                yearly_values: Dict[str, float] = {}
                for attribute, columns in ATTRIBUTE_COLUMN_FALLBACKS.items():
                    if attribute == "admissionRate":
                        picked = select_admission_rate(row)
                    else:
                        picked = select_first_available(row, columns)
                    if picked is not None:
                        yearly_values[attribute] = picked

                if not yearly_values:
                    continue

                school_entry = school_map.setdefault(
                    unitid,
                    {
                        "id": int(unitid),
                        "name": instnm,
                        "years": {},
                    },
                )
                school_entry["years"][year_field] = yearly_values

    return school_map


def school_meets_thresholds(school_entry: dict) -> tuple[bool, dict, float]:
    attr_counts = defaultdict(int)
    total_available = 0

    year_fields = [year_to_display(y) for y in YEAR_FILE_LABELS]
    attribute_names = list(ATTRIBUTE_COLUMN_FALLBACKS.keys())

    for year_field in year_fields:
        year_obj = school_entry.get("years", {}).get(year_field, {})
        for attr in attribute_names:
            if attr in year_obj:
                attr_counts[attr] += 1
                total_available += 1

    required_min_years_ok = all(attr_counts[attr] >= MIN_YEARS_PER_ATTRIBUTE for attr in attribute_names)

    max_possible = len(year_fields) * len(attribute_names)
    overall_availability = (total_available / max_possible) if max_possible else 0.0
    overall_ok = overall_availability >= OVERALL_AVAILABILITY_THRESHOLD

    return required_min_years_ok and overall_ok, dict(attr_counts), overall_availability


def build_dataframe(school_map: Dict[str, dict]) -> pd.DataFrame:
    records: List[dict] = []

    for school_entry in school_map.values():
        keep, attr_counts, overall_availability = school_meets_thresholds(school_entry)
        if not keep:
            continue

        record = {
            "id": school_entry["id"],
            "name": school_entry["name"],
            "availability_ratio": round(overall_availability, 4),
            "attribute_year_counts": attr_counts,
        }

        for year_field in sorted(school_entry["years"].keys()):
            record[year_field] = school_entry["years"][year_field]

        records.append(record)

    if not records:
        return pd.DataFrame(columns=["id", "name"])

    df = pd.DataFrame(records)
    return df.sort_values(["name", "id"]).reset_index(drop=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Find candidate schools by multi-year data availability.")
    parser.add_argument(
        "--raw-data-dir",
        default="data/College_Scorecard_Raw_Data_03232026",
        help="Directory containing MERGEDYYYY_YY_PP.csv files.",
    )
    parser.add_argument(
        "--output-json",
        default="data/school-search-results.json",
        help="Output JSON path (used only with --write-output).",
    )
    parser.add_argument(
        "--write-output",
        action="store_true",
        help="Persist the resulting dataframe records to the output JSON path.",
    )
    parser.add_argument(
        "--preview-count",
        type=int,
        default=12,
        help="How many school names to print in preview.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    raw_data_dir = Path(args.raw_data_dir).resolve()
    output_json = Path(args.output_json).resolve()

    school_map = collect_school_year_data(raw_data_dir)
    df = build_dataframe(school_map)

    print("=== find_schools.py summary ===")
    print(f"Input directory: {raw_data_dir}")
    print(f"Years evaluated: {', '.join(year_to_display(y) for y in YEAR_FILE_LABELS)}")
    print(f"MIN_YEARS_PER_ATTRIBUTE={MIN_YEARS_PER_ATTRIBUTE}")
    print(f"OVERALL_AVAILABILITY_THRESHOLD={OVERALL_AVAILABILITY_THRESHOLD}")
    print(f"Candidate schools found: {len(df)}")

    if len(df) > 0:
        preview = df[["id", "name", "availability_ratio"]].head(args.preview_count)
        print("\nPreview:")
        print(preview.to_string(index=False))

    if args.write_output:
        output_json.parent.mkdir(parents=True, exist_ok=True)
        df.to_json(output_json, orient="records", indent=2)
        print(f"\nWrote JSON output: {output_json}")
    else:
        print("\nDry run only. No output file written.")


if __name__ == "__main__":
    main()
