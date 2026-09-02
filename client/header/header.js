import { clearPinnedSchools, subscribePinnedSchools } from "../charts/pinned-schools-store.js";
import {
  DATASET_MODE,
  getSharedSchoolYears,
  subscribeDatasetMode,
  toggleDatasetMode
} from "../data-integration/scorecard-data.js";
import {
  initSelectedYear,
  setSelectedYear,
  subscribeSelectedYear
} from "../charts/selected-year-store.js";

export async function initHeader() {
  const resetButton = document.querySelector("#reset-pins-button");
  const imputationButton = document.querySelector("#enable-imputation-button");
  const yearSelect = document.querySelector("#single-year-select");
  const headerActions = document.querySelector(".header-actions");

  let imputationDisclaimer = null;
  if (headerActions) {
    imputationDisclaimer = document.createElement("p");
    imputationDisclaimer.className = "header-imputation-disclaimer";
    imputationDisclaimer.hidden = true;
    imputationDisclaimer.textContent =
      "Imputation mode is enabled: some values are estimated (imputed), not directly sourced.";
    headerActions.append(imputationDisclaimer);
  }

  await initSelectedYear();

  async function populateYearOptions() {
    if (!yearSelect) {
      return;
    }

    const availableYears = await getSharedSchoolYears();
    const descendingYears = [...availableYears].sort((a, b) => b - a);

    yearSelect.replaceChildren();
    descendingYears.forEach((year) => {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = `Year: ${year}`;
      yearSelect.append(option);
    });
  }

  if (yearSelect) {
    await populateYearOptions();

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

  if (imputationButton) {
    imputationButton.addEventListener("click", () => {
      toggleDatasetMode();
    });

    subscribeDatasetMode(async (mode) => {
      const isImputed = mode === DATASET_MODE.IMPUTED;
      imputationButton.textContent =
        isImputed ? "Disable Imputation" : "Enable Imputation";
      imputationButton.classList.toggle("is-imputed", isImputed);
      imputationButton.setAttribute(
        "aria-label",
        isImputed
          ? "Disable imputation and use original dataset"
          : "Enable imputation and use imputed dataset"
      );
      if (imputationDisclaimer) {
        imputationDisclaimer.hidden = !isImputed;
      }

      await populateYearOptions();
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
