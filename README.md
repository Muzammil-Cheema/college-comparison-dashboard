# College Comparison Dashboard

## Overview
This project is an interactive dashboard for comparing U.S. colleges across affordability, admissions, student aid, and post-graduation outcome measures. Instead of treating college choice as a single ranking problem, the dashboard is built to help users inspect tradeoffs across several linked views at once.

The current final project scope is intentionally narrower than the original proposal:

- The project uses `College Scorecard` as its only real data source.
- The school sample is the current curated set of `144` schools.
- All views remain visible on one non-scrolling page.
- The dashboard supports a raw-data mode and an imputed-data mode.

## Data Sources

### Primary Dataset
The dashboard uses processed historical `College Scorecard` data stored in:

- `data/merged_college_scorecard_dataset.csv`
- `data/merged_college_scorecard_imputed.csv`
- `data/schools_metadata.csv`

The raw historical Scorecard release is also included in:

- `data/College_Scorecard_Raw_Data_03232026/`
- `data/College_Scorecard_Raw_Data_03232026.zip`

### Available Dashboard Attributes
The current processed dashboard datasets expose these numeric attributes:

- `netPrice`
- `graduationRate`
- `medianDebt`
- `medianEarnings`
- `admissionRate`
- `satAverage`
- `actMidpoint`
- `tuitionInState`
- `tuitionOutOfState`
- `pellGrantRate`
- `federalLoanRate`
- `retentionRate`

### Time Coverage
Both merged CSVs contain one row per school per year for `2012` through `2024`, but the live dashboard currently has usable rendered data through `2022`. The `2023` and `2024` rows remain in the files, but they do not survive the runtime parsing step because they do not contain chartable metric values.

## Current Dashboard Features

### Shared Interactions
These interactions are shared across the dashboard:

- Single-year coordination across the ranked dot plot, bubble map, scatter plot, and parallel coordinates plot
- Cross-view pinning by clicking schools directly in charts
- Shared pinned-school highlighting across all views
- A maximum pinned set size of `8` schools
- Color assignment for pinned schools so the same school keeps the same comparison color across views
- Availability-aware controls that disable attributes with no usable values for the current year
- Custom hover tooltips across the interactive charts

### Header Controls

#### Year Selector
The header year selector controls the single-year views. When the year changes, the ranked dot plot, bubble map, scatter plot, and parallel coordinates plot all rerender for that same year.

#### Enable Imputation / Disable Imputation
The imputation button is live. It toggles the dashboard between:

- `raw` mode using `data/merged_college_scorecard_dataset.csv`
- `imputed` mode using `data/merged_college_scorecard_imputed.csv`

When imputation mode is active, the header displays a disclaimer stating that some values are estimated rather than directly observed.

#### Reset Pins
The reset button clears the current pinned-school set. It is disabled when nothing is pinned.

### Ranked Dot Plot
The ranked dot plot shows one selected metric for all schools in the current year.

Current features:

- Dynamic attribute dropdown
- Ranking from highest to lowest among schools with values for the selected metric
- Clickable stems and dots for pinning
- Hover tooltip showing school name, rank, and formatted metric value
- Automatic fallback if the chosen attribute has no values in the active year

This chart is best for quickly identifying leaders, laggards, and middle-of-the-pack schools for a single metric.

### Bubble Map
The bubble map shows the selected school sample projected onto a contiguous U.S. map using real latitude and longitude values from `data/schools_metadata.csv`.

Current features:

- Real geographic projection with `geoAlbersUsa`
- Background state geometry from `us-atlas`
- Alaska, Hawaii, and Puerto Rico excluded from the rendered map
- Dynamic bubble size dropdown
- Hover tooltip showing school name and current bubble-size metric
- Click-to-pin interaction
- Rectangular brushing to replace the pinned-school set
- Automatic disabling of unavailable size attributes for the active year

This chart is best for regional context and geographic selection.

### Scatter Plot
The scatter plot compares two selected metrics for the current year.

Current features:

- Independent `X` and `Y` attribute dropdowns
- Availability-aware axis options based on the current year
- Automatic fallback to valid axis selections when a chosen pairing has no renderable data
- Hover tooltip showing school name and both formatted metric values
- Click-to-pin interaction
- Rectangular brushing to replace the pinned-school set

This chart is best for tradeoff analysis, outlier detection, and value-style comparisons.

### Time Series
The time-series chart shows metric history only for the currently pinned schools.

Current features:

- Dynamic attribute dropdown
- Multi-line comparison over time for pinned schools
- Shared pinned-school colors
- Empty states when no schools are pinned or when pinned schools lack values for the selected metric
- Automatic reload when the dashboard switches between raw and imputed dataset modes
- Hover tooltips on both lines and points

This chart is best for seeing whether a shortlisted set of schools has converged, diverged, or stayed stable over time.

### Parallel Coordinates
The parallel coordinates chart compares schools across multiple metrics at once for the current year.

