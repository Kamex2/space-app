/**
 * Acceptance / sanity checks (spec §6).
 * Run with:  npx tsx scripts/sanity.ts
 * Exits with code 1 if any check fails.
 */
import { PLANET_ORDER, PLANET_ELEMENTS, PLANET_NAME_JA } from '../src/data/planetElements';
import {
  planetStateAtJD,
  planetElementsAtJD,
  radius,
  orbitalPeriodDays,
} from '../src/ephemeris/ephemeris';
import { dateToJulian } from '../src/ephemeris/time';
import { solveKepler, keplerResidual } from '../src/ephemeris/kepler';
import { propagate, specificEnergy } from '../src/sim/propagate';
import { GM_SUN, KMS_TO_AU_PER_DAY } from '../src/data/constants';
import { solveLambert } from '../src/sim/lambert';
import { solveTransfer } from '../src/sim/porkchop';
import { SMALL_BODIES } from '../src/data/smallBodies';
import { smallBodyStateAtJD } from '../src/ephemeris/smallBody';

let failures = 0;
const log = (msg: string) => console.log(msg);
function check(name: string, ok: boolean, detail: string) {
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}  — ${detail}`);
  if (!ok) failures++;
}

log('=== 3D太陽系エクスプローラー サニティチェック (spec §6) ===\n');

// ---------------------------------------------------------------------------
// Check 1: |r| within [perihelion, aphelion] for all planets, all epochs.
// ---------------------------------------------------------------------------
log('[1] 全惑星・全年代で |r| が近日点〜遠日点距離の範囲内');
const years = [1800, 1900, 2000, 2050];
let rangeOk = true;
let worst = '';
for (const planet of PLANET_ORDER) {
  const row = PLANET_ELEMENTS[planet];
  for (const y of years) {
    const jd = dateToJulian(new Date(Date.UTC(y, 0, 1)));
    const el = planetElementsAtJD(planet, jd);
    const r = radius(planetStateAtJD(planet, jd).pos);
    const peri = el.a * (1 - el.e);
    const apo = el.a * (1 + el.e);
    const tol = 1e-6;
    const inside = r >= peri - tol && r <= apo + tol;
    if (!inside) {
      rangeOk = false;
      worst = `${planet} ${y}: r=${r.toFixed(6)} not in [${peri.toFixed(6)}, ${apo.toFixed(6)}]`;
    }
    // Reference to row silences unused warning and documents intent.
    void row;
  }
}
check(
  '距離レンジ',
  rangeOk,
  rangeOk ? '32ケース(8惑星×4年代)すべて範囲内' : worst,
);

// ---------------------------------------------------------------------------
// Check 2: Earth |r| ≈ 0.983 AU early Jan, ≈ 1.017 AU early Jul (±0.002).
// ---------------------------------------------------------------------------
log('\n[2] 地球: 1月上旬 |r|≈0.983AU, 7月上旬 |r|≈1.017AU (±0.002)');
const jan = dateToJulian(new Date(Date.UTC(2000, 0, 4)));
const jul = dateToJulian(new Date(Date.UTC(2000, 6, 4)));
const rJan = radius(planetStateAtJD('earth', jan).pos);
const rJul = radius(planetStateAtJD('earth', jul).pos);
check('地球 近日点付近(1月)', Math.abs(rJan - 0.983) <= 0.002, `|r|=${rJan.toFixed(5)} AU`);
check('地球 遠日点付近(7月)', Math.abs(rJul - 1.017) <= 0.002, `|r|=${rJul.toFixed(5)} AU`);

// ---------------------------------------------------------------------------
// Check 3: Mercury orbital period ≈ 88 days (±1) via successive perihelia.
// ---------------------------------------------------------------------------
log('\n[3] 水星の公転周期 ≈ 88日 (連続近日点通過から, ±1日)');
// Detect perihelion passages by scanning r(t) on a fine grid for local minima,
// then refining each minimum with a local sub-sample search.
function findPerihelia(planet: 'mercury', startJD: number, spanDays: number, dt: number) {
  const n = Math.floor(spanDays / dt);
  const jds: number[] = [];
  const rs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const jd = startJD + i * dt;
    jds.push(jd);
    rs.push(radius(planetStateAtJD(planet, jd).pos));
  }
  const passages: number[] = [];
  // Interior strict local minima only (i-1 > i < i+1).
  for (let i = 1; i < rs.length - 1; i++) {
    if (rs[i] < rs[i - 1] && rs[i] < rs[i + 1]) {
      // Refine around jds[i].
      let bestJD = jds[i];
      let bestR = rs[i];
      for (let t = jds[i] - dt; t <= jds[i] + dt; t += dt / 100) {
        const rr = radius(planetStateAtJD(planet, t).pos);
        if (rr < bestR) {
          bestR = rr;
          bestJD = t;
        }
      }
      passages.push(bestJD);
    }
  }
  return passages;
}
// Start mid-orbit so the first detected minimum is a genuine perihelion.
const peri = findPerihelia('mercury', dateToJulian(new Date(Date.UTC(2000, 0, 15))), 300, 0.5);
let mercPeriod = NaN;
if (peri.length >= 2) mercPeriod = peri[1] - peri[0];
check(
  '水星 近日点間隔',
  Number.isFinite(mercPeriod) && Math.abs(mercPeriod - 88) <= 1,
  `連続近日点間隔 = ${Number.isFinite(mercPeriod) ? mercPeriod.toFixed(2) : 'n/a'} 日`,
);
// Cross-check against analytic period from a.
const mercAnalytic = orbitalPeriodDays(PLANET_ELEMENTS.mercury.a);
check('水星 解析周期(参考)', Math.abs(mercAnalytic - 88) <= 1, `解析周期 = ${mercAnalytic.toFixed(3)} 日`);

// ---------------------------------------------------------------------------
// Check 4: Kepler solver residual < 1e-8 for e=0.2 across all M.
// ---------------------------------------------------------------------------
log('\n[4] ケプラーソルバ残差 < 1e-8 (e=0.2, M全域)');
let maxRes = 0;
for (let deg = -180; deg <= 180; deg += 1) {
  const M = (deg * Math.PI) / 180;
  const E = solveKepler(M, 0.2, 1e-10);
  const res = keplerResidual(M, 0.2, E);
  if (res > maxRes) maxRes = res;
}
check('ケプラー残差', maxRes < 1e-8, `max残差 = ${maxRes.toExponential(3)} rad`);

// ---------------------------------------------------------------------------
// Check 5: RK4 energy conservation < 1e-6 relative on a planet-free arc.
// ---------------------------------------------------------------------------
log('\n[5] RK4 エネルギー保存: 惑星接近のない2体区間で相対誤差 < 1e-6');
// Construct a bound heliocentric orbit in the asteroid-belt gap (~2.7 AU),
// well clear of Mars and Jupiter, so the arc stays far from every planet.
const startJD = dateToJulian(new Date(Date.UTC(2015, 0, 1)));
const rTest = 2.7; // AU
const vCirc = Math.sqrt(GM_SUN / rTest); // AU/day, circular speed
// Place it out of the ecliptic slightly and give it a slightly sub-circular
// speed so it stays bound and away from planets.
const launch = {
  pos: { x: rTest, y: 0, z: 0.2 },
  vel: { x: 0, y: vCirc * 0.98, z: 0 },
};
// Pure 2-body arc (Sun only) — isolates the RK4 integrator's energy drift
// from real planetary perturbations, matching the "2体区間" intent of the spec.
const result = propagate({
  startJD,
  initial: launch,
  durationDays: 300,
  baseStep: 0.25,
  sampleEvery: 1,
  sunOnly: true,
});
const e0 = specificEnergy({ pos: result.samples[0].pos, vel: result.samples[0].vel });
const eN = specificEnergy({
  pos: result.samples[result.samples.length - 1].pos,
  vel: result.samples[result.samples.length - 1].vel,
});
const relErr = Math.abs((eN - e0) / e0);
check(
  'エネルギー保存',
  relErr < 1e-6,
  `相対誤差 = ${relErr.toExponential(3)} (2体・Sun-only, 300日, dt=0.25日)`,
);

// ---------------------------------------------------------------------------
// Check 6: Lambert solver — self-consistency on Earth's own orbit.
// Solving Lambert between two points of Earth's orbit must reproduce
// Earth's own orbital velocity at departure.
// ---------------------------------------------------------------------------
log('\n[6] ランベルトソルバ: 地球軌道上の2点間の解が地球の速度を再現する');
{
  const t0 = dateToJulian(new Date(Date.UTC(2010, 3, 1)));
  const tofs = [60, 120, 200, 300];
  let worstRel = 0;
  for (const tof of tofs) {
    const s0 = planetStateAtJD('earth', t0);
    const s1 = planetStateAtJD('earth', t0 + tof);
    const lam = solveLambert(s0.pos, s1.pos, tof);
    if (!lam) {
      worstRel = Infinity;
      break;
    }
    const dv = Math.hypot(
      lam.v1.x - s0.vel.x,
      lam.v1.y - s0.vel.y,
      lam.v1.z - s0.vel.z,
    );
    const rel = dv / Math.hypot(s0.vel.x, s0.vel.y, s0.vel.z);
    if (rel > worstRel) worstRel = rel;
  }
  // The reference "truth" comes from time-varying osculating elements, which
  // drift slightly over the arc; agreement to <0.5% confirms the solver.
  check(
    'ランベルト自己整合',
    worstRel < 5e-3,
    `最大相対速度差 = ${worstRel.toExponential(3)} (TOF 60–300日)`,
  );
}

// ---------------------------------------------------------------------------
// Check 7: Lambert Earth→Mars, 2020 window (Perseverance-like):
// departure v∞ should be a realistic ~3–4.5 km/s.
// ---------------------------------------------------------------------------
log('\n[7] ランベルト 地球→火星 2020年窓: 出発v∞が現実的(2.5〜5 km/s)');
{
  const launch = dateToJulian(new Date(Date.UTC(2020, 6, 30))); // 2020-07-30
  const sol = solveTransfer('mars', launch, 204); // arrival 2021-02-18
  const ok = sol !== null && sol.vinfDep > 2.5 && sol.vinfDep < 5;
  check(
    '火星転送 v∞',
    ok,
    sol
      ? `出発v∞ = ${sol.vinfDep.toFixed(2)} km/s / 到着v∞ = ${sol.vinfArr.toFixed(2)} km/s / C3 = ${sol.c3.toFixed(1)} km²/s²`
      : 'ランベルト解なし',
  );
  // And the transfer arc, propagated as pure 2-body, must actually arrive at
  // Mars' position (patched-conic consistency).
  if (sol) {
    const twoBody = propagate({
      startJD: sol.launchJD,
      initial: { pos: planetStateAtJD('earth', sol.launchJD).pos, vel: sol.initial.vel },
      durationDays: sol.tofDays,
      baseStep: 0.25,
      sampleEvery: 1000000,
      sunOnly: true,
    });
    const end = twoBody.samples[twoBody.samples.length - 1].pos;
    const missAU = Math.hypot(
      end.x - sol.arrivalPos.x,
      end.y - sol.arrivalPos.y,
      end.z - sol.arrivalPos.z,
    );
    check(
      '火星転送 到着精度(2体)',
      missAU < 0.01,
      `到着位置誤差 = ${(missAU * 1.495978707e8).toExponential(2)} km (${missAU.toExponential(2)} AU)`,
    );
  }
}
void KMS_TO_AU_PER_DAY;

// ---------------------------------------------------------------------------
// Check 8: differential correction — the refined transfer must reach Mars
// within 0.005 AU under FULL N-body gravity (this is what the app flies).
// ---------------------------------------------------------------------------
log('\n[8] 微分補正: N体重力下で火星に 0.005 AU 以内まで到達');
{
  const launch = dateToJulian(new Date(Date.UTC(2020, 6, 30)));
  const sol = solveTransfer('mars', launch, 204);
  if (!sol) {
    check('N体到着精度', false, 'ランベルト解なし');
  } else {
    const nbody = propagate({
      startJD: sol.launchJD,
      initial: sol.initial,
      durationDays: sol.tofDays,
      baseStep: 0.5,
      closeRange: 0.1,
      fineStep: 0.02,
      sampleEvery: 1000000,
    });
    const end = nbody.samples[nbody.samples.length - 1].pos;
    const mars = planetStateAtJD('mars', sol.arrivalJD).pos;
    const missAU = Math.hypot(end.x - mars.x, end.y - mars.y, end.z - mars.z);
    check(
      'N体到着精度',
      missAU < 0.005,
      `到着時の火星までの距離 = ${missAU.toExponential(2)} AU (${(missAU * 1.495978707e8 / 1e4).toFixed(1)}万km)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Check 9: Halley's comet — at the 1986 perihelion epoch (tp = JD 2446469.97,
