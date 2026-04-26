import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getSharedSchoolData } from "../shared-data.js";
import { getPinnedColorMap, subscribePinnedSchools, togglePinnedSchool } from "../pinned-schools-store.js";
import { initSelectedYear, subscribeSelectedYear } from "../selected-year-store.js";

const DEFAULT_LINE_COLOR = "#176b5c";

const DIMENSIONS = [
  { key: "netPrice", label: "Net Price", formatter: d3.format("$.2s") },
  { key: "graduationRate", label: "Graduation Rate", formatter: d3.format(".0%") },
  { key: "medianDebt", label: "Median Debt", formatter: d3.format("$.2s") },
  { key: "medianEarnings", label: "Median Earnings", formatter: d3.format("$.2s") },
  { key: "mobilityRate", label: "Mobility Rate", formatter: d3.format(".1%") },
  { key: "admissionRate", label: "Admission Rate", formatter: d3.format(".0%") }
];

function buildLinePath(datum, dimensions, xScale, yScales) {
  return d3.line()(
    dimensions.map((dimension) => [xScale(dimension.key), yScales[dimension.key](datum[dimension.key])])
  );
}

function expandFlatDomain([min, max]) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1];
  }

  if (min === max) {
    const basePadding = Math.max(Math.abs(min) * 0.05, 0.05);
    return [min - basePadding, max + basePadding];
  }

  return [min, max];
}

