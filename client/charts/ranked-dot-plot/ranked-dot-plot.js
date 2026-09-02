import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import {
  getSharedNumericAttributes,
  getSharedSchoolData
} from "../../data-integration/scorecard-data.js";
import { enhanceSingleSelect } from "../custom-select.js";
import { bindHoverTooltip } from "../hover-tooltip.js";
import { getPinnedColorMap, subscribePinnedSchools, togglePinnedSchool } from "../pinned-schools-store.js";
import { initSelectedYear, subscribeSelectedYear } from "../selected-year-store.js";

const DEFAULT_DOT_COLOR = "#176b5c";
const DEFAULT_STEM_COLOR = "#9ab8ad";

export async function initRankedDotPlot(cardSelector) {
  const card = document.querySelector(cardSelector);

  if (!card) {
    return;
  }

  const placeholder = card.querySelector(".chart-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  card.innerHTML = `
    <div class="ranked-dot-plot-root" role="img" aria-label="Ranked dot plot showing one selected attribute for schools in the current year.">
      <div class="ranked-dot-plot-header">
        <div class="ranked-dot-plot-heading">
          <div class="ranked-dot-plot-title">Ranked Dot Plot</div>
          <div class="ranked-dot-plot-subtitle"></div>
        </div>
        <div class="ranked-dot-plot-controls">
          <label class="ranked-dot-plot-control-label" for="ranked-dot-plot-attribute-select">Attribute</label>
          <select class="ranked-dot-plot-control-select" id="ranked-dot-plot-attribute-select"></select>
        </div>
      </div>
      <svg class="ranked-dot-plot-svg"></svg>
    </div>
  `;

  const root = card.querySelector(".ranked-dot-plot-root");
  const subtitle = card.querySelector(".ranked-dot-plot-subtitle");
  const attributeSelect = card.querySelector("#ranked-dot-plot-attribute-select");
  const svg = d3.select(card).select(".ranked-dot-plot-svg");

  const attributes = await getSharedNumericAttributes();
  if (!attributes.length) {
    subtitle.textContent = "No numeric attributes found in the CSV.";
    return;
  }

  const attributeByKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));
  attributes.forEach((attribute) => {
    const option = document.createElement("option");
    option.value = attribute.key;
    option.textContent = attribute.label;
    attributeSelect.append(option);
  });

  let currentAttribute = attributes[0];
  let latestPinnedSchoolIds = new Set();
  let activeYear = null;
  let renderRequestId = 0;
  attributeSelect.value = currentAttribute.key;
  enhanceSingleSelect(attributeSelect);

  function updateAttributeAvailability(sharedData) {
    const availableByKey = new Map(
      attributes.map((attribute) => [
        attribute.key,
        sharedData.some((datum) => Number.isFinite(datum[attribute.key]))
      ])
    );

    [...attributeSelect.options].forEach((option) => {
      const isAvailable = availableByKey.get(option.value);
      option.disabled = !isAvailable;
      option.style.textDecoration = isAvailable ? "none" : "line-through";
    });

    if (!availableByKey.get(currentAttribute.key)) {
      const fallback = attributes.find((attribute) => availableByKey.get(attribute.key));
      if (fallback) {
        currentAttribute = fallback;
      }
    }

    attributeSelect.value = currentAttribute.key;
    return availableByKey;
  }

  function applyPinnedStyles(pinnedSchoolIds) {
    latestPinnedSchoolIds = new Set(pinnedSchoolIds);
    const pinnedColorMap = getPinnedColorMap(pinnedSchoolIds);

    svg
      .selectAll(".rank-line")
      .attr("stroke", (d) => pinnedColorMap.get(d.schoolId) || DEFAULT_STEM_COLOR)
      .attr("stroke-width", (d) => (pinnedColorMap.has(d.schoolId) ? 2.2 : 1.2));

    svg
      .selectAll(".rank-dot")
      .attr("fill", (d) => pinnedColorMap.get(d.schoolId) || DEFAULT_DOT_COLOR)
      .attr("stroke", (d) => {
        const color = pinnedColorMap.get(d.schoolId);
        return color ? d3.color(color).darker(0.7).formatHex() : "#0f4f45";
      })
      .attr("stroke-width", (d) => (pinnedColorMap.has(d.schoolId) ? 1 : 0.6))
      .attr("r", (d) => (pinnedColorMap.has(d.schoolId) ? 4 : 3.25));
  }

  async function renderRankedDotPlot(attribute, year) {
    const requestId = ++renderRequestId;
    const sharedData = await getSharedSchoolData(year);
    if (requestId !== renderRequestId) {
      return;
    }

    // Commit the requested selection before availability reconciliation so the
    // control state and rendered metric stay synchronized.
    currentAttribute = attribute;
    const availableByKey = updateAttributeAvailability(sharedData);
    if (!availableByKey.get(attribute.key)) {
      attribute = currentAttribute;
    }

    const rankedRows = sharedData.filter((datum) => Number.isFinite(datum[attribute.key]));

    currentAttribute = attribute;
    attributeSelect.value = currentAttribute.key;
    activeYear = year;
    subtitle.textContent = `${year}: ${rankedRows.length} schools ranked by ${attribute.label}`;

    if (!rankedRows.length) {
      svg.selectAll("*").remove();
      return;
    }

    const sortedData = [...rankedRows]
      .sort((a, b) => d3.descending(a[attribute.key], b[attribute.key]))
      .map((datum, index) => ({ ...datum, rank: index + 1 }));

    const rootBounds = root.getBoundingClientRect();
    const width = Math.max(240, rootBounds.width - 10);
    const height = Math.max(210, rootBounds.height - 56);

    const leftMargin = Math.min(96, Math.max(76, Math.round(width * 0.18)));
    const margin = { top: 10, right: 16, bottom: 46, left: leftMargin };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

    const chart = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const maxValue = d3.max(sortedData, (d) => d[attribute.key]) || 0;
    const x = d3
      .scaleLinear()
      .domain([0, maxValue])
      .nice()
      .range([0, innerWidth]);

    const y = d3
      .scaleBand()
      .domain(sortedData.map((d) => d.rank))
      .range([0, innerHeight])
      .padding(0.28);

    const rankTicks = sortedData
      .map((d) => d.rank)
      .filter((rank) => rank === 1 || rank === sortedData.length || rank % 5 === 0);

    chart
      .append("g")
      .selectAll("line")
      .data(x.ticks(5))
      .join("line")
      .attr("x1", (d) => x(d))
      .attr("x2", (d) => x(d))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#dce6df")
      .attr("stroke-width", 1);

    chart
      .append("g")
      .call(d3.axisLeft(y).tickValues(rankTicks).tickSize(0).tickPadding(10).tickFormat((d) => `#${d}`))
      .call((g) => g.select(".domain").attr("stroke", "#c9d9d0"))
      .call((g) => g.selectAll("text").attr("fill", "#3f5049").attr("font-size", 16));

    chart
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(attribute.axisTickFormat).tickPadding(8))
      .call((g) => g.select(".domain").attr("stroke", "#c9d9d0"))
      .call((g) => g.selectAll("text").attr("fill", "#53645d").attr("font-size", 16));

    chart
      .selectAll(".rank-line")
      .data(sortedData)
      .join("line")
      .attr("class", "rank-line")
      .attr("data-school-id", (d) => d.schoolId)
      .attr("x1", x(0))
      .attr("x2", (d) => x(d[attribute.key]))
      .attr("y1", (d) => (y(d.rank) || 0) + y.bandwidth() / 2)
      .attr("y2", (d) => (y(d.rank) || 0) + y.bandwidth() / 2)
      .attr("stroke", DEFAULT_STEM_COLOR)
      .attr("stroke-width", 1.2)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        togglePinnedSchool(d.schoolId, event);
      });

    const dots = chart
      .selectAll(".rank-dot")
      .data(sortedData)
      .join("circle")
      .attr("class", "rank-dot")
      .attr("data-school-id", (d) => d.schoolId)
      .attr("cx", (d) => x(d[attribute.key]))
      .attr("cy", (d) => (y(d.rank) || 0) + y.bandwidth() / 2)
      .attr("r", 3.25)
      .attr("fill", DEFAULT_DOT_COLOR)
      .attr("stroke", "#0f4f45")
      .attr("stroke-width", 0.6)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        togglePinnedSchool(d.schoolId, event);
      });

    bindHoverTooltip(
      dots,
      (event, datum) =>
        `#${datum.rank} ${datum.school}\n${attribute.label}: ${attribute.valueFormat(datum[attribute.key])}`
    );

    applyPinnedStyles(latestPinnedSchoolIds);
  }

  attributeSelect.addEventListener("change", (event) => {
    const nextAttribute = attributeByKey.get(event.target.value);
    if (!nextAttribute) {
      event.target.value = currentAttribute.key;
      return;
    }

    if (Number.isFinite(activeYear)) {
      void renderRankedDotPlot(nextAttribute, activeYear);
    }
  });

  await initSelectedYear();
  subscribeSelectedYear((year) => {
    void renderRankedDotPlot(currentAttribute, year);
  });

  subscribePinnedSchools(applyPinnedStyles);
}
