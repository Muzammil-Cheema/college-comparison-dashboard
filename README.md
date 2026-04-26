# College Comparison Dashboard

## Introduction
Choosing a college is often treated as a ranking problem, but in practice it is a tradeoff problem. Students and families care about affordability, debt, distance from home, quality of life, post-graduation outcomes, and the general character of a campus, and those factors do not move together neatly. A school that looks attractive on one dimension may be far less compelling on another, and static lists rarely make those tensions easy to explore.

This dashboard is designed to support a more thoughtful comparison process. Instead of trying to produce a single "best" college, it gives users a way to inspect relationships between cost, outcomes, and institutional context from several angles at once. The broader motivation is to create a tool that helps people make better-informed decisions, spot meaningful tradeoffs, and compare peer institutions in a way that feels more transparent than relying on rankings alone.

## Current Features
The current dashboard is a linked prototype built around a shared synthetic dataset. Several charts support pinning and brushing so that a user can move between overview and detail while comparing a subset of schools more closely.

### Charts
#### Ranked Dot Plot
The ranked dot plot shows a single attribute for all schools in the current year and sorts them from highest to lowest. It works well for quick comparisons and for identifying leaders, laggards, and middle-tier schools for metrics such as net price, graduation rate, median debt, median earnings, mobility rate, and admission rate. Users can click dots to pin schools for comparison in other views, and the chart now includes an attribute dropdown so the ranking can be switched between the available metrics.

#### Bubble Map
The bubble map gives a geographic-style view of the school sample and supports brushing and pinning. In its current prototype form, it is best used to get a quick sense of spatial distribution and to select a cluster of schools visually. The map now includes a size dropdown, allowing bubble size to represent different attributes such as net price, graduation rate, debt, earnings, mobility rate, or admission rate rather than staying fixed to a single metric.

#### Scatter Plot
The scatter plot is used to compare two attributes against one another for the selected year. This view is best for understanding tradeoffs, outliers, and possible "value" patterns, such as schools with lower price but relatively strong earnings. It supports rectangular brushing, which allows a user to select a group of schools from a meaningful region of the plot and pin them for cross-chart comparison. It now also includes separate X-axis and Y-axis dropdowns so the user can change which variables are being compared.

#### Time Series
The time-series view focuses on the schools that have been pinned elsewhere in the dashboard. It is useful for comparing how selected schools change over time and currently supports multiple attributes such as net price, graduation rate, median debt, median earnings, mobility rate, and admission rate. This chart is best for seeing divergence in long-term patterns after a user has already narrowed the candidate set.

#### Parallel Coordinates
The parallel coordinates plot places several attributes side by side so that a user can trace each school across multiple dimensions at once. This chart is best for multi-attribute comparison, especially when a user wants to see how a school balances affordability, outcomes, and access-related variables rather than looking at only one metric at a time. Pinned schools are emphasized visually so they can stand out from the full sample. The chart now includes an attribute multi-select control, allowing the user to show only the dimensions most relevant to a particular comparison task.

### Chart Controls
#### Ranked Dot Plot Attribute Dropdown
This dropdown changes which metric is used for the ranking. It is useful when a user wants to keep the same school set in view but quickly switch between cost, outcomes, mobility, and selectivity-related measures.

#### Scatter Plot X and Y Dropdowns
These dropdowns let the user redefine the scatter plot axes. They make the chart much more flexible because the same view can be used to compare many different tradeoffs instead of only one fixed relationship.

#### Bubble Map Size Dropdown
This dropdown changes which metric controls bubble size on the map. It helps the map serve more than one purpose by allowing geographic context to be paired with different quantitative signals.

#### Time-Series Attribute Dropdown
This dropdown changes which metric is tracked over time for the currently pinned schools. It is useful for checking whether a group of schools behaves similarly over time across different measures.

#### Parallel Coordinates Attribute Multi-Select
This control allows the user to choose which dimensions appear in the parallel coordinates chart. It helps reduce clutter and makes the view more focused when only a subset of attributes is relevant to the question being explored.

### Header Controls
#### Year Selector
The year selector updates the single-year views so that the ranked dot plot, scatter plot, and parallel coordinates chart all reflect the same selected year. This keeps the dashboard synchronized and makes cross-chart comparisons more consistent.

