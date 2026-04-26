import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getSharedSchoolData } from "../shared-data.js";
import {
  getPinnedColorMap,
  replacePinnedSchools,
  subscribePinnedSchools,
  togglePinnedSchool
} from "../pinned-schools-store.js";
import { initSelectedYear, subscribeSelectedYear } from "../selected-year-store.js";

const DEFAULT_FILL = "#176b5c";
const DEFAULT_STROKE = "#0f4f45";
const DEFAULT_X_ATTRIBUTE = "netPrice";
const DEFAULT_Y_ATTRIBUTE = "medianEarnings";

const SCATTER_ATTRIBUTES = [
  { key: "netPrice", label: "Net Price", axisTickFormat: d3.format("$.2s"), valueFormat: d3.format("$,.0f") },
  {
    key: "graduationRate",
    label: "Graduation Rate",
    axisTickFormat: d3.format(".0%"),
    valueFormat: d3.format(".1%")
  },
  { key: "medianDebt", label: "Median Debt", axisTickFormat: d3.format("$.2s"), valueFormat: d3.format("$,.0f") },
  {
    key: "medianEarnings",
    label: "Median Earnings",
    axisTickFormat: d3.format("$.2s"),
    valueFormat: d3.format("$,.0f")
  },
  { key: "mobilityRate", label: "Mobility Rate", axisTickFormat: d3.format(".1%"), valueFormat: d3.format(".1%") },
  {
    key: "admissionRate",
    label: "Admission Rate",
    axisTickFormat: d3.format(".0%"),
    valueFormat: d3.format(".1%")
  }
];

const SCATTER_ATTRIBUTE_BY_KEY = new Map(SCATTER_ATTRIBUTES.map((attribute) => [attribute.key, attribute]));

