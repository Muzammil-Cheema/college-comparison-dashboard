import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as topojson from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";
import {
  getSharedNumericAttributes,
  getSharedSchoolData
} from "../../data-integration/scorecard-data.js";
import { enhanceSingleSelect } from "../custom-select.js";
import {
  getPinnedColorMap,
  replacePinnedSchools,
  subscribePinnedSchools,
  togglePinnedSchool
} from "../pinned-schools-store.js";
import { bindHoverTooltip } from "../hover-tooltip.js";
import { initSelectedYear, subscribeSelectedYear } from "../selected-year-store.js";

const US_STATES_TOPOJSON_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const EXCLUDED_STATE_IDS = new Set([2, 15, 72]); // Alaska, Hawaii, Puerto Rico

const DEFAULT_BUBBLE_FILL = "#176b5c";
const DEFAULT_BUBBLE_STROKE = "#0f4f45";

function projectSchoolBubbles(schools, contiguousStates, projection) {
  return schools
    .filter((school) => Number.isFinite(school.lon) && Number.isFinite(school.lat))
    .map((school) => {
      const coordinate = [school.lon, school.lat];
      if (!contiguousStates.some((stateFeature) => d3.geoContains(stateFeature, coordinate))) {
        return null;
      }

      const projected = projection(coordinate);
      if (!projected) {
        return null;
      }

      return {
        ...school,
        x: projected[0],
        y: projected[1]
      };
    })
    .filter(Boolean);
}

