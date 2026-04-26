import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const SCHOOL_HISTORY_DATA_URL = new URL("../data/shared-schools-by-year.csv", import.meta.url);

let schoolHistoryPromise;
let latestYearPromise;
let sharedSchoolYearsPromise;
const schoolsByYearPromise = new Map();

function parseSchoolHistoryRow(row) {
  return {
    schoolId: row.schoolId,
    school: row.school,
    year: Number(row.year),
    netPrice: Number(row.netPrice),
    graduationRate: Number(row.graduationRate),
    medianDebt: Number(row.medianDebt),
    medianEarnings: Number(row.medianEarnings),
    mobilityRate: Number(row.mobilityRate),
    admissionRate: Number(row.admissionRate)
  };
}

export function getLatestSharedSchoolYear() {
  if (!latestYearPromise) {
    latestYearPromise = getSharedSchoolHistory().then((historyRows) =>
      d3.max(historyRows, (row) => row.year)
    );
  }

  return latestYearPromise;
}

export function getSharedSchoolYears() {
  if (!sharedSchoolYearsPromise) {
    sharedSchoolYearsPromise = getSharedSchoolHistory().then((historyRows) =>
      [...new Set(historyRows.map((row) => row.year))].sort((a, b) => d3.ascending(a, b))
    );
  }

  return sharedSchoolYearsPromise;
}

export async function getSharedSchoolData(year) {
  const parsedYear = Number(year);
  const targetYear = Number.isFinite(parsedYear) ? parsedYear : await getLatestSharedSchoolYear();

  if (!schoolsByYearPromise.has(targetYear)) {
    schoolsByYearPromise.set(
      targetYear,
      getSharedSchoolHistory().then((historyRows) =>
        historyRows
          .filter((row) => row.year === targetYear)
          .sort((a, b) => d3.ascending(a.schoolId, b.schoolId))
      )
    );
  }

  return schoolsByYearPromise.get(targetYear);
}

export function getSharedSchoolHistory() {
  if (!schoolHistoryPromise) {
    schoolHistoryPromise = d3.csv(SCHOOL_HISTORY_DATA_URL, parseSchoolHistoryRow);
  }

  return schoolHistoryPromise;
}

export function getSharedEarningsHistory() {
  // Keep this alias for backwards compatibility with existing imports.
  return getSharedSchoolHistory();
}
