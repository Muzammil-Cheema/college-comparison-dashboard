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
    <div class="scatterplot-root" role="img" aria-label="Scatter plot showing net price versus median earnings for the shared 50-school sample.">
      <div class="scatterplot-title">Scatter Plot</div>
      <div class="scatterplot-subtitle"></div>
      <svg class="scatterplot-svg"></svg>
    </div>
  `;

  const root = card.querySelector(".scatterplot-root");
  const subtitle = card.querySelector(".scatterplot-subtitle");
  const svg = d3.select(card).select(".scatterplot-svg");

  let latestPinnedSchoolIds = new Set();
  let renderRequestId = 0;

  function applyPinnedStyles(pinnedSchoolIds) {
    latestPinnedSchoolIds = new Set(pinnedSchoolIds);
    const pinnedColorMap = getPinnedColorMap(pinnedSchoolIds);

    svg
      .selectAll(".scatter-point")
      .attr("fill", (d) => pinnedColorMap.get(d.schoolId) || DEFAULT_FILL)
      .attr("fill-opacity", (d) => (pinnedColorMap.has(d.schoolId) ? 0.92 : 0.72))
      .attr("stroke", (d) => {
        const color = pinnedColorMap.get(d.schoolId);
        return color ? d3.color(color).darker(0.7).formatHex() : DEFAULT_STROKE;
      })
      .attr("stroke-width", (d) => (pinnedColorMap.has(d.schoolId) ? 1.35 : 0.9));
  }

  async function renderScatterplot(year) {
    const requestId = ++renderRequestId;
    const data = await getSharedSchoolData(year);
    if (requestId !== renderRequestId) {
      return;
    }

    subtitle.textContent = `Shared fake data (${year}): Net Price vs. Median Earnings (${data.length} schools)`;

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
      .domain(d3.extent(data, (d) => d.netPrice))
      .nice()
      .range([0, innerWidth]);

    const y = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d.medianEarnings))
      .nice()
      .range([innerHeight, 0]);

    const xAxis = chart
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("$.2s")));

    xAxis.selectAll("text").attr("fill", "#53645d").attr("font-size", 16);
    xAxis.select(".domain").attr("stroke", "#c9d9d0");

    const yAxis = chart.append("g").call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("$.2s")));

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
          const pointX = x(datum.netPrice);
          const pointY = y(datum.medianEarnings);
          return pointX >= x0 && pointX <= x1 && pointY >= y0 && pointY <= y1;
        })
        .map((datum) => datum.schoolId);

      replacePinnedSchools(brushedIds, event.sourceEvent || event);
      brushLayer.call(brush.move, null);
    });

    const brushLayer = chart.append("g").attr("class", "scatter-brush").call(brush);

    chart
      .selectAll("circle")
      .data(data)
      .join("circle")
      .attr("class", "scatter-point")
      .attr("data-school-id", (d) => d.schoolId)
      .attr("cx", (d) => x(d.netPrice))
      .attr("cy", (d) => y(d.medianEarnings))
      .attr("r", 4.5)
      .attr("fill", DEFAULT_FILL)
      .attr("fill-opacity", 0.72)
      .attr("stroke", DEFAULT_STROKE)
      .attr("stroke-width", 0.9)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        togglePinnedSchool(d.schoolId, event);
      })
      .append("title")
      .text(
        (d) =>
          `${d.school}\nNet Price: ${d3.format("$,.0f")(d.netPrice)}\nEarnings: ${d3.format(
            "$,.0f"
          )(d.medianEarnings)}`
      );

    chart
      .append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 36)
      .attr("text-anchor", "middle")
      .attr("fill", "#53645d")
      .attr("font-size", 18)
      .text("Average Net Price");

    chart
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -52)
      .attr("text-anchor", "middle")
      .attr("fill", "#53645d")
      .attr("font-size", 18)
      .text("Median Earnings");

    applyPinnedStyles(latestPinnedSchoolIds);
  }

  subscribePinnedSchools(applyPinnedStyles);
  await initSelectedYear();
  subscribeSelectedYear((year) => {
    void renderScatterplot(year);
  });
}
