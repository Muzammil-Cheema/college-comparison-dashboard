import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const SAMPLE_DATA = [
  { school: "School A", netPrice: 18000, earnings: 52000 },
  { school: "School B", netPrice: 24000, earnings: 61000 },
  { school: "School C", netPrice: 28000, earnings: 70000 },
  { school: "School D", netPrice: 32000, earnings: 74000 },
  { school: "School E", netPrice: 36000, earnings: 76000 },
  { school: "School F", netPrice: 42000, earnings: 82000 }
];

export function initScatterplot(cardSelector) {
  const card = document.querySelector(cardSelector);

  if (!card) {
    return;
  }

  const existingPlaceholder = card.querySelector(".chart-placeholder");
  if (existingPlaceholder) {
    existingPlaceholder.remove();
  }

  card.innerHTML = `
    <div class="scatterplot-root" role="img" aria-label="Sample scatter plot showing net price versus median earnings.">
      <div class="scatterplot-title">Scatter Plot</div>
      <div class="scatterplot-subtitle">Sample D3 scaffold: Net Price vs. Median Earnings</div>
      <svg class="scatterplot-svg"></svg>
    </div>
  `;

  const root = card.querySelector(".scatterplot-root");
  const svg = d3.select(card).select(".scatterplot-svg");

  const rootBounds = root.getBoundingClientRect();
  const width = Math.max(420, rootBounds.width - 10);
  const height = Math.max(250, rootBounds.height - 56);

  const margin = { top: 8, right: 16, bottom: 44, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

  const chart = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleLinear()
    .domain(d3.extent(SAMPLE_DATA, (d) => d.netPrice))
    .nice()
    .range([0, innerWidth]);

  const y = d3
    .scaleLinear()
    .domain(d3.extent(SAMPLE_DATA, (d) => d.earnings))
    .nice()
    .range([innerHeight, 0]);

  chart
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("$.2s")));

  chart.append("g").call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("$.2s")));

  chart
    .selectAll("circle")
    .data(SAMPLE_DATA)
    .join("circle")
    .attr("cx", (d) => x(d.netPrice))
    .attr("cy", (d) => y(d.earnings))
    .attr("r", 6)
    .attr("fill", "#176b5c")
    .attr("fill-opacity", 0.8)
    .append("title")
    .text((d) => `${d.school}\nNet Price: ${d3.format("$,.0f")(d.netPrice)}\nEarnings: ${d3.format("$,.0f")(d.earnings)}`);

  chart
    .append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 36)
    .attr("text-anchor", "middle")
    .attr("fill", "#53645d")
    .attr("font-size", 11)
    .text("Average Net Price");

  chart
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -40)
    .attr("text-anchor", "middle")
    .attr("fill", "#53645d")
    .attr("font-size", 11)
    .text("Median Earnings");
}
