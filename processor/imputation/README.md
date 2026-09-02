# Isolated Imputation Module

This directory contains a **standalone** PCA/matrix-completion pipeline for filling missing school-year metric values.

It is intentionally isolated from the dashboard runtime and existing processor workflows.

## Files

- `run_imputation.py`: CLI entrypoint
- `pca_matrix_completion.py`: core iterative low-rank completion
- `rank_selection.py`: masked cross-validation rank selection
- `io_panel.py`: panel load/reshape/output helpers
- `config.py`: defaults and shared constants
- `tests.py`: lightweight unit-style checks
- `tmp/`: intermediate artifacts
- `output/`: generated panel + metadata

## Input

Default input panel (read-only):

- `data/shared-schools-by-year.csv`

Optional cohort filter (enabled by default):

- `data/schools_metadata.csv`

## Output

Default outputs:

- `processor/imputation/output/imputed-school-year-panel.json`
- `processor/imputation/output/imputation-metadata.json`
- `data/merged_college_scorecard_imputed.csv` (by default from `run_imputation.py`)

Per metric in output panel:

- value column (e.g. `medianDebt`)
- provenance column (e.g. `medianDebt_source`) with values:
  - `observed`
  - `imputed`
  - `missing`

## CLI

Run from project root:

```bash
.venv/bin/python processor/imputation/run_imputation.py
```

### Flags

- `--input-panel` (default `data/shared-schools-by-year.csv`)
- `--schools-metadata` (default `data/schools_metadata.csv`)
- `--output-panel` (default `processor/imputation/output/imputed-school-year-panel.json`)
- `--output-metadata` (default `processor/imputation/output/imputation-metadata.json`)
- `--output-csv` (default `data/merged_college_scorecard_imputed.csv`)
- `--tmp-dir` (default `processor/imputation/tmp`)
- `--rank-grid` (default `1,2,3,4,5,6,7,8`)
- `--cv-mask-frac` (default `0.1`)
- `--max-iter` (default `200`)
- `--tol` (default `1e-5`)
- `--seed` (default `564`)
- `--no-master-filter` (diagnostic mode)

## Tests

```bash
.venv/bin/python processor/imputation/tests.py
```

## Notes

- `medianEarnings` is kept strict based on values already present in the input panel.
- Imputed values are range-constrained per metric (e.g., percentages in `[0,1]`, non-negative cost/debt/earnings).
- No client integration or dashboard runtime wiring is included here.
