import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getSharedSchoolData } from "../shared-data.js";

export async function initRankedDotPlot(cardSelector) {
  const card = document.querySelector(cardSelector);

  if (!card) {
    return;
  }

  const placeholder = card.querySelector(".chart-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  const sharedData = await getSharedSchoolData();
  if (!sharedData.length) {
    return;
  }

  card.innerHTML = `
    <div class="ranked-dot-plot-root" role="img" aria-label="Ranked dot plot showing graduation rate for schools from the shared sample dataset.">
      <div class="ranked-dot-plot-title">Ranked Dot Plot</div>
      <div class="ranked-dot-plot-subtitle">Shared fake data: 50 schools ranked by graduation rate</div>
      <svg class="ranked-dot-plot-svg"></svg>
    </div>
  `;

  const root = card.querySelector(".ranked-dot-plot-root");
  const svg = d3.select(card).select(".ranked-dot-plot-svg");

  const sortedData = [...sharedData]
    .sort((a, b) => d3.descending(a.graduationRate, b.graduationRate))
    .map((datum, index) => ({ ...datum, rank: index + 1 }));
  const rootBounds = root.getBoundingClientRect();
  const width = Math.max(240, rootBounds.width - 10);
  const height = Math.max(210, rootBounds.height - 56);

  const leftMargin = Math.min(96, Math.max(76, Math.round(width * 0.18)));
  const margin = { top: 10, right: 16, bottom: 46, left: leftMargin };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

  const chart = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(sortedData, (d) => d.graduationRate) || 1])
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
    .call((g) => g.selectAll("text").attr("fill", "#3f5049").attr("font-size", 14));

  chart
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")).tickPadding(8))
    .call((g) => g.select(".domain").attr("stroke", "#c9d9d0"))
    .call((g) => g.selectAll("text").attr("fill", "#53645d").attr("font-size", 14));

  chart
    .selectAll(".rank-line")
    .data(sortedData)
    .join("line")
    .attr("class", "rank-line")
    .attr("x1", x(0))
    .attr("x2", (d) => x(d.graduationRate))
    .attr("y1", (d) => (y(d.rank) || 0) + y.bandwidth() / 2)
    .attr("y2", (d) => (y(d.rank) || 0) + y.bandwidth() / 2)
    .attr("stroke", "#9ab8ad")
    .attr("stroke-width", 1.2);

  chart
    .selectAll(".rank-dot")
    .data(sortedData)
    .join("circle")
    .attr("class", "rank-dot")
    .attr("cx", (d) => x(d.graduationRate))
    .attr("cy", (d) => (y(d.rank) || 0) + y.bandwidth() / 2)
    .attr("r", 3.25)
    .attr("fill", "#176b5c")
    .append("title")
    .text((d) => `#${d.rank} ${d.school}\nGraduation rate: ${d3.format(".1%")(d.graduationRate)}`);
}
