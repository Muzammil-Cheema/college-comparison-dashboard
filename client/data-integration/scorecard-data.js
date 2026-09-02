import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const SCHOOL_HISTORY_DATASET_URL = new URL("../../data/merged_college_scorecard_dataset.csv", import.meta.url);
const SCHOOL_HISTORY_IMPUTED_URL = new URL("../../data/merged_college_scorecard_imputed.csv", import.meta.url);
const SCHOOL_METADATA_URL = new URL("../../data/schools_metadata.csv", import.meta.url);

const PERCENT_KEY_PATTERN = /(rate|pct|percent|share|ratio|prop)/i;
const CURRENCY_KEY_PATTERN = /(price|cost|debt|earning|income|tuition|salary|dollar|amount|aid)/i;
const EXCLUDED_ATTRIBUTE_PATTERN = /^imputation_/i;

let parsedDatasetPromise;
let schoolMetadataPromise;
let schoolHistoryPromise;
let latestYearPromise;
let sharedSchoolYearsPromise;
let sharedAttributesPromise;
const schoolsByYearPromise = new Map();
const datasetModeSubscribers = new Set();

export const DATASET_MODE = {
  RAW: "raw",
  IMPUTED: "imputed"
};

let currentDatasetMode = DATASET_MODE.RAW;

function getSchoolHistoryDataUrl() {
  return currentDatasetMode === DATASET_MODE.IMPUTED
    ? SCHOOL_HISTORY_IMPUTED_URL
    : SCHOOL_HISTORY_DATASET_URL;
}

function clearDatasetCaches() {
  parsedDatasetPromise = undefined;
  schoolHistoryPromise = undefined;
  latestYearPromise = undefined;
  sharedSchoolYearsPromise = undefined;
  sharedAttributesPromise = undefined;
  schoolsByYearPromise.clear();
}

