import { getLatestSharedSchoolYear } from "./shared-data.js";

const subscribers = new Set();
let selectedYear = null;
let initPromise;

function notifySubscribers() {
  if (!Number.isFinite(selectedYear)) {
    return;
  }

  subscribers.forEach((listener) => listener(selectedYear));
}

export async function initSelectedYear(defaultYear) {
  if (!initPromise) {
    initPromise = (async () => {
      const parsedDefaultYear = Number(defaultYear);
      selectedYear = Number.isFinite(parsedDefaultYear)
        ? parsedDefaultYear
        : await getLatestSharedSchoolYear();

      notifySubscribers();
      return selectedYear;
    })();
  }

  return initPromise;
}

export function getSelectedYear() {
  return selectedYear;
}

export function subscribeSelectedYear(listener) {
  subscribers.add(listener);

  if (Number.isFinite(selectedYear)) {
    listener(selectedYear);
  }

  return () => {
    subscribers.delete(listener);
  };
}

export function setSelectedYear(year) {
  const parsedYear = Number(year);
  if (!Number.isFinite(parsedYear)) {
    return { changed: false, reason: "invalid" };
  }

  if (selectedYear === parsedYear) {
    return { changed: false, reason: "same-value" };
  }

  selectedYear = parsedYear;
  notifySubscribers();
  return { changed: true };
}
