import { JD_J2000, DAYS_PER_CENTURY } from '../data/constants';

/**
 * Convert a JavaScript Date (interpreted as UTC) to a Julian Date.
 * We treat the timeline as TT ≈ UTC; the sub-minute difference is irrelevant
 * at the accuracy of the JPL approximate elements.
 */
export function dateToJulian(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Convert a Julian Date back to a JavaScript Date (UTC). */
export function julianToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

/** Julian Date -> Julian centuries past J2000.0. */
export function julianCenturiesSinceJ2000(jd: number): number {
  return (jd - JD_J2000) / DAYS_PER_CENTURY;
}

/** Timeline bounds from the spec (inclusive). */
export const DATE_MIN = new Date(Date.UTC(1800, 0, 1));
export const DATE_MAX = new Date(Date.UTC(2050, 11, 31));

export const JD_MIN = dateToJulian(DATE_MIN);
export const JD_MAX = dateToJulian(DATE_MAX);
