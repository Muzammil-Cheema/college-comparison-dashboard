# College Comparison Dashboard Submission Guide

## Project Summary
This project is an interactive visual analytics dashboard for comparing U.S. colleges across affordability, admissions, student aid, and post-graduation outcomes. The main goal is to support comparison as a tradeoff problem rather than a single ranking problem. Instead of producing one "best college" list, the dashboard helps users compare institutions from several angles at once and follow the same schools across linked views.

The final implementation is a single-screen dashboard with coordinated charts, shared school selection, and a toggle between raw and imputed datasets.

## Motivation and Intended Use

### User Story 1: A Family Comparing College Value
A student and their family may want to compare colleges not only by reputation, but by cost, likely debt, graduation outcomes, distance, and general fit. A family can use this dashboard to begin with a broad comparison, then narrow to a small set of schools and inspect those same schools across multiple views. For example, they might look for colleges with a strong balance between net price and earnings, then pin a few candidates and compare how those schools behave across time and across multiple dimensions at once.

### User Story 2: A University Administrator Benchmarking Peers
A university administrator may want to understand how their institution compares to national competitors and nearby peers. The dashboard supports this by allowing the user to pin one institution and then compare it against others in the same year, across multiple metrics, and over time. This makes it easier to see whether a school appears especially strong or weak in affordability, admissions, retention, graduation, debt, or earnings relative to other schools in the sample.

Together, these use cases reflect the central idea from the proposal: college value is multidimensional, and meaningful comparison requires more than a static ranking table.

## Final Project Scope
The implemented submission is intentionally focused:

- It uses `College Scorecard` as the real data source.
- It uses a curated sample of `144` schools.
- All visualizations appear on one non-scrolling page.
- It supports both a raw-data mode and an imputed-data mode.

## How to Run the Dashboard

### Requirements

- A local static web server
- Internet access

Internet access is needed because the client loads:

- `D3` from `jsdelivr`
- `topojson-client` from `jsdelivr`
- `us-atlas` geometry from `jsdelivr`
- Google Fonts

### Run Steps
From the project root, start a local web server. For example:

```bash
python3 -m http.server 8000
```

Then open the dashboard at:

```text
http://localhost:8000/client/
```

Important:

- The dashboard should be served through a local server.
- It should not be opened directly as `file://client/index.html`, because the app uses module imports and file fetches that require a served environment.

## How to Use the Dashboard

### Basic Interaction Flow
1. Open the dashboard in a browser.
2. Choose a year from the header selector.
3. Use the chart-specific dropdowns to choose the metrics you want to compare.
4. Click schools in charts to pin them.
5. Brush the scatter plot or bubble map to replace the pinned set with a selected region.
6. Use the time-series chart to compare pinned schools over time.
7. Toggle imputation on or off to compare the raw observed dataset against the imputed dataset.
8. Use `Reset Pins` to clear the current comparison set.

### Shared Interaction Model
The dashboard is designed so that a selection in one view carries across the others.

- Clicking a school pins it for cross-view comparison.
- Pinned schools are color-coded consistently across charts.
- Brushing on the scatter plot or bubble map replaces the pinned comparison group.
- The header year selector updates all single-year views together.

## Implemented Features

### Header Controls

- `Year Selector`
  - updates the ranked dot plot, bubble map, scatter plot, and parallel coordinates plot to the same year
- `Enable Imputation / Disable Imputation`
  - toggles between the raw and imputed processed datasets
  - displays a header disclaimer when imputation mode is active
- `Reset Pins`
  - clears the current pinned-school set

### Shared Dashboard Features

- linked cross-view school highlighting through pinning
- shared pinned-school color mapping
- maximum pinned set size of `8`
- hover tooltips for interactive marks
- attribute availability handling for year-specific missingness

### Ranked Dot Plot

- shows one selected metric for all schools in the current year
- supports a dynamic attribute dropdown
- allows click-to-pin on dots and stems
- supports fast ranking-based comparison for a single measure

### Bubble Map

- shows schools on a contiguous U.S. map using real latitude and longitude values
- supports a dynamic bubble-size attribute dropdown
- supports click-to-pin
- supports rectangular brushing to select a comparison group
- is useful for regional context and geographic grouping

### Scatter Plot

- compares two selected metrics in the current year
- supports independent `X` and `Y` metric selection
- supports click-to-pin
- supports rectangular brushing
- is useful for tradeoff analysis and outlier detection

### Time Series

- shows history only for pinned schools
- supports a dynamic attribute dropdown
- updates when switching between raw and imputed dataset modes
- is useful for comparing how shortlisted schools change over time

### Parallel Coordinates

- compares schools across multiple attributes simultaneously
- supports an attribute multi-select checklist
- keeps selected schools visually emphasized
- is useful for multi-dimensional profile comparison

## Data Description

### Included Data Files
The main dashboard uses:

- `data/merged_college_scorecard_dataset.csv`
- `data/merged_college_scorecard_imputed.csv`
- `data/schools_metadata.csv`

### Dashboard Attributes
The current processed datasets expose these numeric variables:

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

### School and Year Coverage

- `144` schools
- one row per school per year
- file coverage from `2012` through `2024`
- effective rendered coverage through `2022`

The later file years remain in the processed CSVs, but the dashboard currently renders years that contain chartable values after parsing.

## Imputation Mode
The project includes an imputed dataset and a live dashboard toggle for switching between observed and imputed values.

- Raw mode uses `data/merged_college_scorecard_dataset.csv`
- Imputed mode uses `data/merged_college_scorecard_imputed.csv`

The imputed dataset was produced through a PCA-style low-rank matrix-completion workflow. When imputation mode is enabled, the dashboard shows a visible header note indicating that some values are estimated rather than directly observed.

## Notes for Graders

- The dashboard is intended to be explored interactively rather than read as a static graphic.
- The strongest workflow is to pin a small set of schools and then compare them across the scatter plot, time series, and parallel coordinates plot.
- The map uses real school coordinates from the included metadata file and is limited to the contiguous U.S. view.
- Because the project uses CDN-hosted libraries and map geometry, internet access is required during runtime.

## Submission Contents
This submission includes:

- the full `client/` folder
- the full `processor/` folder
- the processed raw and imputed dashboard CSVs
- school metadata used by the map and shared data loader

For a recorded walkthrough, see `demo_link.txt` if it is included alongside the submission package.
