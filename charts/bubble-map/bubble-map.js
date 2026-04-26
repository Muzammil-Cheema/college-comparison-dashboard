import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as topojson from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";
import { getSharedSchoolData } from "../shared-data.js";
import {
  getPinnedColorMap,
  replacePinnedSchools,
  subscribePinnedSchools,
  togglePinnedSchool
} from "../pinned-schools-store.js";

const US_STATES_TOPOJSON_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const EXCLUDED_STATE_IDS = new Set([2, 15, 72]); // Alaska, Hawaii, Puerto Rico

const DEFAULT_BUBBLE_FILL = "#176b5c";
const DEFAULT_BUBBLE_STROKE = "#0f4f45";

function generateSchoolBubbles(schools, contiguousStates, projection) {
  const random = d3.randomLcg(0.564);
  const points = [];
  let attempts = 0;
  const maxAttempts = 60000;
  let schoolIndex = 0;

  while (schoolIndex < schools.length && attempts < maxAttempts) {
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

    const school = schools[schoolIndex];
    points.push({
      ...school,
      lon,
      lat,
      x: projected[0],
      y: projected[1]
    });

    schoolIndex += 1;
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

  const schools = await getSharedSchoolData();
  if (!schools.length) {
    showMapError(card, "Unable to load shared school data.");
    return;
  }

  card.innerHTML = `
    <div class="bubble-map-root" role="img" aria-label="Contiguous U.S. TopoJSON bubble map for the shared 50-school sample.">
      <div class="bubble-map-title">Bubble Map</div>
      <div class="bubble-map-subtitle">Shared fake data: 50 schools across the contiguous U.S.</div>
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

  const bubbles = generateSchoolBubbles(schools, contiguousStates, projection);
  if (bubbles.length !== schools.length) {
    showMapError(card, "Could not place all school bubbles on the contiguous U.S. geometry.");
    return;
  }

  const mobilityExtent = d3.extent(bubbles, (d) => d.mobilityRate);
  const mobilityDomain =
    mobilityExtent[0] === mobilityExtent[1]
      ? [mobilityExtent[0] - 0.001, mobilityExtent[1] + 0.001]
      : mobilityExtent;

  const radius = d3.scaleSqrt().domain(mobilityDomain).range([4.6, 8.3]);

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
      const brushedIds = bubbles
        .filter((bubble) => bubble.x >= x0 && bubble.x <= x1 && bubble.y >= y0 && bubble.y <= y1)
        .map((bubble) => bubble.schoolId);

      replacePinnedSchools(brushedIds, event.sourceEvent || event);
      brushLayer.call(brush.move, null);
    });

  const brushLayer = chart.append("g").attr("class", "bubble-map-brush").call(brush);

  chart
    .append("g")
    .selectAll("circle")
    .data(bubbles)
    .join("circle")
    .attr("class", "bubble-school-point")
    .attr("data-school-id", (bubble) => bubble.schoolId)
    .attr("cx", (bubble) => bubble.x)
    .attr("cy", (bubble) => bubble.y)
    .attr("r", (bubble) => radius(bubble.mobilityRate))
    .attr("fill", DEFAULT_BUBBLE_FILL)
    .attr("fill-opacity", 0.62)
    .attr("stroke", DEFAULT_BUBBLE_STROKE)
    .attr("stroke-opacity", 0.72)
    .attr("stroke-width", 1.1);

  chart
    .selectAll(".bubble-school-point")
    .style("cursor", "pointer")
    .on("click", (event, bubble) => {
      togglePinnedSchool(bubble.schoolId, event);
    })
    .append("title")
    .text(
      (bubble) =>
        `${bubble.school}\nMobility rate: ${d3.format(".1%")(bubble.mobilityRate)}\nAdmission rate: ${d3.format(".1%")(
          bubble.admissionRate
        )}`
    );

  function applyPinnedStyles(pinnedSchoolIds) {
    const pinnedColorMap = getPinnedColorMap(pinnedSchoolIds);

    chart
      .selectAll(".bubble-school-point")
      .attr("fill", (bubble) => pinnedColorMap.get(bubble.schoolId) || DEFAULT_BUBBLE_FILL)
      .attr("fill-opacity", (bubble) => (pinnedColorMap.has(bubble.schoolId) ? 0.9 : 0.62))
      .attr("stroke", (bubble) => {
        const color = pinnedColorMap.get(bubble.schoolId);
        return color ? d3.color(color).darker(0.7).formatHex() : DEFAULT_BUBBLE_STROKE;
      })
      .attr("stroke-width", (bubble) => (pinnedColorMap.has(bubble.schoolId) ? 1.5 : 1.1));
  }

  subscribePinnedSchools(applyPinnedStyles);
}
