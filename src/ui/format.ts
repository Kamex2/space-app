import { julianToDate } from '../ephemeris/time';

/** Format a Julian Date as 'YYYY年MM月DD日' (UTC). */
export function formatJDDate(jd: number): string {
  const d = julianToDate(jd);
  return `${d.getUTCFullYear()}年${String(d.getUTCMonth() + 1).padStart(2, '0')}月${String(
    d.getUTCDate(),
  ).padStart(2, '0')}日`;
}

/** Format a Julian Date as 'YYYY-MM-DD' for <input type="date"> value. */
export function formatJDInput(jd: number): string {
  const d = julianToDate(jd);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Format a Julian Date as 'YYYY/MM/DD' (compact). */
export function formatJDSlash(jd: number): string {
  const d = julianToDate(jd);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

export const round = (v: number, digits: number): string => v.toFixed(digits);
