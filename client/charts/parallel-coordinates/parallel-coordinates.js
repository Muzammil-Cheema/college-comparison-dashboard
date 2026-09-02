import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import {
  getSharedNumericAttributes,
  getSharedSchoolData
} from "../../data-integration/scorecard-data.js";
import { bindHoverTooltip } from "../hover-tooltip.js";
import { getPinnedColorMap, subscribePinnedSchools, togglePinnedSchool } from "../pinned-schools-store.js";
import { initSelectedYear, subscribeSelectedYear } from "../selected-year-store.js";

const DEFAULT_LINE_COLOR = "#176b5c";
const MAX_PCP_SVG_WIDTH = 1320;
const MAX_PCP_SVG_HEIGHT = 640;
const BASE_AXIS_SPACING = 136;
const ALL_ATTRIBUTES_AXIS_SPACING = 116;
const AXIS_LABEL_ROTATION_DEGREES = -15;
const AXIS_LABEL_BAND_HEIGHT = 58;

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

function formatDimensionValue(dimension, value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  const formatter = dimension.tooltipFormat || dimension.valueFormat || dimension.axisTickFormat;
  if (typeof formatter === "function") {
    return formatter(value);
  }

  return d3.format(",.3f")(value);
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

  const dimensions = await getSharedNumericAttributes();
  if (!dimensions.length) {
    card.innerHTML = `<div class="parallel-coordinates-root"><div class="bubble-map-error">No numeric attributes found in CSV.</div></div>`;
    return;
  }

  card.innerHTML = `
    <div class="parallel-coordinates-root" role="img" aria-label="Parallel coordinates chart with selectable dimensions and observations from the current dataset.">
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
  const checkboxByDimensionKey = new Map();

  const selectedDimensionKeys = new Set(dimensions.map((dimension) => dimension.key));
  let latestPinnedSchoolIds = new Set();
  let activeYear = null;
  let renderRequestId = 0;

  function getActiveDimensions() {
    return dimensions.filter((dimension) => selectedDimensionKeys.has(dimension.key));
  }

  function updateMultiselectSummary() {
    const selectedDimensions = getActiveDimensions();
    const enabledDimensionCount = dimensions.filter((dimension) => {
      const checkbox = checkboxByDimensionKey.get(dimension.key);
      return checkbox ? !checkbox.disabled : true;
    }).length;

    if (selectedDimensions.length === enabledDimensionCount && enabledDimensionCount === dimensions.length) {
      multiselectSummary.textContent = `All ${dimensions.length} attributes`;
      return;
    }

    if (!enabledDimensionCount) {
      multiselectSummary.textContent = "No available attributes";
      return;
    }

    if (selectedDimensions.length === enabledDimensionCount) {
      multiselectSummary.textContent = `All ${enabledDimensionCount} available`;
      return;
    }

    multiselectSummary.textContent = `${selectedDimensions.length} selected`;
  }

  dimensions.forEach((dimension) => {
    const optionId = `pcp-dimension-${dimension.key}`;
    const optionLabel = document.createElement("label");
    optionLabel.className = "parallel-coordinates-multiselect-option";
    optionLabel.setAttribute("for", optionId);

    const optionInput = document.createElement("input");
    optionInput.type = "checkbox";
    optionInput.id = optionId;
    optionInput.value = dimension.key;
    optionInput.checked = true;
    checkboxByDimensionKey.set(dimension.key, optionInput);

    const optionText = document.createElement("span");
    optionText.textContent = dimension.label;

    optionInput.addEventListener("change", () => {
      if (optionInput.disabled) {
        optionInput.checked = false;
        return;
      }

      if (optionInput.checked) {
        selectedDimensionKeys.add(dimension.key);
      } else {
        selectedDimensionKeys.delete(dimension.key);
      }

      if (!selectedDimensionKeys.size) {
        const fallbackDimension = dimensions.find((candidate) => {
          const candidateInput = checkboxByDimensionKey.get(candidate.key);
          return candidateInput && !candidateInput.disabled;
        });
        if (fallbackDimension) {
          selectedDimensionKeys.add(fallbackDimension.key);
          const fallbackInput = checkboxByDimensionKey.get(fallbackDimension.key);
          if (fallbackInput) {
            fallbackInput.checked = true;
          }
        }
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

  function updateDimensionAvailability(rawData) {
    const availableByKey = new Map(
      dimensions.map((dimension) => [
        dimension.key,
        rawData.some((datum) => Number.isFinite(datum[dimension.key]))
      ])
    );

    dimensions.forEach((dimension) => {
      const input = checkboxByDimensionKey.get(dimension.key);
      if (!input) {
        return;
      }

      const isAvailable = availableByKey.get(dimension.key);
      const label = input.closest(".parallel-coordinates-multiselect-option");
      input.disabled = !isAvailable;
      if (!isAvailable) {
        input.checked = false;
        selectedDimensionKeys.delete(dimension.key);
      }

      if (label) {
        label.classList.toggle("is-disabled", !isAvailable);
      }
    });

    if (!selectedDimensionKeys.size) {
      const fallbackDimension = dimensions.find((dimension) => availableByKey.get(dimension.key));
      if (fallbackDimension) {
        selectedDimensionKeys.add(fallbackDimension.key);
        const fallbackInput = checkboxByDimensionKey.get(fallbackDimension.key);
        if (fallbackInput) {
          fallbackInput.checked = true;
        }
      }
    }

    updateMultiselectSummary();
  }

  function resetDimensionSelectionToAll() {
    selectedDimensionKeys.clear();
    dimensions.forEach((dimension) => {
      selectedDimensionKeys.add(dimension.key);
      const input = checkboxByDimensionKey.get(dimension.key);
      if (input) {
        input.checked = true;
      }
    });
    updateMultiselectSummary();
  }

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

  async function renderParallelCoordinates(year, options = {}) {
    const { resetSelectionToAll = false } = options;
    const requestId = ++renderRequestId;
    const rawData = await getSharedSchoolData(year);
    if (requestId !== renderRequestId) {
      return;
    }

    activeYear = year;
    if (resetSelectionToAll) {
      resetDimensionSelectionToAll();
    }
    updateDimensionAvailability(rawData);
    const activeDimensions = getActiveDimensions();
    const data = rawData.filter((datum) =>
      activeDimensions.every((dimension) => Number.isFinite(datum[dimension.key]))
    );

    if (!activeDimensions.length) {
      subtitle.textContent = `${year}: no attributes have usable values in this year`;
      svg.selectAll("*").remove();
      return;
    }

    subtitle.textContent = `${year}: ${activeDimensions.length} attributes across ${data.length} schools with complete values`;

    svg.selectAll("*").remove();
    if (!data.length || !activeDimensions.length) {
      return;
    }

    const rootBounds = root.getBoundingClientRect();
    const headerHeight = header.getBoundingClientRect().height || 56;
    const availableWidth = Math.max(260, rootBounds.width - 10);
    const availableHeight = Math.max(220, rootBounds.height - headerHeight - 4);
    const width = Math.min(MAX_PCP_SVG_WIDTH, availableWidth);
    const height = Math.min(MAX_PCP_SVG_HEIGHT, availableHeight);
    const showingAllAttributes = activeDimensions.length === dimensions.length;
    const sideInset = showingAllAttributes ? 3 : 0;
    const margin = { top: AXIS_LABEL_BAND_HEIGHT, right: sideInset, bottom: 14, left: sideInset };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

    const chart = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const preferredAxisSpacing = showingAllAttributes
      ? ALL_ATTRIBUTES_AXIS_SPACING
      : BASE_AXIS_SPACING;
    const preferredActiveSpan =
      activeDimensions.length > 1
        ? preferredAxisSpacing * (activeDimensions.length - 1)
        : 0;
    const isCondensed = preferredActiveSpan > innerWidth;

    const xScale = d3
      .scalePoint()
      .domain(activeDimensions.map((dimension) => dimension.key))
      .range([0, innerWidth])
      .padding(0);

    const yScales = Object.fromEntries(
      activeDimensions.map((dimension) => {
        const values = data.map((datum) => datum[dimension.key]).filter(Number.isFinite);
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

    const lines = chart
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
      });

    bindHoverTooltip(lines, (event, datum) => {
      const valueLines = activeDimensions.map(
        (dimension) =>
          `${dimension.label}: ${formatDimensionValue(dimension, Number(datum[dimension.key]))}`
      );
      return `${datum.school}\n${valueLines.join("\n")}`;
    });

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
        d3.select(this).call(d3.axisLeft(yScales[dimension.key]).ticks(5).tickFormat(dimension.axisTickFormat));
      })
      .call((g) => g.select(".domain").attr("stroke", "#c9d9d0"))
      .call((g) => g.selectAll(".tick line").attr("stroke", "#c9d9d0"))
      .call((g) => g.selectAll(".tick text").attr("fill", "#3f5049").attr("font-size", 15));

    dimensionGroups
      .append("text")
      .attr("x", 5)
      .attr("y", -11)
      .attr("text-anchor", "start")
      .attr("transform", `rotate(${AXIS_LABEL_ROTATION_DEGREES})`)
      .attr("fill", "#1c2a25")
      .attr("font-size", 15)
      .attr("font-weight", 600)
      .text((dimension) => dimension.label);

    if (isCondensed) {
      subtitle.textContent = `${subtitle.textContent} (condensed to fit)`;
    }

    applyPinnedStyles(latestPinnedSchoolIds);
  }

  subscribePinnedSchools(applyPinnedStyles);
  await initSelectedYear();
  subscribeSelectedYear((year) => {
    void renderParallelCoordinates(year, { resetSelectionToAll: true });
  });
}
