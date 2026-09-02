"""Configuration and shared constants for the isolated imputation module."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

METRICS: Sequence[str] = (
    "netPrice",
    "graduationRate",
    "medianDebt",
    "medianEarnings",
    "mobilityRate",
    "admissionRate",
)

# Reasonable value constraints for imputed values (lower, upper).
# Percent-like fields are stored in [0, 1] in this project.
METRIC_BOUNDS = {
    "netPrice": (0.0, 100000.0),
    "graduationRate": (0.0, 1.0),
    "medianDebt": (0.0, 200000.0),
    "medianEarnings": (0.0, 500000.0),
    "mobilityRate": (0.0, 1.0),
    "admissionRate": (0.0, 1.0),
    "satAverage": (400.0, 1600.0),
    "actMidpoint": (1.0, 36.0),
    "tuitionInState": (0.0, 120000.0),
    "tuitionOutOfState": (0.0, 150000.0),
    "pellGrantRate": (0.0, 1.0),
    "federalLoanRate": (0.0, 1.0),
    "retentionRate": (0.0, 1.0),
}

DEFAULT_RANK_GRID: Sequence[int] = (1, 2, 3, 4, 5, 6, 7, 8)
DEFAULT_CV_MASK_FRAC = 0.10
DEFAULT_MAX_ITER = 200
DEFAULT_TOL = 1e-5
DEFAULT_SEED = 564

DEFAULT_INPUT_PANEL = "data/shared-schools-by-year.csv"
DEFAULT_SCHOOLS_METADATA = "data/schools_metadata.csv"
DEFAULT_OUTPUT_PANEL = "processor/imputation/output/imputed-school-year-panel.json"
DEFAULT_OUTPUT_METADATA = "processor/imputation/output/imputation-metadata.json"
DEFAULT_OUTPUT_CSV = "data/merged_college_scorecard_imputed.csv"
DEFAULT_TMP_DIR = "processor/imputation/tmp"


@dataclass(frozen=True)
class ImputationConfig:
    rank_grid: Sequence[int]
    cv_mask_frac: float
    max_iter: int
    tol: float
    seed: int

    def validate(self) -> None:
        if not self.rank_grid:
            raise ValueError("rank_grid must contain at least one rank")
        if any(rank <= 0 for rank in self.rank_grid):
            raise ValueError("rank_grid values must be positive integers")
        if not (0.0 < self.cv_mask_frac < 1.0):
            raise ValueError("cv_mask_frac must be in (0, 1)")
        if self.max_iter <= 0:
            raise ValueError("max_iter must be > 0")
        if self.tol <= 0:
            raise ValueError("tol must be > 0")
