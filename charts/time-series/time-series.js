import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getSharedEarningsHistory } from "../shared-data.js";

export async function initTimeSeries(cardSelector) {
  const card = document.querySelector(cardSelector);

  if (!card) {
    return;
  }

  const placeholder = card.querySelector(".chart-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  const history = await getSharedEarningsHistory();
  if (!history.length) {
    return;
  }

  const yearlyData = d3
    .rollups(
      history,
      (values) => Math.round(d3.mean(values, (d) => d.earnings) || 0),
      (d) => d.year
    )
    .map(([year, earnings]) => ({ year: Number(year), earnings }))
    .sort((a, b) => d3.ascending(a.year, b.year));

  card.innerHTML = `
    <div class="time-series-root" role="img" aria-label="Time-series line chart showing average earnings over time for the shared school sample.">
      <div class="time-series-title">Time Series</div>
      <div class="time-series-subtitle">Shared fake data: Average Earnings Across the Same 50 Schools</div>
      <svg class="time-series-svg"></svg>
    </div>
  `;

  const root = card.querySelector(".time-series-root");
  const svg = d3.select(card).select(".time-series-svg");

  const rootBounds = root.getBoundingClientRect();
  const width = Math.max(280, rootBounds.width - 10);
  const height = Math.max(220, rootBounds.height - 56);

  const margin = { top: 10, right: 16, bottom: 52, left: 76 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

  const chart = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleLinear()
    .domain(d3.extent(yearlyData, (d) => d.year))
    .range([0, innerWidth]);

  const y = d3
    .scaleLinear()
    .domain(d3.extent(yearlyData, (d) => d.earnings))
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
    .call(d3.axisBottom(x).ticks(yearlyData.length).tickFormat(d3.format("d")).tickPadding(8))
    .call((g) => g.select(".domain").attr("stroke", "#c9d9d0"))
    .call((g) => g.selectAll("text").attr("fill", "#53645d").attr("font-size", 14));

  chart
    .append("g")
    .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("$.2s")).tickPadding(8))
    .call((g) => g.select(".domain").attr("stroke", "#c9d9d0"))
    .call((g) => g.selectAll("text").attr("fill", "#53645d").attr("font-size", 14));

  const line = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.earnings))
    .curve(d3.curveMonotoneX);

  chart
    .append("path")
    .datum(yearlyData)
    .attr("fill", "none")
    .attr("stroke", "#176b5c")
    .attr("stroke-width", 2.25)
    .attr("d", line);

  chart
    .selectAll("circle")
    .data(yearlyData)
    .join("circle")
    .attr("cx", (d) => x(d.year))
    .attr("cy", (d) => y(d.earnings))
    .attr("r", 4.5)
    .attr("fill", "#176b5c")
    .append("title")
    .text((d) => `${d.year}\nMedian earnings: ${d3.format("$,.0f")(d.earnings)}`);
}