// 1986-02-09, from JPL SBDB) the propagated |r| must equal q ≈ 0.5749 AU.
// ---------------------------------------------------------------------------
log('\n[9] ハレー彗星: 1986-02-09の近日点通過で |r| ≈ q = 0.575 AU');
{
  const halley = SMALL_BODIES.find((b) => b.key === 'halley')!;
  const tp1986 = 2446469.9736;
  const r = radius(smallBodyStateAtJD(halley, tp1986).pos);
  const q = halley.a * (1 - halley.e);
  check(
    'ハレー 1986回帰',
    Math.abs(r - q) < 0.01,
    `|r|=${r.toFixed(4)} AU vs q=${q.toFixed(4)} AU（epoch 1968の要素から18年伝播）`,
  );
}

// ---------------------------------------------------------------------------
// Check 10: Apophis — closest approach to Earth in April 2029 should land on
// 2029-04-13 (real event: ~38,000 km). 2-body propagation of fixed SBDB
// elements won't nail the exact miss distance, but date and order of
// magnitude must hold.
// ---------------------------------------------------------------------------
log('\n[10] アポフィス: 2029年4月の地球最接近が4月13日±2日・0.01 AU以内');
{
  const apophis = SMALL_BODIES.find((b) => b.key === 'apophis')!;
  const t0 = dateToJulian(new Date(Date.UTC(2029, 3, 1)));
  let bestJD = t0;
  let bestD = Infinity;
  for (let jd = t0; jd <= t0 + 30; jd += 0.01) {
    const a = smallBodyStateAtJD(apophis, jd).pos;
    const e = planetStateAtJD('earth', jd).pos;
    const d = Math.hypot(a.x - e.x, a.y - e.y, a.z - e.z);
    if (d < bestD) {
      bestD = d;
      bestJD = jd;
    }
  }
  const target = dateToJulian(new Date(Date.UTC(2029, 3, 13)));
  const dateOk = Math.abs(bestJD - target) <= 2;
  check(
    'アポフィス 2029接近',
    dateOk && bestD < 0.01,
    `最接近 JD=${bestJD.toFixed(2)}（4/13との差 ${(bestJD - target).toFixed(2)}日）距離 ${bestD.toExponential(2)} AU = ${(bestD * 1.495978707e8 / 1e4).toFixed(1)}万km`,
  );
}

