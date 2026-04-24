import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const SCHOOL_DATA_URL = new URL("../data/shared-schools.csv", import.meta.url);
const EARNINGS_DATA_URL = new URL("../data/shared-earnings-by-year.csv", import.meta.url);

let schoolsPromise;
let earningsPromise;

function parseSchoolRow(row) {
  return {
    schoolId: row.schoolId,
    school: row.school,
    netPrice: Number(row.netPrice),
    graduationRate: Number(row.graduationRate),
    medianDebt: Number(row.medianDebt),
    medianEarnings: Number(row.medianEarnings),
    mobilityRate: Number(row.mobilityRate),
    admissionRate: Number(row.admissionRate)
  };
}

function parseEarningsRow(row) {
  return {
    schoolId: row.schoolId,
    school: row.school,
    year: Number(row.year),
    earnings: Number(row.earnings)
  };
}

export function getSharedSchoolData() {
  if (!schoolsPromise) {
    schoolsPromise = d3.csv(SCHOOL_DATA_URL, parseSchoolRow);
  }
  return schoolsPromise;
}

export function getSharedEarningsHistory() {
  if (!earningsPromise) {
    earningsPromise = d3.csv(EARNINGS_DATA_URL, parseEarningsRow);
  }
  return earningsPromise;
}
