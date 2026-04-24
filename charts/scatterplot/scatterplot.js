import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getSharedSchoolData } from "../shared-data.js";

export async function initScatterplot(cardSelector) {
  const card = document.querySelector(cardSelector);

  if (!card) {
    return;
  }

  const existingPlaceholder = card.querySelector(".chart-placeholder");
  if (existingPlaceholder) {
    existingPlaceholder.remove();
  }

  const data = await getSharedSchoolData();
  if (!data.length) {
    return;
  }

  card.innerHTML = `
    <div class="scatterplot-root" role="img" aria-label="Scatter plot showing net price versus median earnings for the shared 50-school sample.">
      <div class="scatterplot-title">Scatter Plot</div>
      <div class="scatterplot-subtitle">Shared fake data: Net Price vs. Median Earnings (50 schools)</div>
      <svg class="scatterplot-svg"></svg>
    </div>
  `;

  const root = card.querySelector(".scatterplot-root");
  const svg = d3.select(card).select(".scatterplot-svg");

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

  xAxis.selectAll("text").attr("fill", "#53645d").attr("font-size", 14);
  xAxis.select(".domain").attr("stroke", "#c9d9d0");

  const yAxis = chart.append("g").call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("$.2s")));

  yAxis.selectAll("text").attr("fill", "#53645d").attr("font-size", 14);
  yAxis.select(".domain").attr("stroke", "#c9d9d0");

  chart
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("cx", (d) => x(d.netPrice))
    .attr("cy", (d) => y(d.medianEarnings))
    .attr("r", 4.5)
    .attr("fill", "#176b5c")
    .attr("fill-opacity", 0.72)
    .append("title")
    .text(
      (d) =>
        `${d.school}\nNet Price: ${d3.format("$,.0f")(d.netPrice)}\nEarnings: ${d3.format("$,.0f")(d.medianEarnings)}`
    );

  chart
    .append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 36)
    .attr("text-anchor", "middle")
    .attr("fill", "#53645d")
    .attr("font-size", 16)
    .text("Average Net Price");

  chart
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -52)
    .attr("text-anchor", "middle")
    .attr("fill", "#53645d")
    .attr("font-size", 16)
    .text("Median Earnings");
}
