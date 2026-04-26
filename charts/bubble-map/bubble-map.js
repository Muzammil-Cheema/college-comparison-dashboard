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
const DEFAULT_SIZE_ATTRIBUTE = "mobilityRate";

const SIZE_ATTRIBUTES = [
  { key: "netPrice", label: "Net Price", valueFormat: d3.format("$,.0f") },
  { key: "graduationRate", label: "Graduation Rate", valueFormat: d3.format(".1%") },
  { key: "medianDebt", label: "Median Debt", valueFormat: d3.format("$,.0f") },
  { key: "medianEarnings", label: "Median Earnings", valueFormat: d3.format("$,.0f") },
  { key: "mobilityRate", label: "Mobility Rate", valueFormat: d3.format(".1%") },
  { key: "admissionRate", label: "Admission Rate", valueFormat: d3.format(".1%") }
];

const SIZE_ATTRIBUTE_BY_KEY = new Map(SIZE_ATTRIBUTES.map((attribute) => [attribute.key, attribute]));

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
      <div class="bubble-map-header">
        <div class="bubble-map-heading">
          <div class="bubble-map-title">Bubble Map</div>
          <div class="bubble-map-subtitle">Unable to load TopoJSON basemap.</div>
        </div>
      </div>
      <div class="bubble-map-error">${message}</div>
    </div>
  `;
}

function expandFlatDomain([min, max]) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1];
  }

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.05, 0.05);
    return [Math.max(0, min - padding), max + padding];
  }

  return [min, max];
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
    <div class="bubble-map-root" role="img" aria-label="Contiguous U.S. TopoJSON bubble map for the shared school sample.">
      <div class="bubble-map-header">
        <div class="bubble-map-heading">
          <div class="bubble-map-title">Bubble Map</div>
          <div class="bubble-map-subtitle"></div>
        </div>
        <div class="bubble-map-controls">
          <label class="bubble-map-control-label" for="bubble-map-size-attribute-select">Size</label>
          <select class="bubble-map-control-select" id="bubble-map-size-attribute-select"></select>
        </div>
      </div>
      <svg class="bubble-map-svg"></svg>
    </div>
  `;

  const root = card.querySelector(".bubble-map-root");
  const subtitle = card.querySelector(".bubble-map-subtitle");
  const sizeSelect = card.querySelector("#bubble-map-size-attribute-select");
  const svg = d3.select(card).select(".bubble-map-svg");

  SIZE_ATTRIBUTES.forEach((attribute) => {
    const option = document.createElement("option");
    option.value = attribute.key;
    option.textContent = attribute.label;
    sizeSelect.append(option);
  });

  let activeSizeAttribute = SIZE_ATTRIBUTE_BY_KEY.get(DEFAULT_SIZE_ATTRIBUTE);
  let latestPinnedSchoolIds = new Set();
  sizeSelect.value = activeSizeAttribute.key;

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

  const bubbleSelection = chart
    .append("g")
    .selectAll(".bubble-school-point")
    .data(bubbles)
    .join("circle")
    .attr("class", "bubble-school-point")
    .attr("data-school-id", (bubble) => bubble.schoolId)
    .attr("cx", (bubble) => bubble.x)
    .attr("cy", (bubble) => bubble.y)
    .attr("fill", DEFAULT_BUBBLE_FILL)
    .attr("fill-opacity", 0.62)
    .attr("stroke", DEFAULT_BUBBLE_STROKE)
    .attr("stroke-opacity", 0.72)
    .attr("stroke-width", 1.1)
    .style("cursor", "pointer")
    .on("click", (event, bubble) => {
      togglePinnedSchool(bubble.schoolId, event);
    });

  bubbleSelection.append("title");

  function updateBubbleEncoding(attribute) {
    activeSizeAttribute = attribute;
    subtitle.textContent = `Shared fake data: ${bubbles.length} schools across the contiguous U.S. (size by ${attribute.label})`;

    const values = bubbles.map((bubble) => Number(bubble[attribute.key]));
    const radiusDomain = expandFlatDomain(d3.extent(values));
    const radiusScale = d3.scaleSqrt().domain(radiusDomain).range([4.6, 8.3]);

    chart
      .selectAll(".bubble-school-point")
      .attr("r", (bubble) => radiusScale(Number(bubble[attribute.key])))
      .select("title")
      .text(
        (bubble) =>
          `${bubble.school}\n${attribute.label}: ${attribute.valueFormat(Number(bubble[attribute.key]))}`
      );
  }

  function applyPinnedStyles(pinnedSchoolIds) {
    latestPinnedSchoolIds = new Set(pinnedSchoolIds);
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

  sizeSelect.addEventListener("change", (event) => {
    const nextAttribute = SIZE_ATTRIBUTE_BY_KEY.get(event.target.value);
    if (!nextAttribute) {
      event.target.value = activeSizeAttribute.key;
      return;
    }

    updateBubbleEncoding(nextAttribute);
    applyPinnedStyles(latestPinnedSchoolIds);
  });

  updateBubbleEncoding(activeSizeAttribute);
  subscribePinnedSchools(applyPinnedStyles);
}
