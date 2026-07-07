/**
 * Real comets & asteroids — osculating elements from NASA/JPL SBDB
 * (https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=<id>&full-prec=true),
 * fetched 2026-07-04. Angles in degrees, epoch/tp as JD (TDB).
 *
 * These are fixed osculating elements propagated as 2-body Kepler orbits, so
 * positions drift from truth over decades (planetary perturbations are not
 * applied to these bodies) — fine for visualisation, not for mission design.
 */
export interface SmallBodyElements {
  key: string;
  nameJa: string;
  type: 'comet' | 'asteroid' | 'neo';
  /** epoch of osculation [JD TDB] */
  epochJD: number;
  a: number; // au
  e: number;
  i: number; // deg
  om: number; // deg — longitude of ascending node Ω
  w: number; // deg — argument of perihelion ω
  ma: number; // deg — mean anomaly at epoch
  /** sidereal period [days] (from SBDB; consistent with a) */
  periodDays: number;
  /** display colour */
  color: number;
  /** one-line description for the info panel */
  descJa: string;
}

export const SMALL_BODIES: SmallBodyElements[] = [
  {
    key: 'halley',
    nameJa: 'ハレー彗星',
    type: 'comet',
    epochJD: 2439875.5,
    a: 17.92863504856923,
    e: 0.9679359956953211,
    i: 162.1905300439129,
    om: 59.09894720612437,
    w: 112.2414314637764,
    ma: 274.3823371366792,
    periodDays: 27728.04608790421,
    color: 0x9fd8ff,
    descJa: '約76年周期。前回1986年、次回2061年に回帰',
  },
  {
    key: 'encke',
    nameJa: 'エンケ彗星',
    type: 'comet',
    epochJD: 2459847.5,
    a: 2.219688710074586,
    e: 0.8477496967533629,
    i: 11.41227811179314,
    om: 334.1935846036774,
    w: 187.1342463695676,
    ma: 243.1260693210057,
    periodDays: 1207.915450927171,
    color: 0xa0e8c8,
    descJa: '周期3.3年、既知で最短周期の彗星のひとつ',
  },
  {
    key: 'cg67p',
    nameJa: '67P/チュリュモフ・ゲラシメンコ彗星',
    type: 'comet',
    epochJD: 2457305.5,
    a: 3.462249489765068,
    e: 0.6409081306555051,
    i: 7.040294906760007,
    om: 50.13557380441372,
    w: 12.79824973415729,
    ma: 8.859927418758764,
    periodDays: 2353.076067532089,
    color: 0xc8c8e8,
    descJa: '探査機ロゼッタが着陸機フィラエを送った彗星',
  },
  {
    key: 'apophis',
    nameJa: 'アポフィス',
    type: 'asteroid',
    epochJD: 2461200.5,
    a: 0.9223592206975018,
    e: 0.1911492279663492,
    i: 3.340996879880978,
    om: 203.8936514240762,
    w: 126.6795706895841,
    ma: 175.3304026592739,
    periodDays: 323.5553366891694,
    color: 0xffb37a,
    descJa: '2029年4月13日に地球へ約3.2万kmまで大接近する小惑星',
  },
  {
    key: 'ceres',
    nameJa: 'ケレス',
    type: 'asteroid',
    epochJD: 2461200.5,
    a: 2.765552595034094,
    e: 0.07969229514816586,
    i: 10.58802780183462,
    om: 80.24862682043221,
    w: 73.29421453021587,
    ma: 274.4193463761342,
    periodDays: 1679.853119758983,
    color: 0xd8d0b8,
    descJa: '小惑星帯最大の天体・準惑星。探査機ドーンが周回',
  },
  {
    key: 'eros',
    nameJa: 'エロス',
    type: 'asteroid',
    epochJD: 2461200.5,
    a: 1.458243716760167,
    e: 0.2228779627700761,
    i: 10.82854410314273,
    om: 304.2679713350896,
    w: 178.9181319135911,
    ma: 62.51145501986792,
    periodDays: 643.1963890927677,
    color: 0xc8a888,
    descJa: '探査機NEARシューメーカーが着陸した地球近傍小惑星',
  },
  {
    key: 'phaethon',
    nameJa: 'ファエトン',
    type: 'asteroid',
    epochJD: 2461200.5,
    a: 1.271464620920411,
    e: 0.8896722843692159,
    i: 22.31052728047163,
    om: 265.0988060455101,
    w: 322.300168483426,
    ma: 301.4858235833354,
    periodDays: 523.6665664767817,
    color: 0x8fd0e8,
    descJa: 'ふたご座流星群の母天体。彗星のような軌道を持つ小惑星',
  },
  // ---- 地球接近小惑星（NEO）: JPL CAD APIの実際の接近予報から選定 ----
  {
    key: 'al2-2025',
    nameJa: '2025 AL2',
    type: 'neo',
    epochJD: 2461200.5,
    a: 1.543922928159748,
    e: 0.4794632745163656,
    i: 2.936644860502214,
    om: 328.8671806494971,
    w: 63.71311860436004,
    ma: 299.6492166572739,
    periodDays: 700.707638869266,
    color: 0xff8866,
    descJa: '2026年8月16日に地球へ0.0072 AUまで接近',
  },
  {
    key: 'up6-2022',
    nameJa: '2022 UP6',
    type: 'neo',
    epochJD: 2459872.5,
    a: 1.211203511487088,
    e: 0.2687165823604357,
    i: 10.12167018698913,
    om: 22.49059851382148,
    w: 298.7212714492406,
    ma: 39.45622571172784,
    periodDays: 486.8824369427713,
    color: 0xff8866,
    descJa: '2026年10月15日に地球へ0.0067 AUまで接近',
  },
  {
    key: 'uk9-2025',
    nameJa: '2025 UK9',
    type: 'neo',
    epochJD: 2461200.5,
    a: 1.000086078263508,
    e: 0.2629346979374466,
    i: 2.257373474303622,
    om: 38.17306949559641,
    w: 102.9519668770199,
    ma: 144.6469702035694,
    periodDays: 365.297, // from a^1.5 (SBDB response omitted per)
    color: 0xff8866,
    descJa: '2026年10月31日に地球へ0.0021 AU（月までの約82%）まで接近',
  },
  {
    key: 'xf2-2019',
    nameJa: '2019 XF2',
    type: 'neo',
    epochJD: 2461200.5,
    a: 1.108086159856044,
    e: 0.2481936765249053,
    i: 13.6655489740042,
    om: 252.3885753561887,
    w: 101.7083486692117,
    ma: 260.892518457313,
    periodDays: 426.0481880669976,
    color: 0xff8866,
    descJa: '2026年12月4日に地球へ0.0080 AUまで接近',
  },
  {
    key: 'an10-1999',
    nameJa: '1999 AN10',
    type: 'neo',
    epochJD: 2461200.5,
    a: 1.458519700164067,
    e: 0.5620711861779988,
    i: 39.93237024085661,
    om: 314.3218479171364,
    w: 268.3383661349407,
    ma: 152.7265412179813,
    periodDays: 643.3789922393222,
    color: 0xffaa55,
    descJa: '直径約1km。2027年8月7日に秒速26kmで地球のそばを通過',
  },
  {
    key: 'wn5-2001',
    nameJa: '2001 WN5',
    type: 'neo',
    epochJD: 2461200.5,
    a: 1.711561211577039,
    e: 0.4673010002422763,
    i: 1.91953316452203,
    om: 277.3508336340066,
    w: 44.64214528637515,
    ma: 14.62048134466213,
    periodDays: 817.8752770002632,
    color: 0xff8866,
    descJa: '2028年6月26日に地球へ0.0017 AUまで接近',
  },
];

