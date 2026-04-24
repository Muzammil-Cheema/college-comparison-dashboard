import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const DIMENSIONS = [
  { key: "netPrice", label: "Net Price", formatter: d3.format("$.2s") },
  { key: "graduationRate", label: "Graduation Rate", formatter: d3.format(".0%") },
  { key: "medianDebt", label: "Median Debt", formatter: d3.format("$.2s") },
  { key: "medianEarnings", label: "Median Earnings", formatter: d3.format("$.2s") },
  { key: "mobilityRate", label: "Mobility Rate", formatter: d3.format(".1%") },
  { key: "admissionRate", label: "Admission Rate", formatter: d3.format(".0%") }
];

function generateSampleData() {
  const random = d3.randomLcg(0.564);
  const randomInRange = (min, max) => min + (max - min) * random();

  return Array.from({ length: 50 }, (_, index) => ({
    school: `Sample School ${index + 1}`,
    netPrice: Math.round(randomInRange(12000, 50000)),
    graduationRate: randomInRange(0.45, 0.96),
    medianDebt: Math.round(randomInRange(10000, 45000)),
    medianEarnings: Math.round(randomInRange(35000, 110000)),
    mobilityRate: randomInRange(0.01, 0.095),
    admissionRate: randomInRange(0.08, 0.92)
  }));
}

function buildLinePath(datum, dimensions, xScale, yScales) {
  return d3.line()(
    dimensions.map((dimension) => [xScale(dimension.key), yScales[dimension.key](datum[dimension.key])])
  );
}

export function initParallelCoordinates(cardSelector) {
  const card = document.querySelector(cardSelector);
  if (!card) {
    return;
  }

  const placeholder = card.querySelector(".chart-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  card.innerHTML = `
    <div class="parallel-coordinates-root" role="img" aria-label="Sample parallel coordinates chart with six dimensions and fifty observations.">
      <div class="parallel-coordinates-title">Parallel Coordinates</div>
      <div class="parallel-coordinates-subtitle">Sample D3 scaffold: 6 attributes across 50 schools</div>
      <svg class="parallel-coordinates-svg"></svg>
    </div>
  `;

  const data = generateSampleData();
  const root = card.querySelector(".parallel-coordinates-root");
  const svg = d3.select(card).select(".parallel-coordinates-svg");

  const rootBounds = root.getBoundingClientRect();
  const width = Math.max(500, rootBounds.width - 10);
  const height = Math.max(220, rootBounds.height - 56);
  const margin = { top: 24, right: 20, bottom: 18, left: 20 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

  const chart = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3
    .scalePoint()
    .domain(DIMENSIONS.map((dimension) => dimension.key))
    .range([0, innerWidth])
    .padding(0.35);

  const yScales = Object.fromEntries(
    DIMENSIONS.map((dimension) => {
      const values = data.map((datum) => datum[dimension.key]);
      const domain = d3.extent(values);
      return [
        dimension.key,
        d3
          .scaleLinear()
          .domain(domain[0] === domain[1] ? [domain[0] - 1, domain[1] + 1] : domain)
          .nice()
          .range([innerHeight, 0])
      ];
    })
  );

  chart
    .append("g")
    .selectAll("path")
    .data(data)
    .join("path")
    .attr("d", (datum) => buildLinePath(datum, DIMENSIONS, xScale, yScales))
    .attr("fill", "none")
    .attr("stroke", "#176b5c")
    .attr("stroke-opacity", 0.2)
    .attr("stroke-width", 1.5)
    .append("title")
    .text((datum) => datum.school);

  const dimensionGroups = chart
    .append("g")
    .selectAll(".pcp-dimension")
    .data(DIMENSIONS)
    .join("g")
    .attr("class", "pcp-dimension")
    .attr("transform", (dimension) => `translate(${xScale(dimension.key)},0)`);

  dimensionGroups
    .append("g")
    .each(function renderAxis(dimension) {
      d3.select(this).call(d3.axisLeft(yScales[dimension.key]).ticks(5).tickFormat(dimension.formatter));
    })
    .call((g) => g.select(".domain").attr("stroke", "#c9d9d0"))
    .call((g) => g.selectAll(".tick line").attr("stroke", "#c9d9d0"))
    .call((g) => g.selectAll(".tick text").attr("fill", "#3f5049").attr("font-size", 13));

  dimensionGroups
    .append("text")
    .attr("x", 0)
    .attr("y", -10)
    .attr("text-anchor", "middle")
    .attr("fill", "#1c2a25")
    .attr("font-size", 14)
    .attr("font-weight", 600)
    .text((dimension) => dimension.label);
}
