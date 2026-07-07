/**
 * Real fireball (bolide) atmospheric-impact events, recorded by US government
 * sensors — NASA/JPL Fireball API (https://ssd-api.jpl.nasa.gov/fireball.api,
 * fetched 2026-07-04, 40 most recent events).
 * energyKt = estimated impact energy in kilotons of TNT.
 */
export interface Fireball {
  dateIso: string;
  energyKt: number;
  /** +N / −S [deg] */
  lat: number;
  /** +E / −W [deg] */
  lon: number;
}

export const FIREBALLS: Fireball[] = [
  { dateIso: '2026-06-11T02:00:58Z', energyKt: 0.11, lat: -18.7, lon: 16.1 },
  { dateIso: '2026-05-30T18:06:23Z', energyKt: 1.1, lat: 42.0, lon: -70.5 },
  { dateIso: '2026-05-21T02:15:51Z', energyKt: 0.12, lat: 46.6, lon: 133.1 },
  { dateIso: '2026-05-10T16:57:37Z', energyKt: 0.19, lat: -45.6, lon: -109.8 },
  { dateIso: '2026-05-07T05:52:03Z', energyKt: 0.2, lat: 32.5, lon: -36.8 },
  { dateIso: '2026-04-29T14:00:39Z', energyKt: 0.16, lat: -81.0, lon: 133.9 },
  { dateIso: '2026-04-08T01:58:47Z', energyKt: 0.1, lat: 13.4, lon: -170.2 },
  { dateIso: '2026-04-01T23:59:35Z', energyKt: 0.079, lat: 57.9, lon: -158.6 },
  { dateIso: '2026-04-01T02:13:14Z', energyKt: 0.086, lat: -41.9, lon: -54.7 },
  { dateIso: '2026-03-23T19:23:43Z', energyKt: 0.17, lat: 54.6, lon: -144.1 },
  { dateIso: '2026-03-20T10:45:59Z', energyKt: 0.098, lat: -52.9, lon: -143.7 },
  { dateIso: '2026-03-17T12:56:42Z', energyKt: 0.37, lat: 41.2, lon: -82.0 },
  { dateIso: '2026-02-10T14:26:26Z', energyKt: 0.076, lat: -64.0, lon: -14.0 },
  { dateIso: '2026-01-31T18:07:14Z', energyKt: 0.19, lat: 4.1, lon: -173.4 },
  { dateIso: '2026-01-30T10:25:37Z', energyKt: 0.12, lat: -45.0, lon: 174.5 },
  { dateIso: '2025-12-16T20:58:12Z', energyKt: 0.29, lat: -24.1, lon: -92.4 },
  { dateIso: '2025-11-15T00:48:43Z', energyKt: 0.32, lat: -62.2, lon: -94.7 },
  { dateIso: '2025-11-11T17:39:51Z', energyKt: 0.28, lat: 27.3, lon: -79.8 },
  { dateIso: '2025-10-20T13:31:27Z', energyKt: 0.073, lat: 5.7, lon: -135.2 },
  { dateIso: '2025-09-13T22:24:59Z', energyKt: 0.48, lat: -38.1, lon: -64.8 },
  { dateIso: '2025-09-10T11:00:57Z', energyKt: 0.098, lat: -14.8, lon: -142.4 },
  { dateIso: '2025-09-09T17:49:10Z', energyKt: 0.44, lat: -2.3, lon: -39.5 },
  { dateIso: '2025-09-08T10:09:15Z', energyKt: 0.12, lat: 26.4, lon: 42.2 },
  { dateIso: '2025-08-19T14:08:48Z', energyKt: 1.6, lat: 30.9, lon: 131.8 },
  { dateIso: '2025-08-12T04:09:48Z', energyKt: 0.15, lat: -58.5, lon: -22.3 },
  { dateIso: '2025-07-11T01:48:33Z', energyKt: 0.11, lat: -6.6, lon: -167.5 },
  { dateIso: '2025-06-26T16:24:57Z', energyKt: 0.48, lat: 33.4, lon: -84.1 },
  { dateIso: '2025-06-26T00:37:20Z', energyKt: 0.39, lat: 12.1, lon: -103.6 },
  { dateIso: '2025-06-21T20:55:14Z', energyKt: 0.1, lat: -61.3, lon: 157.9 },
  { dateIso: '2025-05-31T23:06:33Z', energyKt: 1.0, lat: 21.1, lon: -98.8 },
  { dateIso: '2025-04-28T15:01:15Z', energyKt: 0.12, lat: -45.1, lon: 67.3 },
  { dateIso: '2025-04-21T09:27:34Z', energyKt: 0.082, lat: -29.1, lon: 151.6 },
  { dateIso: '2025-04-08T14:16:48Z', energyKt: 0.076, lat: -32.2, lon: 10.4 },
  { dateIso: '2025-03-29T08:12:43Z', energyKt: 0.19, lat: -49.3, lon: 14.3 },
  { dateIso: '2025-03-27T16:05:23Z', energyKt: 2.4, lat: 14.3, lon: -111.5 },
  { dateIso: '2025-03-24T05:51:43Z', energyKt: 0.16, lat: -70.4, lon: 114.2 },
  { dateIso: '2025-03-21T05:06:26Z', energyKt: 0.13, lat: -22.8, lon: 123.5 },
  { dateIso: '2025-03-18T17:48:32Z', energyKt: 0.33, lat: -1.5, lon: -30.4 },
  { dateIso: '2025-03-13T09:46:51Z', energyKt: 1.8, lat: -7.1, lon: 75.9 },
  { dateIso: '2025-02-22T10:26:08Z', energyKt: 0.18, lat: 28.1, lon: 120.0 },
];

/** '北緯42.0°・西経70.5°' style label. */
export function fireballPlaceJa(f: Fireball): string {
  const latTxt = `${f.lat >= 0 ? '北緯' : '南緯'}${Math.abs(f.lat).toFixed(1)}°`;
  const lonTxt = `${f.lon >= 0 ? '東経' : '西経'}${Math.abs(f.lon).toFixed(1)}°`;
  return `${latTxt}・${lonTxt}`;
}