/**
 * Real upcoming Earth close approaches (JPL Close-Approach Data API,
 * dist < 0.01 AU, fetched 2026-07-04). 1 LD (月までの距離) = 0.002569 AU.
 */
export interface NeoApproach {
  bodyKey: string;
  /** close-approach epoch (UTC, ISO) */
  dateIso: string;
  /** nominal miss distance [AU] */
  distAU: number;
  /** relative velocity [km/s] */
  vRelKms: number;
}

export const NEO_APPROACHES: NeoApproach[] = [
  { bodyKey: 'al2-2025', dateIso: '2026-08-16T17:24Z', distAU: 0.00720312756740361, vRelKms: 12.45 },
  { bodyKey: 'up6-2022', dateIso: '2026-10-15T20:59Z', distAU: 0.00671765608540164, vRelKms: 9.02 },
  { bodyKey: 'uk9-2025', dateIso: '2026-10-31T02:35Z', distAU: 0.0021032915876806, vRelKms: 7.83 },
  { bodyKey: 'xf2-2019', dateIso: '2026-12-04T00:35Z', distAU: 0.00795386356544704, vRelKms: 10.2 },
  { bodyKey: 'an10-1999', dateIso: '2027-08-07T07:11Z', distAU: 0.0026060207695371, vRelKms: 26.28 },
  { bodyKey: 'wn5-2001', dateIso: '2028-06-26T05:23Z', distAU: 0.00166252990918888, vRelKms: 10.24 },
  { bodyKey: 'apophis', dateIso: '2029-04-13T21:46Z', distAU: 0.000254090910419299, vRelKms: 7.42 },
];

export const AU_PER_LD = 0.002569;
