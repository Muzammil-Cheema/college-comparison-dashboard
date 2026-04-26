import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getSharedSchoolData } from "../shared-data.js";
import { getPinnedColorMap, subscribePinnedSchools, togglePinnedSchool } from "../pinned-schools-store.js";
import { initSelectedYear, subscribeSelectedYear } from "../selected-year-store.js";

const DEFAULT_DOT_COLOR = "#176b5c";
const DEFAULT_STEM_COLOR = "#9ab8ad";
const DEFAULT_SELECTED_ATTRIBUTE = "graduationRate";

const ATTRIBUTE_OPTIONS = [
  {
    key: "netPrice",
    label: "Net Price",
    rankable: true,
    axisTickFormat: d3.format("$.2s"),
    formatValue: d3.format("$,.0f")
  },
  {
    key: "graduationRate",
    label: "Graduation Rate",
    rankable: true,
    axisTickFormat: d3.format(".0%"),
    formatValue: d3.format(".1%")
  },
  {
    key: "medianDebt",
    label: "Median Debt",
    rankable: true,
    axisTickFormat: d3.format("$.2s"),
    formatValue: d3.format("$,.0f")
  },
  {
    key: "medianEarnings",
    label: "Median Earnings",
    rankable: true,
    axisTickFormat: d3.format("$.2s"),
    formatValue: d3.format("$,.0f")
  },
  {
    key: "mobilityRate",
    label: "Mobility Rate",
    rankable: true,
    axisTickFormat: d3.format(".1%"),
    formatValue: d3.format(".1%")
  },
  {
    key: "admissionRate",
    label: "Admission Rate",
    rankable: true,
    axisTickFormat: d3.format(".0%"),
    formatValue: d3.format(".1%")
  }
];

const ATTRIBUTE_BY_KEY = new Map(ATTRIBUTE_OPTIONS.map((attribute) => [attribute.key, attribute]));

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
    <div class="ranked-dot-plot-root" role="img" aria-label="Ranked dot plot showing graduation rate for schools from the shared sample dataset.">
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

  ATTRIBUTE_OPTIONS.forEach((attribute) => {
    const option = document.createElement("option");
    option.value = attribute.key;
    option.textContent = attribute.rankable ? attribute.label : `${attribute.label} (not rankable)`;
    option.disabled = !attribute.rankable;
    attributeSelect.append(option);
  });

  let currentAttribute = ATTRIBUTE_BY_KEY.get(DEFAULT_SELECTED_ATTRIBUTE);
  let latestPinnedSchoolIds = new Set();
  let activeYear = null;
  let renderRequestId = 0;
  attributeSelect.value = currentAttribute.key;

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

    currentAttribute = attribute;
    activeYear = year;
    subtitle.textContent = `Shared fake data (${year}): ${sharedData.length} schools ranked by ${attribute.label}`;

    if (!sharedData.length) {
      svg.selectAll("*").remove();
      return;
    }

    const sortedData = [...sharedData]
      .sort((a, b) => d3.descending(Number(a[attribute.key]), Number(b[attribute.key])))
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

    const maxValue = d3.max(sortedData, (d) => Number(d[attribute.key])) || 0;
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
      .attr("x2", (d) => x(Number(d[attribute.key])))
      .attr("y1", (d) => (y(d.rank) || 0) + y.bandwidth() / 2)
      .attr("y2", (d) => (y(d.rank) || 0) + y.bandwidth() / 2)
      .attr("stroke", DEFAULT_STEM_COLOR)
      .attr("stroke-width", 1.2)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        togglePinnedSchool(d.schoolId, event);
      });

    chart
      .selectAll(".rank-dot")
      .data(sortedData)
      .join("circle")
      .attr("class", "rank-dot")
      .attr("data-school-id", (d) => d.schoolId)
      .attr("cx", (d) => x(Number(d[attribute.key])))
      .attr("cy", (d) => (y(d.rank) || 0) + y.bandwidth() / 2)
      .attr("r", 3.25)
      .attr("fill", DEFAULT_DOT_COLOR)
      .attr("stroke", "#0f4f45")
      .attr("stroke-width", 0.6)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        togglePinnedSchool(d.schoolId, event);
      })
      .append("title")
      .text(
        (d) => `#${d.rank} ${d.school}\n${attribute.label}: ${attribute.formatValue(Number(d[attribute.key]))}`
      );

    applyPinnedStyles(latestPinnedSchoolIds);
  }

  attributeSelect.addEventListener("change", (event) => {
    const nextAttribute = ATTRIBUTE_BY_KEY.get(event.target.value);
    if (!nextAttribute || !nextAttribute.rankable) {
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
