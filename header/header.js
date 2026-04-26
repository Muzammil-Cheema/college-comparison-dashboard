import { clearPinnedSchools, subscribePinnedSchools } from "../charts/pinned-schools-store.js";
import { getSharedSchoolYears } from "../charts/shared-data.js";
import {
  initSelectedYear,
  setSelectedYear,
  subscribeSelectedYear
} from "../charts/selected-year-store.js";

export async function initHeader() {
  const resetButton = document.querySelector("#reset-pins-button");
  const yearSelect = document.querySelector("#single-year-select");

  await initSelectedYear();

  if (yearSelect) {
    const availableYears = await getSharedSchoolYears();
    const descendingYears = [...availableYears].sort((a, b) => b - a);

    yearSelect.replaceChildren();
    descendingYears.forEach((year) => {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = `Year: ${year}`;
      yearSelect.append(option);
    });

    yearSelect.addEventListener("change", (event) => {
      setSelectedYear(Number(event.target.value));
    });

    subscribeSelectedYear((selectedYear) => {
      yearSelect.value = String(selectedYear);
      yearSelect.setAttribute(
        "aria-label",
        `Select year for single-year charts (currently ${selectedYear})`
      );
    });
  }

  if (!resetButton) {
    return;
  }

  resetButton.addEventListener("click", () => {
    clearPinnedSchools();
  });

  subscribePinnedSchools((pinnedSchoolIds) => {
    resetButton.disabled = pinnedSchoolIds.size === 0;
    resetButton.setAttribute(
      "aria-label",
      `Reset pins (${pinnedSchoolIds.size} currently selected)`
    );
  });
}