function notifyDatasetModeSubscribers() {
  datasetModeSubscribers.forEach((listener) => listener(currentDatasetMode));
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value !== "string") {
    return NaN;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === "NA" || trimmed.toUpperCase() === "NULL") {
    return NaN;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function toLabel(key) {
  if (!key) {
    return "";
  }

  const spaced = String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function inferFormatKind(key, values) {
  const min = d3.min(values);
  const max = d3.max(values);

  if (PERCENT_KEY_PATTERN.test(key) || (Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max <= 1)) {
    return "percent";
  }

  if (CURRENCY_KEY_PATTERN.test(key)) {
    return "currency";
  }

  return "number";
}

function buildAttributeFormatters(kind) {
  if (kind === "percent") {
    return {
      axisTickFormat: d3.format(".0%"),
      valueFormat: d3.format(".1%"),
      tooltipFormat: d3.format(".1%")
    };
  }

  if (kind === "currency") {
    return {
      axisTickFormat: d3.format("$.2s"),
      valueFormat: d3.format("$,.0f"),
      tooltipFormat: d3.format("$,.0f")
    };
  }

  return {
    axisTickFormat: d3.format("~s"),
    valueFormat: d3.format(",.2f"),
    tooltipFormat: d3.format(",.2f")
  };
}

function resolveDatasetColumns(columns) {
  const idColumn = columns.find((column) => /^(id|schoolId|unitid|opeid|opeid6)$/i.test(column));
  const yearColumn = columns.find((column) => /^year$/i.test(column));
  const nameColumn = columns.find(
    (column) =>
      /^(name|school|school_name|instnm|latest_instnm|college_scorecard_name)$/i.test(column)
  );

  if (!idColumn || !yearColumn) {
    throw new Error("CSV must include id and year columns.");
  }

  const reserved = new Set([idColumn, yearColumn]);
  if (nameColumn) {
    reserved.add(nameColumn);
  }
  const attributeColumns = columns.filter(
    (column) => !reserved.has(column) && !EXCLUDED_ATTRIBUTE_PATTERN.test(column)
  );

  return {
    idColumn,
    nameColumn,
    yearColumn,
    attributeColumns
  };
}

async function loadSchoolMetadata() {
  if (!schoolMetadataPromise) {
    schoolMetadataPromise = d3.csv(SCHOOL_METADATA_URL).then((rows) => {
      const columns = rows.columns || Object.keys(rows[0] || {});
      const idColumn = columns.find((column) => /^(id|schoolId|unitid)$/i.test(column));
      const latColumn = columns.find((column) => /^(lat|latitude|instlat)$/i.test(column));
      const lonColumn = columns.find((column) => /^(lon|lng|longitude|instlon)$/i.test(column));
      const schoolNameColumn = columns.find((column) => /^(school_name|school|name|instnm|latest_instnm)$/i.test(column));

      if (!idColumn || !latColumn || !lonColumn) {
        throw new Error("schools_metadata.csv must include id, lat, and lon columns.");
      }

      const byId = new Map();
      rows.forEach((row) => {
        const schoolId = String(row[idColumn] ?? "").trim();
        if (!schoolId) {
          return;
        }

        byId.set(schoolId, {
          schoolId,
          school: String(row[schoolNameColumn] ?? "").trim(),
          city: String(row.city ?? "").trim(),
          state: String(row.state ?? "").trim(),
          lat: toNumber(row[latColumn]),
          lon: toNumber(row[lonColumn])
        });
      });

      return byId;
    });
  }

  return schoolMetadataPromise;
}

async function loadDataset() {
  if (!parsedDatasetPromise) {
    parsedDatasetPromise = Promise.all([
      d3.csv(getSchoolHistoryDataUrl()),
      loadSchoolMetadata()
    ]).then(([rawRows, metadataById]) => {
      const columns = rawRows.columns || Object.keys(rawRows[0] || {});
      const { idColumn, nameColumn, yearColumn, attributeColumns } = resolveDatasetColumns(columns);

      const rows = rawRows
        .map((rawRow) => {
          const schoolId = String(rawRow[idColumn] ?? "").trim();
          const metadata = metadataById.get(schoolId);
          const fallbackSchoolName = nameColumn ? String(rawRow[nameColumn] ?? "").trim() : "";
          const parsed = {
            schoolId,
            school: metadata?.school || fallbackSchoolName,
            year: toNumber(rawRow[yearColumn]),
            lat: metadata?.lat,
            lon: metadata?.lon,
            state: metadata?.state || "",
            city: metadata?.city || ""
          };

          attributeColumns.forEach((column) => {
            parsed[column] = toNumber(rawRow[column]);
          });

          return parsed;
        })
        .filter(
          (row) =>
            row.schoolId &&
            row.school &&
            Number.isFinite(row.year) &&
            attributeColumns.some((column) => Number.isFinite(row[column]))
        );

      const attributes = attributeColumns
        .map((column) => {
          const values = rows.map((row) => row[column]).filter(Number.isFinite);
          if (!values.length) {
            return null;
          }

          const kind = inferFormatKind(column, values);
          return {
            key: column,
            label: toLabel(column),
            kind,
            availableCount: values.length,
            ...buildAttributeFormatters(kind)
          };
        })
        .filter(Boolean);

      return {
        rows,
        attributes,
        idColumn,
        nameColumn,
        yearColumn
      };
    });
  }

  return parsedDatasetPromise;
}

export function getDatasetMode() {
  return currentDatasetMode;
}

export function setDatasetMode(mode) {
  const nextMode = mode === DATASET_MODE.IMPUTED ? DATASET_MODE.IMPUTED : DATASET_MODE.RAW;
  if (nextMode === currentDatasetMode) {
    return { changed: false, mode: currentDatasetMode };
  }

  currentDatasetMode = nextMode;
  clearDatasetCaches();
  notifyDatasetModeSubscribers();
  return { changed: true, mode: currentDatasetMode };
}

export function toggleDatasetMode() {
  return setDatasetMode(
    currentDatasetMode === DATASET_MODE.RAW ? DATASET_MODE.IMPUTED : DATASET_MODE.RAW
  );
}

export function subscribeDatasetMode(listener) {
  datasetModeSubscribers.add(listener);
  listener(currentDatasetMode);
  return () => {
    datasetModeSubscribers.delete(listener);
  };
}

export async function getSharedNumericAttributes() {
  if (!sharedAttributesPromise) {
    sharedAttributesPromise = loadDataset().then((dataset) => dataset.attributes);
  }

  return sharedAttributesPromise;
}

export function getLatestSharedSchoolYear() {
  if (!latestYearPromise) {
    latestYearPromise = loadDataset().then((dataset) => d3.max(dataset.rows, (row) => row.year));
  }

  return latestYearPromise;
}

export function getSharedSchoolYears() {
  if (!sharedSchoolYearsPromise) {
    sharedSchoolYearsPromise = loadDataset().then((dataset) =>
      [...new Set(dataset.rows.map((row) => row.year))].sort((a, b) => d3.ascending(a, b))
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
      loadDataset().then((dataset) =>
        dataset.rows
          .filter((row) => row.year === targetYear)
          .sort((a, b) => d3.ascending(a.schoolId, b.schoolId))
      )
    );
  }

  return schoolsByYearPromise.get(targetYear);
}

export function getSharedSchoolHistory() {
  if (!schoolHistoryPromise) {
    schoolHistoryPromise = loadDataset().then((dataset) => dataset.rows);
  }

  return schoolHistoryPromise;
}

export function getSharedEarningsHistory() {
  return getSharedSchoolHistory();
}
