/**
 * The 8 major annual meteor showers — activity windows, peak dates, ZHR
 * (zenithal hourly rate) and radiants per the IMO working list (values are
 * long-term averages; actual rates vary year to year).
 * Radiant RA/dec in degrees (J2000, at peak).
 */
export interface MeteorShower {
  key: string;
  nameJa: string;
  /** activity window,月/日 (inclusive). Window may wrap the new year. */
  start: { month: number; day: number };
  end: { month: number; day: number };
  peak: { month: number; day: number };
  /** zenithal hourly rate at peak */
  zhr: number;
  parentJa: string;
  radiantRA: number; // deg
  radiantDec: number; // deg
}

export const METEOR_SHOWERS: MeteorShower[] = [
  {
    key: 'quadrantids',
    nameJa: 'しぶんぎ座流星群',
    start: { month: 12, day: 28 },
    end: { month: 1, day: 12 },
    peak: { month: 1, day: 3 },
    zhr: 110,
    parentJa: '小惑星 2003 EH1',
    radiantRA: 230,
    radiantDec: 49,
  },
  {
    key: 'lyrids',
    nameJa: 'こと座流星群',
    start: { month: 4, day: 14 },
    end: { month: 4, day: 30 },
    peak: { month: 4, day: 22 },
    zhr: 18,
    parentJa: 'サッチャー彗星 (C/1861 G1)',
    radiantRA: 271,
    radiantDec: 34,
  },
  {
    key: 'eta-aquariids',
    nameJa: 'みずがめ座η流星群',
    start: { month: 4, day: 19 },
    end: { month: 5, day: 28 },
    peak: { month: 5, day: 6 },
    zhr: 50,
    parentJa: 'ハレー彗星 (1P)',
    radiantRA: 338,
    radiantDec: -1,
  },
  {
    key: 'perseids',
    nameJa: 'ペルセウス座流星群',
    start: { month: 7, day: 17 },
    end: { month: 8, day: 24 },
    peak: { month: 8, day: 13 },
    zhr: 100,
    parentJa: 'スイフト・タットル彗星 (109P)',
    radiantRA: 48,
    radiantDec: 58,
  },
  {
    key: 'orionids',
    nameJa: 'オリオン座流星群',
    start: { month: 10, day: 2 },
    end: { month: 11, day: 7 },
    peak: { month: 10, day: 21 },
    zhr: 20,
    parentJa: 'ハレー彗星 (1P)',
    radiantRA: 95,
    radiantDec: 16,
  },
  {
    key: 'leonids',
    nameJa: 'しし座流星群',
    start: { month: 11, day: 6 },
    end: { month: 11, day: 30 },
    peak: { month: 11, day: 17 },
    zhr: 15,
    parentJa: 'テンペル・タットル彗星 (55P)',
    radiantRA: 152,
    radiantDec: 22,
  },
  {
    key: 'geminids',
    nameJa: 'ふたご座流星群',
    start: { month: 12, day: 4 },
    end: { month: 12, day: 17 },
    peak: { month: 12, day: 14 },
    zhr: 150,
    parentJa: '小惑星ファエトン (3200)',
    radiantRA: 112,
    radiantDec: 33,
  },
  {
    key: 'ursids',
    nameJa: 'こぐま座流星群',
    start: { month: 12, day: 17 },
    end: { month: 12, day: 26 },
    peak: { month: 12, day: 22 },
    zhr: 10,
    parentJa: 'タットル彗星 (8P)',
    radiantRA: 217,
    radiantDec: 76,
  },
];

/** day-of-year (1..366) for a month/day in a given (proleptic UTC) year. */
function doy(year: number, month: number, day: number): number {
  const t0 = Date.UTC(year, 0, 1);
  const t = Date.UTC(year, month - 1, day);
  return Math.round((t - t0) / 86400000) + 1;
}

export interface ActiveShower {
  shower: MeteorShower;
  /** 0..1 intensity (Gaussian around the peak) */
  intensity: number;
  /** signed days until the peak (negative = peak has passed) */
  daysToPeak: number;
}

/**
 * Which showers are active on a given UTC date, with an intensity profile
 * peaking at 1 on the peak date and tapering toward the window edges.
 */
export function activeShowersAt(date: Date): ActiveShower[] {
  const year = date.getUTCFullYear();
  const d = doy(year, date.getUTCMonth() + 1, date.getUTCDate());
  const out: ActiveShower[] = [];
  for (const s of METEOR_SHOWERS) {
    const ds = doy(year, s.start.month, s.start.day);
    let de = doy(year, s.end.month, s.end.day);
    let dp = doy(year, s.peak.month, s.peak.day);
    let dd = d;
    const wraps = de < ds; // window crosses the new year
    if (wraps) {
      de += 365;
      if (dp < ds) dp += 365;
      if (dd < ds) dd += 365;
    }
    if (dd < ds || dd > de) continue;
    // Gaussian in days around the peak; sigma from the shorter half-window.
    const sigma = Math.max(1.5, Math.min(dp - ds, de - dp) / 2.2);
    const x = (dd - dp) / sigma;
    out.push({
      shower: s,
      intensity: Math.exp(-0.5 * x * x),
      daysToPeak: dp - dd,
    });
  }
  return out;
}