export async function initParallelCoordinates(cardSelector) {
  const card = document.querySelector(cardSelector);
  if (!card) {
    return;
  }

  const placeholder = card.querySelector(".chart-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  card.innerHTML = `
    <div class="parallel-coordinates-root" role="img" aria-label="Parallel coordinates chart with selectable dimensions and observations from the shared sample dataset.">
      <div class="parallel-coordinates-header">
        <div class="parallel-coordinates-heading">
          <div class="parallel-coordinates-title">Parallel Coordinates</div>
          <div class="parallel-coordinates-subtitle"></div>
        </div>
        <div class="parallel-coordinates-controls">
          <label class="parallel-coordinates-control-label">Attributes</label>
          <details class="parallel-coordinates-multiselect">
            <summary class="parallel-coordinates-multiselect-summary"></summary>
            <div class="parallel-coordinates-multiselect-options"></div>
          </details>
        </div>
      </div>
      <svg class="parallel-coordinates-svg"></svg>
    </div>
  `;

  const root = card.querySelector(".parallel-coordinates-root");
  const subtitle = card.querySelector(".parallel-coordinates-subtitle");
  const header = card.querySelector(".parallel-coordinates-header");
  const multiselectSummary = card.querySelector(".parallel-coordinates-multiselect-summary");
  const multiselectOptions = card.querySelector(".parallel-coordinates-multiselect-options");
  const svg = d3.select(card).select(".parallel-coordinates-svg");

  const selectedDimensionKeys = new Set(DIMENSIONS.map((dimension) => dimension.key));
  let latestPinnedSchoolIds = new Set();
  let activeYear = null;
  let renderRequestId = 0;

  function getActiveDimensions() {
    return DIMENSIONS.filter((dimension) => selectedDimensionKeys.has(dimension.key));
  }

  function updateMultiselectSummary() {
    const selectedDimensions = getActiveDimensions();
    if (selectedDimensions.length === DIMENSIONS.length) {
      multiselectSummary.textContent = `All ${DIMENSIONS.length} attributes`;
      return;
    }

    multiselectSummary.textContent = `${selectedDimensions.length} selected`;
  }

  DIMENSIONS.forEach((dimension) => {
    const optionId = `pcp-dimension-${dimension.key}`;
    const optionLabel = document.createElement("label");
    optionLabel.className = "parallel-coordinates-multiselect-option";
    optionLabel.setAttribute("for", optionId);

    const optionInput = document.createElement("input");
    optionInput.type = "checkbox";
    optionInput.id = optionId;
    optionInput.value = dimension.key;
    optionInput.checked = true;

    const optionText = document.createElement("span");
    optionText.textContent = dimension.label;

    optionInput.addEventListener("change", () => {
      if (optionInput.checked) {
        selectedDimensionKeys.add(dimension.key);
      } else {
        selectedDimensionKeys.delete(dimension.key);
      }

      if (!selectedDimensionKeys.size) {
        selectedDimensionKeys.add(dimension.key);
        optionInput.checked = true;
      }

      updateMultiselectSummary();
      if (Number.isFinite(activeYear)) {
        void renderParallelCoordinates(activeYear);
      }
    });

    optionLabel.append(optionInput, optionText);
    multiselectOptions.append(optionLabel);
  });
  updateMultiselectSummary();

  function applyPinnedStyles(pinnedSchoolIds) {
    latestPinnedSchoolIds = new Set(pinnedSchoolIds);
    const pinnedColorMap = getPinnedColorMap(pinnedSchoolIds);

    svg
      .selectAll(".pcp-school-line")
      .attr("stroke", (datum) => pinnedColorMap.get(datum.schoolId) || DEFAULT_LINE_COLOR)
      .attr("stroke-opacity", (datum) => (pinnedColorMap.has(datum.schoolId) ? 0.92 : 0.2))
      .attr("stroke-width", (datum) => (pinnedColorMap.has(datum.schoolId) ? 2.4 : 1.5));

    svg.selectAll(".pcp-school-line").sort((a, b) => {
      const aPinned = pinnedColorMap.has(a.schoolId) ? 1 : 0;
      const bPinned = pinnedColorMap.has(b.schoolId) ? 1 : 0;
      return aPinned - bPinned;
    });
  }

  async function renderParallelCoordinates(year) {
    const requestId = ++renderRequestId;
    const data = await getSharedSchoolData(year);
    if (requestId !== renderRequestId) {
      return;
    }
    activeYear = year;
    const activeDimensions = getActiveDimensions();

    subtitle.textContent = `Shared fake data (${year}): ${activeDimensions.length} attributes across ${data.length} schools`;

    svg.selectAll("*").remove();
    if (!data.length || !activeDimensions.length) {
      return;
    }

    const rootBounds = root.getBoundingClientRect();
    const headerHeight = header.getBoundingClientRect().height || 56;
    const width = Math.max(500, rootBounds.width - 10);
    const height = Math.max(220, rootBounds.height - headerHeight - 10);
    const margin = { top: 24, right: 24, bottom: 18, left: 24 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

    const chart = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const fullDimensionStep =
      DIMENSIONS.length > 1 ? innerWidth / (DIMENSIONS.length - 1) : innerWidth;
    const activeSpanWidth =
      activeDimensions.length > 1 ? fullDimensionStep * (activeDimensions.length - 1) : 0;
    const activeStart = (innerWidth - activeSpanWidth) / 2;
    const activeEnd = activeStart + activeSpanWidth;

    const xScale = d3
      .scalePoint()
      .domain(activeDimensions.map((dimension) => dimension.key))
      .range([activeStart, activeEnd])
      .padding(0);

    const yScales = Object.fromEntries(
      activeDimensions.map((dimension) => {
        const values = data.map((datum) => Number(datum[dimension.key])).filter(Number.isFinite);
        const domain = expandFlatDomain(d3.extent(values));
        return [
          dimension.key,
          d3
            .scaleLinear()
            .domain(domain)
            .nice()
            .range([innerHeight, 0])
        ];
      })
    );

    chart
      .append("g")
      .selectAll("path")
      .data(data)
      .join("path")
      .attr("class", "pcp-school-line")
      .attr("data-school-id", (datum) => datum.schoolId)
      .attr("d", (datum) => buildLinePath(datum, activeDimensions, xScale, yScales))
      .attr("fill", "none")
      .attr("stroke", DEFAULT_LINE_COLOR)
      .attr("stroke-opacity", 0.2)
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("click", (event, datum) => {
        togglePinnedSchool(datum.schoolId, event);
      })
      .append("title")
      .text((datum) => datum.school);

    const dimensionGroups = chart
      .append("g")
      .selectAll(".pcp-dimension")
      .data(activeDimensions)
      .join("g")
      .attr("class", "pcp-dimension")
      .attr("transform", (dimension) => `translate(${xScale(dimension.key)},0)`);

    dimensionGroups
      .append("g")
      .each(function renderAxis(dimension) {
        d3.select(this).call(d3.axisLeft(yScales[dimension.key]).ticks(5).tickFormat(dimension.formatter));
      })
      .call((g) => g.select(".domain").attr("stroke", "#c9d9d0"))
      .call((g) => g.selectAll(".tick line").attr("stroke", "#c9d9d0"))
      .call((g) => g.selectAll(".tick text").attr("fill", "#3f5049").attr("font-size", 15));

    dimensionGroups
      .append("text")
      .attr("x", 0)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .attr("fill", "#1c2a25")
      .attr("font-size", 16)
      .attr("font-weight", 600)
      .text((dimension) => dimension.label);

    applyPinnedStyles(latestPinnedSchoolIds);
  }

  subscribePinnedSchools(applyPinnedStyles);
  await initSelectedYear();
  subscribeSelectedYear((year) => {
    void renderParallelCoordinates(year);
  });
}
