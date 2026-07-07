// JPL "Approximate Positions of the Planets" — Keplerian elements and rates.
// Source: https://ssd.jpl.nasa.gov/planets/approx_pos.html  (Table 1)
// Valid for the interval 1800 AD – 2050 AD.
// Values transcribed verbatim from Standish, JPL Table 1.
//
// Column meaning (element0 / rate-per-Julian-century):
//   a      : semi-major axis                [au]      / [au/Cy]
//   e      : eccentricity                   [-]       / [rad/Cy] (unitless rate)
//   I      : inclination                    [deg]     / [deg/Cy]
//   L      : mean longitude                 [deg]     / [deg/Cy]
//   varpi  : longitude of perihelion (ϖ)    [deg]     / [deg/Cy]
//   Omega  : longitude of ascending node(Ω) [deg]     / [deg/Cy]

export interface KeplerElementRow {
  /** element values at J2000.0 */
  a: number;
  e: number;
  I: number;
  L: number;
  varpi: number;
  Omega: number;
  /** rates per Julian century */
  aDot: number;
  eDot: number;
  IDot: number;
  LDot: number;
  varpiDot: number;
  OmegaDot: number;
}

export type PlanetKey =
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune';

/** Ordered list of the 8 target bodies (inner -> outer). */
export const PLANET_ORDER: PlanetKey[] = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

/** Japanese display names. */
export const PLANET_NAME_JA: Record<PlanetKey, string> = {
  mercury: '水星',
  venus: '金星',
  earth: '地球',
  mars: '火星',
  jupiter: '木星',
  saturn: '土星',
  uranus: '天王星',
  neptune: '海王星',
};

// NOTE: "earth" here is the Earth-Moon barycenter (EM Bary), per JPL Table 1.
export const PLANET_ELEMENTS: Record<PlanetKey, KeplerElementRow> = {
  mercury: {
    a: 0.38709927,   aDot: 0.00000037,
    e: 0.20563593,   eDot: 0.00001906,
    I: 7.00497902,   IDot: -0.00594749,
    L: 252.25032350, LDot: 149472.67411175,
    varpi: 77.45779628, varpiDot: 0.16047689,
    Omega: 48.33076593, OmegaDot: -0.12534081,
  },
  venus: {
    a: 0.72333566,   aDot: 0.00000390,
    e: 0.00677672,   eDot: -0.00004107,
    I: 3.39467605,   IDot: -0.00078890,
    L: 181.97909950, LDot: 58517.81538729,
    varpi: 131.60246718, varpiDot: 0.00268329,
    Omega: 76.67984255, OmegaDot: -0.27769418,
  },
  earth: {
    a: 1.00000261,   aDot: 0.00000562,
    e: 0.01671123,   eDot: -0.00004392,
    I: -0.00001531,  IDot: -0.01294668,
    L: 100.46457166, LDot: 35999.37244981,
    varpi: 102.93768193, varpiDot: 0.32327364,
    Omega: 0.0,      OmegaDot: 0.0,
  },
  mars: {
    a: 1.52371034,   aDot: 0.00001847,
    e: 0.09339410,   eDot: 0.00007882,
    I: 1.84969142,   IDot: -0.00813131,
    L: -4.55343205,  LDot: 19140.30268499,
    varpi: -23.94362959, varpiDot: 0.44441088,
    Omega: 49.55953891, OmegaDot: -0.29257343,
  },
  jupiter: {
    a: 5.20288700,   aDot: -0.00011607,
    e: 0.04838624,   eDot: -0.00013253,
    I: 1.30439695,   IDot: -0.00183714,
    L: 34.39644051,  LDot: 3034.74612775,
    varpi: 14.72847983, varpiDot: 0.21252668,
    Omega: 100.47390909, OmegaDot: 0.20469106,
  },
  saturn: {
    a: 9.53667594,   aDot: -0.00125060,
    e: 0.05386179,   eDot: -0.00050991,
    I: 2.48599187,   IDot: 0.00193609,
    L: 49.95424423,  LDot: 1222.49362201,
    varpi: 92.59887831, varpiDot: -0.41897216,
    Omega: 113.66242448, OmegaDot: -0.28867794,
  },
  uranus: {
    a: 19.18916464,  aDot: -0.00196176,
    e: 0.04725744,   eDot: -0.00004397,
    I: 0.77263783,   IDot: -0.00242939,
    L: 313.23810451, LDot: 428.48202785,
    varpi: 170.95427630, varpiDot: 0.40805281,
    Omega: 74.01692503, OmegaDot: 0.04240589,
  },
  neptune: {
    a: 30.06992276,  aDot: 0.00026291,
    e: 0.00859048,   eDot: 0.00005105,
    I: 1.77004347,   IDot: 0.00035372,
    L: -55.12002969, LDot: 218.45945325,
    varpi: 44.96476227, varpiDot: -0.32241464,
    Omega: 131.78422574, OmegaDot: -0.00508664,
  },
};
