import { initScatterplot } from "./scatterplot/scatterplot.js";
import { initRankedDotPlot } from "./ranked-dot-plot/ranked-dot-plot.js";
import { initTimeSeries } from "./time-series/time-series.js";
import { initParallelCoordinates } from "./parallel-coordinates/parallel-coordinates.js";
import { initBubbleMap } from "./bubble-map/bubble-map.js";

async function initCharts() {
  const results = await Promise.allSettled([
    initRankedDotPlot("#ranked-dot-plot-card"),
    initBubbleMap("#bubble-map-card"),
    initScatterplot("#scatter-plot-card"),
    initTimeSeries("#time-series-card"),
    initParallelCoordinates("#parallel-coordinates-card")
  ]);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`Chart initialization failed at index ${index}`, result.reason);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void initCharts();
  });
} else {
  void initCharts();
}
