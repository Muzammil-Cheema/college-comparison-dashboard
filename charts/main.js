import { initScatterplot } from "./scatterplot/scatterplot.js";

function initCharts() {
  initScatterplot("#scatter-plot-card");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCharts);
} else {
  initCharts();
}
