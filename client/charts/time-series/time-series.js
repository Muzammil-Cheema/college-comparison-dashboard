import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import {
  getSharedNumericAttributes,
  getSharedSchoolData,
  getSharedSchoolHistory,
  subscribeDatasetMode
} from "../../data-integration/scorecard-data.js";
import { enhanceSingleSelect } from "../custom-select.js";
import { bindHoverTooltip } from "../hover-tooltip.js";
import { MAX_PINNED_SCHOOLS, getPinnedColorMap, subscribePinnedSchools } from "../pinned-schools-store.js";

export async function initTimeSeries(cardSelector) {
  const card = document.querySelector(cardSelector);

  if (!card) {
    return;
  }

  const placeholder = card.querySelector(".chart-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  card.innerHTML = `
    <div class="time-series-root" role="img" aria-label="Time-series chart showing yearly attribute trends for selected schools from the pinned working set.">
      <div class="time-series-header">
        <div class="time-series-heading">
          <div class="time-series-title">Time Series</div>
          <div class="time-series-subtitle"></div>
        </div>
        <div class="time-series-controls">
          <label class="time-series-control-label" for="time-series-attribute-select">Attribute</label>
          <select class="time-series-control-select" id="time-series-attribute-select"></select>
        </div>
      </div>
      <div class="time-series-content"></div>
    </div>
  `;

  const root = card.querySelector(".time-series-root");
  const subtitle = root.querySelector(".time-series-subtitle");
  const content = root.querySelector(".time-series-content");
  const attributeSelect = root.querySelector("#time-series-attribute-select");
  enhanceSingleSelect(attributeSelect);

  let attributes = [];
  let attributeByKey = new Map();
  let activeAttribute = null;
  let latestPinnedSchoolIds = new Set();
  let historyBySchoolId = new Map();
  let schoolById = new Map();
  let yearExtent = [0, 1];
  let reloadRequestId = 0;

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

  function buildSeriesForAttribute(schoolId, attribute) {
    const historyValues = historyBySchoolId.get(schoolId) || [];
    const schoolRecord = schoolById.get(schoolId);
    const schoolName = historyValues[0]?.school || schoolRecord?.school || schoolId;

    if (!historyValues.length) {
      return null;
    }

    const values = historyValues
      .map((value) => ({ year: value.year, value: value[attribute.key] }))
      .filter((value) => Number.isFinite(value.value));

    if (!values.length) {
      return null;
    }

    return {
      schoolId,
      school: schoolName,
      values
    };
  }

  function renderPinnedSeries(pinnedSchoolIds) {
    latestPinnedSchoolIds = new Set(pinnedSchoolIds);

    if (!activeAttribute) {
      subtitle.textContent = "No numeric attributes available.";
      content.innerHTML = "";
      return;
    }

    const pinnedIds = [...pinnedSchoolIds];
    subtitle.textContent = `Pinned schools: ${pinnedIds.length}/${MAX_PINNED_SCHOOLS} (${activeAttribute.label} vs year)`;

    if (!pinnedIds.length) {
      content.innerHTML = `
        <div class="time-series-empty-state">
          <h2>Time Series</h2>
          <p>Pin some observations through the other charts to see time-series comparisons.</p>
        </div>
      `;
      return;
    }

    const selectedSeries = pinnedIds
      .map((schoolId) => buildSeriesForAttribute(schoolId, activeAttribute))
      .filter((series) => series && series.values.length > 0);

    if (!selectedSeries.length) {
      content.innerHTML = `
        <div class="time-series-empty-state">
          <h2>Time Series</h2>
          <p>No pinned schools have values for ${activeAttribute.label}.</p>
        </div>
      `;
      return;
    }

    content.innerHTML = `<svg class="time-series-svg"></svg>`;
    const svg = d3.select(content).select(".time-series-svg");

    const rootBounds = root.getBoundingClientRect();
    const width = Math.max(280, rootBounds.width - 10);
    const height = Math.max(220, rootBounds.height - 56);
    const margin = { top: 10, right: 20, bottom: 52, left: 76 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

    const chart = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const yValues = selectedSeries.flatMap((series) => series.values.map((value) => value.value));
    const yExtent = expandFlatDomain(d3.extent(yValues));

    const x = d3.scaleLinear().domain(yearExtent).range([0, innerWidth]);
    const y = d3
      .scaleLinear()
      .domain(yExtent)
      .nice()
      .range([innerHeight, 0]);

    chart
      .append("g")
      .selectAll("line")
      .data(y.ticks(5))
      .join("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "#dce6df")
      .attr("stroke-width", 1);

    chart
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")).tickPadding(8))
      .call((g) => g.select(".domain").attr("stroke", "#c9d9d0"))
      .call((g) => g.selectAll("text").attr("fill", "#53645d").attr("font-size", 16));

    chart
      .append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(activeAttribute.axisTickFormat).tickPadding(8))
      .call((g) => g.select(".domain").attr("stroke", "#c9d9d0"))
      .call((g) => g.selectAll("text").attr("fill", "#53645d").attr("font-size", 16));

    const pinnedColorMap = getPinnedColorMap(pinnedSchoolIds);

    const line = d3
      .line()
      .x((d) => x(d.year))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    const lineGroups = chart
      .append("g")
      .selectAll(".series-path")
      .data(selectedSeries)
      .join("path")
      .attr("class", "series-path")
      .attr("fill", "none")
      .attr("stroke", (series) => pinnedColorMap.get(series.schoolId) || "#176b5c")
      .attr("stroke-width", 2.2)
      .attr("stroke-opacity", 0.94)
      .attr("d", (series) => line(series.values));

    bindHoverTooltip(lineGroups, (event, series) => series.school);

    const points = chart
      .append("g")
      .selectAll(".series-points")
      .data(selectedSeries)
      .join("g")
      .attr("class", "series-points")
      .attr("fill", (series) => pinnedColorMap.get(series.schoolId) || "#176b5c")
      .selectAll("circle")
      .data((series) => series.values.map((value) => ({ ...value, school: series.school })))
      .join("circle")
      .attr("cx", (d) => x(d.year))
      .attr("cy", (d) => y(d.value))
      .attr("r", 3.5);

    bindHoverTooltip(
      points,
      (event, datum) => `${datum.school}\n${datum.year}: ${activeAttribute.tooltipFormat(datum.value)}`
    );
  }

  async function reloadSeriesData() {
    const requestId = ++reloadRequestId;

    const [history, schools, nextAttributes] = await Promise.all([
      getSharedSchoolHistory(),
      getSharedSchoolData(),
      getSharedNumericAttributes()
    ]);

    if (requestId !== reloadRequestId) {
      return;
    }

    attributes = nextAttributes;
    attributeByKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));

    const previousKey = activeAttribute?.key;
    activeAttribute = attributeByKey.get(previousKey) || attributes[0] || null;

    attributeSelect.replaceChildren();
    attributes.forEach((attribute) => {
      const option = document.createElement("option");
      option.value = attribute.key;
      option.textContent = attribute.label;
      attributeSelect.append(option);
    });

    if (activeAttribute) {
      attributeSelect.value = activeAttribute.key;
    }

    historyBySchoolId = d3.group(history, (d) => d.schoolId);
    historyBySchoolId.forEach((values) => {
      values.sort((a, b) => d3.ascending(a.year, b.year));
    });

    schoolById = new Map(schools.map((school) => [school.schoolId, school]));
    yearExtent = d3.extent(history, (d) => d.year);

    renderPinnedSeries(latestPinnedSchoolIds);
  }

  attributeSelect.addEventListener("change", (event) => {
    const nextAttribute = attributeByKey.get(event.target.value);
    if (!nextAttribute) {
      event.target.value = activeAttribute?.key || "";
      return;
    }

    activeAttribute = nextAttribute;
    renderPinnedSeries(latestPinnedSchoolIds);
  });

  subscribePinnedSchools(renderPinnedSeries);
  subscribeDatasetMode(() => {
    void reloadSeriesData();
  });
}