function showMapError(card, message) {
  card.innerHTML = `
    <div class="bubble-map-root">
      <div class="bubble-map-header">
        <div class="bubble-map-heading">
          <div class="bubble-map-title">Bubble Map</div>
          <div class="bubble-map-subtitle">Unable to load map data.</div>
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

  const attributes = await getSharedNumericAttributes();
  if (!attributes.length) {
    showMapError(card, "No numeric attributes found in CSV.");
    return;
  }

  const attributeByKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));

  card.innerHTML = `
    <div class="bubble-map-root" role="img" aria-label="Contiguous U.S. bubble map for schools in the current dataset.">
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

  attributes.forEach((attribute) => {
    const option = document.createElement("option");
    option.value = attribute.key;
    option.textContent = attribute.label;
    sizeSelect.append(option);
  });

  let activeSizeAttribute = attributes[0];
  let activeYear = null;
  let latestPinnedSchoolIds = new Set();
  let currentBubbles = [];
  let currentYearSchools = [];
  let renderRequestId = 0;
  sizeSelect.value = activeSizeAttribute.key;
  enhanceSingleSelect(sizeSelect);

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
    .attr("stroke-width", 0.7)
    .attr("pointer-events", "none");

  chart
    .append("path")
    .datum(stateBorders)
    .attr("d", geoPath)
    .attr("fill", "none")
    .attr("stroke", "#b4c8be")
    .attr("stroke-width", 0.65)
    .attr("pointer-events", "none");

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
      const brushedIds = currentBubbles
        .filter((bubble) => bubble.x >= x0 && bubble.x <= x1 && bubble.y >= y0 && bubble.y <= y1)
        .map((bubble) => bubble.schoolId);

      replacePinnedSchools(brushedIds, event.sourceEvent || event);
      brushLayer.call(brush.move, null);
    });

  const brushLayer = chart.append("g").attr("class", "bubble-map-brush").call(brush);
  const bubbleLayer = chart.append("g");

  function applyPinnedStyles(pinnedSchoolIds) {
    latestPinnedSchoolIds = new Set(pinnedSchoolIds);
    const pinnedColorMap = getPinnedColorMap(pinnedSchoolIds);

    bubbleLayer
      .selectAll(".bubble-school-point")
      .attr("fill", (bubble) => pinnedColorMap.get(bubble.schoolId) || DEFAULT_BUBBLE_FILL)
      .attr("stroke", (bubble) => {
        const color = pinnedColorMap.get(bubble.schoolId);
        return color ? d3.color(color).darker(0.7).formatHex() : DEFAULT_BUBBLE_STROKE;
      })
      .attr("stroke-width", (bubble) => (pinnedColorMap.has(bubble.schoolId) ? 1.5 : 1.1));
  }

  function updateSizeSelectorAvailability(yearSchools) {
    const availableByKey = new Map(
      attributes.map((attribute) => [
        attribute.key,
        yearSchools.some((school) => Number.isFinite(school[attribute.key]))
      ])
    );

    [...sizeSelect.options].forEach((option) => {
      const isAvailable = availableByKey.get(option.value);
      option.disabled = !isAvailable;
      option.style.textDecoration = isAvailable ? "none" : "line-through";
    });

    if (!availableByKey.get(activeSizeAttribute.key)) {
      const fallback = attributes.find((attribute) => availableByKey.get(attribute.key));
      if (fallback) {
        activeSizeAttribute = fallback;
      }
    }

    sizeSelect.value = activeSizeAttribute.key;
  }

  function updateBubbleEncoding() {
    const attribute = activeSizeAttribute;
    const finiteValues = currentBubbles
      .map((bubble) => bubble[attribute.key])
      .filter(Number.isFinite);

    const radiusDomain = expandFlatDomain(d3.extent(finiteValues));
    const radiusScale = d3.scaleSqrt().domain(radiusDomain).range([4.6, 8.3]);

    const visibleCount = finiteValues.length;
    subtitle.textContent = `${activeYear}: ${currentBubbles.length} schools shown (${visibleCount} with ${attribute.label})`;

    bubbleLayer
      .selectAll(".bubble-school-point")
      .attr("r", (bubble) => {
        if (!Number.isFinite(bubble[attribute.key])) {
          return 3.2;
        }
        return radiusScale(bubble[attribute.key]);
      })
      .attr("fill-opacity", (bubble) => {
        if (!Number.isFinite(bubble[attribute.key])) {
          return 0.3;
        }
        return 0.62;
      });
  }

  async function renderYear(year) {
    const requestId = ++renderRequestId;
    const schools = await getSharedSchoolData(year);
    if (requestId !== renderRequestId) {
      return;
    }

    activeYear = year;
    currentYearSchools = schools;
    updateSizeSelectorAvailability(currentYearSchools);
    currentBubbles = projectSchoolBubbles(schools, contiguousStates, projection);
    if (!currentBubbles.length) {
      showMapError(card, "No schools with valid coordinates were available for the selected year.");
      return;
    }

    const selection = bubbleLayer
      .selectAll(".bubble-school-point")
      .data(currentBubbles, (bubble) => bubble.schoolId);

    selection.exit().remove();

    const entered = selection
      .enter()
      .append("circle")
      .attr("class", "bubble-school-point")
      .attr("data-school-id", (bubble) => bubble.schoolId)
      .attr("cx", (bubble) => bubble.x)
      .attr("cy", (bubble) => bubble.y)
      .attr("fill", DEFAULT_BUBBLE_FILL)
      .attr("stroke", DEFAULT_BUBBLE_STROKE)
      .attr("stroke-opacity", 0.72)
      .attr("stroke-width", 1.1)
      .style("cursor", "pointer")
      .on("click", (event, bubble) => {
        togglePinnedSchool(bubble.schoolId, event);
      });

    const points = selection
      .merge(entered)
      .attr("cx", (bubble) => bubble.x)
      .attr("cy", (bubble) => bubble.y);

    bindHoverTooltip(points, (event, bubble) => {
      const value = bubble[activeSizeAttribute.key];
      const label = Number.isFinite(value) ? activeSizeAttribute.valueFormat(value) : "N/A";
      return `${bubble.school}\n${activeSizeAttribute.label}: ${label}`;
    });

    updateBubbleEncoding();
    applyPinnedStyles(latestPinnedSchoolIds);
  }

  sizeSelect.addEventListener("change", (event) => {
    const nextAttribute = attributeByKey.get(event.target.value);
    if (!nextAttribute) {
      event.target.value = activeSizeAttribute.key;
      return;
    }

    const hasValues = currentYearSchools.some((school) => Number.isFinite(school[nextAttribute.key]));
    if (!hasValues) {
      event.target.value = activeSizeAttribute.key;
      return;
    }

    activeSizeAttribute = nextAttribute;
    updateBubbleEncoding();
    applyPinnedStyles(latestPinnedSchoolIds);
  });

  subscribePinnedSchools(applyPinnedStyles);
  await initSelectedYear();
  subscribeSelectedYear((year) => {
    void renderYear(year);
  });
}