// ---------------------------------------------------------------------------
// Check 11: NEO 2025 UK9 — JPL CAD予報の2026-10-31接近(0.0021 AU)を再現。
// ---------------------------------------------------------------------------
log('\n[11] NEO 2025 UK9: 2026-10-31の地球接近を ±3日・0.01 AU以内で再現');
{
  const uk9 = SMALL_BODIES.find((b) => b.key === 'uk9-2025')!;
  const t0 = dateToJulian(new Date(Date.UTC(2026, 9, 1)));
  let bestJD = t0;
  let bestD = Infinity;
  for (let jd = t0; jd <= t0 + 60; jd += 0.02) {
    const a = smallBodyStateAtJD(uk9, jd).pos;
    const e = planetStateAtJD('earth', jd).pos;
    const d = Math.hypot(a.x - e.x, a.y - e.y, a.z - e.z);
    if (d < bestD) {
      bestD = d;
      bestJD = jd;
    }
  }
  const target = dateToJulian(new Date(Date.UTC(2026, 9, 31)));
  check(
    '2025 UK9 接近再現',
    Math.abs(bestJD - target) <= 3 && bestD < 0.01,
    `最接近 JD=${bestJD.toFixed(2)}（10/31との差 ${(bestJD - target).toFixed(2)}日）距離 ${bestD.toExponential(2)} AU（CAD予報: 0.0021 AU）`,
  );
}

// ---------------------------------------------------------------------------
log('\n=== 結果 ===');
if (failures === 0) {
  log('すべてのチェックに合格しました。');
} else {
  log(`${failures} 件のチェックが失敗しました。`);
}
// silence unused import
void PLANET_NAME_JA;
process.exit(failures === 0 ? 0 : 1);