export async function initScatterplot(cardSelector) {
  const card = document.querySelector(cardSelector);
  if (!card) {
    return;
  }

  const existingPlaceholder = card.querySelector(".chart-placeholder");
  if (existingPlaceholder) {
    existingPlaceholder.remove();
  }

  card.innerHTML = `
    <div class="scatterplot-root" role="img" aria-label="Scatter plot comparing selected attributes for the shared school sample.">
      <div class="scatterplot-header">
        <div class="scatterplot-heading">
          <div class="scatterplot-title">Scatter Plot</div>
          <div class="scatterplot-subtitle"></div>
        </div>
        <div class="scatterplot-controls">
          <div class="scatterplot-control-group">
            <label class="scatterplot-control-label" for="scatterplot-x-attribute-select">X</label>
            <select class="scatterplot-control-select" id="scatterplot-x-attribute-select"></select>
          </div>
          <div class="scatterplot-control-group">
            <label class="scatterplot-control-label" for="scatterplot-y-attribute-select">Y</label>
            <select class="scatterplot-control-select" id="scatterplot-y-attribute-select"></select>
          </div>
        </div>
      </div>
      <svg class="scatterplot-svg"></svg>
    </div>
  `;

  const root = card.querySelector(".scatterplot-root");
  const subtitle = card.querySelector(".scatterplot-subtitle");
  const xSelect = card.querySelector("#scatterplot-x-attribute-select");
  const ySelect = card.querySelector("#scatterplot-y-attribute-select");
  const svg = d3.select(card).select(".scatterplot-svg");

  SCATTER_ATTRIBUTES.forEach((attribute) => {
    const xOption = document.createElement("option");
    xOption.value = attribute.key;
    xOption.textContent = attribute.label;
    xSelect.append(xOption);

    const yOption = document.createElement("option");
    yOption.value = attribute.key;
    yOption.textContent = attribute.label;
    ySelect.append(yOption);
  });

  let activeXAttribute = SCATTER_ATTRIBUTE_BY_KEY.get(DEFAULT_X_ATTRIBUTE);
  let activeYAttribute = SCATTER_ATTRIBUTE_BY_KEY.get(DEFAULT_Y_ATTRIBUTE);
  let activeYear = null;
  let latestPinnedSchoolIds = new Set();
  let renderRequestId = 0;
  xSelect.value = activeXAttribute.key;
  ySelect.value = activeYAttribute.key;

  function applyPinnedStyles(pinnedSchoolIds) {
    latestPinnedSchoolIds = new Set(pinnedSchoolIds);
    const pinnedColorMap = getPinnedColorMap(pinnedSchoolIds);

    svg
      .selectAll(".scatter-point")
      .attr("fill", (datum) => pinnedColorMap.get(datum.schoolId) || DEFAULT_FILL)
      .attr("fill-opacity", (datum) => (pinnedColorMap.has(datum.schoolId) ? 0.92 : 0.72))
      .attr("stroke", (datum) => {
        const color = pinnedColorMap.get(datum.schoolId);
        return color ? d3.color(color).darker(0.7).formatHex() : DEFAULT_STROKE;
      })
      .attr("stroke-width", (datum) => (pinnedColorMap.has(datum.schoolId) ? 1.35 : 0.9));
  }

  async function renderScatterplot(year) {
    const requestId = ++renderRequestId;
    const data = await getSharedSchoolData(year);
    if (requestId !== renderRequestId) {
      return;
    }

    activeYear = year;
    subtitle.textContent = `Shared fake data (${year}): ${activeYAttribute.label} vs ${activeXAttribute.label} (${data.length} schools)`;

    svg.selectAll("*").remove();
    if (!data.length) {
      return;
    }

    const rootBounds = root.getBoundingClientRect();
    const width = Math.max(260, rootBounds.width - 10);
    const height = Math.max(210, rootBounds.height - 56);

    const margin = { top: 8, right: 16, bottom: 52, left: 70 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

    const chart = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleLinear()
      .domain(d3.extent(data, (datum) => Number(datum[activeXAttribute.key])))
      .nice()
      .range([0, innerWidth]);

    const y = d3
      .scaleLinear()
      .domain(d3.extent(data, (datum) => Number(datum[activeYAttribute.key])))
      .nice()
      .range([innerHeight, 0]);

    const xAxis = chart
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(activeXAttribute.axisTickFormat));

    xAxis.selectAll("text").attr("fill", "#53645d").attr("font-size", 16);
    xAxis.select(".domain").attr("stroke", "#c9d9d0");

    const yAxis = chart
      .append("g")
      .call(d3.axisLeft(y).ticks(6).tickFormat(activeYAttribute.axisTickFormat));

    yAxis.selectAll("text").attr("fill", "#53645d").attr("font-size", 16);
    yAxis.select(".domain").attr("stroke", "#c9d9d0");

    const brush = d3
      .brush()
      .extent([
        [0, 0],
        [innerWidth, innerHeight]
      ])
      .on("end", (event) => {
        if (!event.selection) {
          return;
        }

        const [[x0, y0], [x1, y1]] = event.selection;
        const brushedIds = data
          .filter((datum) => {
            const pointX = x(Number(datum[activeXAttribute.key]));
            const pointY = y(Number(datum[activeYAttribute.key]));
            return pointX >= x0 && pointX <= x1 && pointY >= y0 && pointY <= y1;
          })
          .map((datum) => datum.schoolId);

        replacePinnedSchools(brushedIds, event.sourceEvent || event);
        brushLayer.call(brush.move, null);
      });

    const brushLayer = chart.append("g").attr("class", "scatter-brush").call(brush);

    chart
      .selectAll(".scatter-point")
      .data(data)
      .join("circle")
      .attr("class", "scatter-point")
      .attr("data-school-id", (datum) => datum.schoolId)
      .attr("cx", (datum) => x(Number(datum[activeXAttribute.key])))
      .attr("cy", (datum) => y(Number(datum[activeYAttribute.key])))
      .attr("r", 4.5)
      .attr("fill", DEFAULT_FILL)
      .attr("fill-opacity", 0.72)
      .attr("stroke", DEFAULT_STROKE)
      .attr("stroke-width", 0.9)
      .style("cursor", "pointer")
      .on("click", (event, datum) => {
        togglePinnedSchool(datum.schoolId, event);
      })
      .append("title")
      .text(
        (datum) =>
          `${datum.school}\n${activeXAttribute.label}: ${activeXAttribute.valueFormat(
            Number(datum[activeXAttribute.key])
          )}\n${activeYAttribute.label}: ${activeYAttribute.valueFormat(Number(datum[activeYAttribute.key]))}`
      );

    chart
      .append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 36)
      .attr("text-anchor", "middle")
      .attr("fill", "#53645d")
      .attr("font-size", 18)
      .text(activeXAttribute.label);

    chart
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -52)
      .attr("text-anchor", "middle")
      .attr("fill", "#53645d")
      .attr("font-size", 18)
      .text(activeYAttribute.label);

    applyPinnedStyles(latestPinnedSchoolIds);
  }

  xSelect.addEventListener("change", (event) => {
    const nextAttribute = SCATTER_ATTRIBUTE_BY_KEY.get(event.target.value);
    if (!nextAttribute) {
      event.target.value = activeXAttribute.key;
      return;
    }

    activeXAttribute = nextAttribute;
    if (Number.isFinite(activeYear)) {
      void renderScatterplot(activeYear);
    }
  });

  ySelect.addEventListener("change", (event) => {
    const nextAttribute = SCATTER_ATTRIBUTE_BY_KEY.get(event.target.value);
    if (!nextAttribute) {
      event.target.value = activeYAttribute.key;
      return;
    }

    activeYAttribute = nextAttribute;
    if (Number.isFinite(activeYear)) {
      void renderScatterplot(activeYear);
    }
  });

  subscribePinnedSchools(applyPinnedStyles);
  await initSelectedYear();
  subscribeSelectedYear((year) => {
    void renderScatterplot(year);
  });
}