Current features:

- Attribute multi-select built with a collapsible checklist
- All available attributes selected by default
- Automatic disabling of unavailable dimensions for the current year
- Safeguard that prevents the chart from ending up with zero selected dimensions
- Click-to-pin interaction on school polylines
- Hover tooltip listing formatted values across the active dimensions
- Condensed layout behavior when many dimensions must fit on one page
- Stronger visual emphasis for pinned schools

This chart is best for multi-attribute profile comparison.

## Data Processing and Imputation Features

### Core Processing Scripts
The repository includes a working processor pipeline:

- `processor/find_schools.py`
  - screens schools from the raw Scorecard release using availability-based rules
- `processor/build_school_year_panel.py`
  - builds the strict school-year panel used for the merged dashboard CSV
- `processor/imputation/run_imputation.py`
  - runs the isolated PCA-style matrix-completion workflow
- `processor/imputation/tests.py`
  - lightweight checks for the imputation module

### Imputation Workflow
The imputation work is real and currently produces:

- `data/merged_college_scorecard_imputed.csv`
- `processor/imputation/output/imputed-school-year-panel.json`
- `processor/imputation/output/imputation-metadata.json`

The current imputation module:

- uses a PCA / low-rank matrix-completion approach
- performs masked cross-validation over candidate ranks
- selected rank `6` in the latest saved metadata
- writes provenance-oriented outputs during the processing workflow

Important current limitation:

- the live dashboard does support switching into imputed mode, but it does not yet mark imputed values with per-point visual encodings such as `X` markers inside the charts
- the main user-facing signal right now is the header disclaimer shown when imputation mode is enabled

### Current Data State
At the moment:

- the live dashboard is wired to real processed data
- the raw and imputed dashboard CSVs are both present
- the school metadata file provides real coordinates
- the isolated imputation module still defaults to `data/shared-schools-by-year.csv` as its processing input, so the processing path is not fully harmonized around one canonical source file yet

## Running the Dashboard

### Requirements

- A local static web server
- Internet access

Internet access is required because the client currently loads:

- `D3` from `jsdelivr`
- `topojson-client` from `jsdelivr`
- `us-atlas` state geometry from `jsdelivr`
- Google Fonts

### Quick Start
From the project root, start a simple local web server.

Example with Python:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/client/
```

Important note:

- do not open `client/index.html` directly as a `file://` page
- the dashboard expects module imports and CSV fetches that work correctly only when served through a local server

### Optional Data Regeneration
If someone wants to regenerate the processed data rather than only view the dashboard, the repo also includes the processor scripts and raw Scorecard data needed for that workflow. The exact processor behavior is documented mainly through the script files themselves and `processor/imputation/README.md`.

## How to Use the Dashboard

### Recommended Workflow
1. Open the dashboard in the browser through a local server.
2. Choose a year from the header selector.
3. Use the chart-specific dropdowns to choose the metrics most relevant to your comparison.
4. Click schools in any chart to pin them.
5. Brush the scatter plot or bubble map when you want to replace the pinned set with a selected group.
6. Read the time-series chart after pinning schools to compare historical behavior.
7. Use `Reset Pins` to clear the working set and start another comparison.
8. Toggle `Enable Imputation` if you want to compare the raw observed dataset against the imputed dataset.

### Interaction Guidelines

- `Click` a school mark or line to pin or unpin it
- `Brush` on the scatter plot or bubble map to replace the current pinned set
- `Hover` to see exact formatted values
- `Use dropdowns` to change what each chart emphasizes
- `Watch color consistency` across charts to follow the same pinned school through multiple views

### What Each View Is Best For

- `Ranked Dot Plot`: single-metric ranking
- `Bubble Map`: regional context and geographic selection
- `Scatter Plot`: tradeoffs and outliers
- `Time Series`: historical comparison of pinned schools
- `Parallel Coordinates`: multi-metric profile comparison

## Current Limitations
These are important to know when interpreting the current build:

- Only `College Scorecard` is included; no additional external enrichment datasets were added.
- The dashboard sample is limited to the curated `144`-school set used in the processed files.
- The map is geographically real for the included school metadata, but it only renders the contiguous U.S. view.
- The dashboard supports imputed mode, but imputed values are not yet marked with per-mark chart encodings.
- The processor-side imputation workflow is still somewhat separate from the main raw-panel build path.
- The dashboard depends on remote CDN assets and therefore is not fully offline-ready.

## Submission-Oriented Summary
The current repository already contains:

- the full browser client
- the processor pipeline
- the merged raw dashboard CSV
- the merged imputed dashboard CSV
- school metadata with real coordinates
- the raw Scorecard download used to derive the processed files

This means the project is no longer just a design prototype. It is a real-data dashboard with linked interactive views, a working dataset-mode toggle for imputation, and a documented processor path for rebuilding the underlying data products.
