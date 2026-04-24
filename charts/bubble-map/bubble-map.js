import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as topojson from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";

const US_STATES_TOPOJSON_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const EXCLUDED_STATE_IDS = new Set([2, 15, 72]); // Alaska, Hawaii, Puerto Rico

function generateRandomBubbles(count, contiguousStates, projection) {
  const random = d3.randomLcg(0.564);
  const points = [];
  let attempts = 0;
  const maxAttempts = 25000;

  while (points.length < count && attempts < maxAttempts) {
    attempts += 1;

    const lon = -124.8 + (-66.9 - -124.8) * random();
    const lat = 24.5 + (49.4 - 24.5) * random();
    const coordinate = [lon, lat];
    const isInsideContiguousUS = contiguousStates.some((stateFeature) =>
      d3.geoContains(stateFeature, coordinate)
    );

    if (!isInsideContiguousUS) {
      continue;
    }

    const projected = projection(coordinate);
    if (!projected) {
      continue;
    }

    points.push({
      id: points.length + 1,
      lon,
      lat,
      x: projected[0],
      y: projected[1]
    });
  }

  return points;
}

function showMapError(card, message) {
  card.innerHTML = `
    <div class="bubble-map-root">
      <div class="bubble-map-title">Bubble Map</div>
      <div class="bubble-map-subtitle">Unable to load TopoJSON basemap.</div>
      <div class="bubble-map-error">${message}</div>
    </div>
  `;
}

export async function initBubbleMap(cardSelector) {
  const card = document.querySelector(cardSelector);
  if (!card) {
    return;
  }

  const placeholder = card.querySelector(".chart-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  card.innerHTML = `
    <div class="bubble-map-root" role="img" aria-label="Contiguous U.S. TopoJSON bubble map with fifty sample schools.">
      <div class="bubble-map-title">Bubble Map</div>
      <div class="bubble-map-subtitle">Sample D3 + TopoJSON scaffold: 50 bubbles across the contiguous U.S.</div>
      <svg class="bubble-map-svg"></svg>
    </div>
  `;

  const root = card.querySelector(".bubble-map-root");
  const svg = d3.select(card).select(".bubble-map-svg");
  const rootBounds = root.getBoundingClientRect();
  const width = Math.max(260, rootBounds.width - 10);
  const height = Math.max(210, rootBounds.height - 56);
  const margin = { top: 4, right: 6, bottom: 4, left: 6 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

  const chart = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  let us;
  try {
    us = await d3.json(US_STATES_TOPOJSON_URL);
  } catch (error) {
    showMapError(card, "Check internet access or reload Live Server.");
    return;
  }

  const allStates = topojson.feature(us, us.objects.states).features;
  const contiguousStates = allStates.filter(
    (stateFeature) => !EXCLUDED_STATE_IDS.has(Number(stateFeature.id))
  );

  const contiguousCollection = {
    type: "FeatureCollection",
    features: contiguousStates
  };

  const projection = d3.geoAlbersUsa().fitSize([innerWidth, innerHeight], contiguousCollection);
  const geoPath = d3.geoPath(projection);

  const contiguousIds = new Set(contiguousStates.map((stateFeature) => Number(stateFeature.id)));
  const stateBorders = topojson.mesh(
    us,
    us.objects.states,
    (a, b) =>
      a !== b && contiguousIds.has(Number(a.id)) && contiguousIds.has(Number(b.id))
  );

  chart
    .append("g")
    .selectAll("path")
    .data(contiguousStates)
    .join("path")
    .attr("d", geoPath)
    .attr("fill", "#edf4f0")
    .attr("stroke", "#c7d8cf")
    .attr("stroke-width", 0.7);

  chart
    .append("path")
    .datum(stateBorders)
    .attr("d", geoPath)
    .attr("fill", "none")
    .attr("stroke", "#b4c8be")
    .attr("stroke-width", 0.65)
    .attr("pointer-events", "none");

  const bubbles = generateRandomBubbles(50, contiguousStates, projection);
  if (bubbles.length === 0) {
    showMapError(card, "Could not place sample bubbles on the contiguous U.S. geometry.");
    return;
  }

  chart
    .append("g")
    .selectAll("circle")
    .data(bubbles)
    .join("circle")
    .attr("cx", (bubble) => bubble.x)
    .attr("cy", (bubble) => bubble.y)
    .attr("r", 6.5)
    .attr("fill", "#176b5c")
    .attr("fill-opacity", 0.62)
    .attr("stroke", "#0f4f45")
    .attr("stroke-opacity", 0.72)
    .attr("stroke-width", 1.1);
}