#### Enable Imputation Button
This button is currently present as a placeholder for a planned feature. The intention is for it to eventually toggle whether missing values are filled in through an imputation strategy, but that behavior is not active in the current prototype.

#### Reset Pins Button
The reset button clears all pinned schools from the dashboard. This is useful after a user finishes one comparison task and wants to start a fresh selection workflow.

## How to Use the Dashboard
The dashboard is intended to support different kinds of users, so one useful way to think about it is through short user stories.

### User Story 1: A Family Comparing College Value
Imagine a student and their family trying to narrow down a large set of college options. They may begin by selecting a year and looking at the scatter plot to find schools that appear to offer a more attractive balance between net price and post-graduation earnings. From there, they can pin a few promising schools and watch those schools appear in the time-series chart, where they can compare how prices or outcomes have changed over time.

Next, they might use the ranked dot plot to see whether those same schools still look competitive when ranked directly by graduation rate, debt, or mobility rate. If they want to explore geography and distance as part of the decision, they can use the map to focus on a particular area or simply pin a group of nearby institutions. The parallel coordinates chart then helps them judge whether a school that looks good on one measure still seems balanced when finances, quality-of-outcome proxies, and selectivity-related variables are viewed together.

In this type of workflow, the dashboard acts less like a ranking site and more like a guided comparison tool. The family can move between broad screening, local selection, and detailed follow-up without losing sight of the same pinned schools.

### User Story 2: A University Administrator Benchmarking a School
Now imagine a university administrator who wants to understand how their institution appears relative to national competitors and peers. They may start by pinning their own school and then identifying nearby competitors in the scatter plot or ranked dot plot. If their institution looks strong on affordability but weaker on earnings, or vice versa, that pattern becomes visible immediately.

The administrator can then use the time-series chart to compare whether those gaps are stable or whether they have widened or narrowed over recent years. The parallel coordinates chart is especially useful in this setting because it shows whether a school's public image or standing is tied to only one strength or to a broader combination of attributes. Even in a prototype state, this workflow demonstrates how the dashboard could support benchmarking, messaging, and strategic comparison across a national set of institutions.

## Some Observations
It is important to state clearly that the current prototype does not use real college data at all. The values shown in the dashboard are entirely synthetic and are only being used to test layout, linking behavior, chart interactions, and the general storytelling flow of the interface. Any apparent pattern in the current version should therefore be treated as a demonstration of what the dashboard can show, not as a factual claim about any real institution.

That said, the prototype already suggests the kinds of observations the finished dashboard could support once real data is integrated. For example, we could identify schools that appear to offer stronger post-graduation earnings at a relatively lower price point, or schools that look similar in cost but differ sharply in graduation rate or debt burden. We could also compare whether a pinned group of schools moves together over time or whether one school's outcomes improve more quickly than its peers. In the full version, the map and multi-attribute views could further support observations about regional clusters, affordability-access tradeoffs, and which institutions seem unusually strong or weak relative to their broader profile.

## Things Left to Do
### Features Missing, In Progress, or Still Being Tested
- Activate the "Enable Imputation" control and connect it to a real missing-data workflow.
- Distinguish observed values from imputed values visually across charts.
- Expand the bubble map so it contributes more analytic value, potentially through a toggle with a similarity-based MDS view.
- Add more visual polish, including richer legends, clearer explanatory notes, stronger tooltips, and better hover coordination between charts.
- Implement more of the global filters proposed earlier, including region, control type, and size category.
- Replace synthetic map placement with real school coordinates.
- Add chart annotations or narrative callouts to make the storytelling flow more explicit.

### Data Collection, Cleaning, and Processing
- Collect the real source datasets, including College Scorecard, Opportunity Insights, and Niche-style contextual fields.
- Standardize formats and variable definitions across sources.
- Match institutions across datasets using identifiers and carefully review ambiguous school-name matches.
- Check year coverage for each variable and document which metrics are longitudinal versus snapshot-only.
- Profile missing values throughout the combined dataset.
- Decide when imputation is appropriate and when missingness should remain visible to the user.
- Validate that metric definitions remain consistent across years.
- Confirm that included schools satisfy the intended sampling and inclusion rules.
- Perform quality assurance on the final merged dataset so the dashboard rests on a reliable and interpretable data foundation.
