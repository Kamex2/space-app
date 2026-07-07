import type { PlanetKey } from '../data/planetElements';
import { PLANET_ORDER } from '../data/planetElements';
import { GM_SUN, PLANET_GM, AU_IN_KM, KMS_TO_AU_PER_DAY } from '../data/constants';
import type { State, Vec3 } from '../ephemeris/ephemeris';
import { planetStateAtJD } from '../ephemeris/ephemeris';
import { add, sub, scale, len, dot } from './vec';

/**
 * Acceleration on a test particle at heliocentric position `r` [AU],
 * from the Sun plus the 8 planets (positions read from the ephemeris at `jd`).
 * Returns AU/day^2.
 */
export function acceleration(
  r: Vec3,
  planetPos: Record<PlanetKey, Vec3>,
): Vec3 {
  // Sun at origin.
  const rMag = len(r);
  const rMag3 = rMag * rMag * rMag;
  let ax = (-GM_SUN * r.x) / rMag3;
  let ay = (-GM_SUN * r.y) / rMag3;
  let az = (-GM_SUN * r.z) / rMag3;

  for (const p of PLANET_ORDER) {
    const pp = planetPos[p];
    if (pp === undefined) continue; // Sun-only mode passes an empty record
    const d = sub(pp, r); // vector from particle to planet
    const dMag = len(d);
    const dMag3 = dMag * dMag * dMag;
    const gm = PLANET_GM[p];
    // Direct term (planet pulls particle) + indirect term (planet pulls Sun,
    // i.e. non-inertial correction because frame is Sun-centred).
    const ppMag = len(pp);
    const ppMag3 = ppMag * ppMag * ppMag;
    ax += gm * (d.x / dMag3 - pp.x / ppMag3);
    ay += gm * (d.y / dMag3 - pp.y / ppMag3);
    az += gm * (d.z / dMag3 - pp.z / ppMag3);
  }
  return { x: ax, y: ay, z: az };
}

/** Planet positions cache at a given jd. */
export function planetPositionsAtJD(jd: number): Record<PlanetKey, Vec3> {
  const out = {} as Record<PlanetKey, Vec3>;
  for (const p of PLANET_ORDER) out[p] = planetStateAtJD(p, jd).pos;
  return out;
}

interface RK4State {
  pos: Vec3;
  vel: Vec3;
}

const EMPTY_PLANET_POS = {} as Record<PlanetKey, Vec3>;

/** One RK4 step of size h (days) starting at jd. */
function rk4Step(s: RK4State, jd: number, h: number, sunOnly = false): RK4State {
  const posAt = (offset: number) =>
    sunOnly ? EMPTY_PLANET_POS : planetPositionsAtJD(jd + offset);

  const pp0 = posAt(0);
  const ppH2 = posAt(h / 2);
  const ppH = posAt(h);

  // k1
  const a1 = acceleration(s.pos, pp0);
  const k1v = a1;
  const k1x = s.vel;

  // k2
  const p2 = add(s.pos, scale(k1x, h / 2));
  const v2 = add(s.vel, scale(k1v, h / 2));
  const a2 = acceleration(p2, ppH2);
  const k2v = a2;
  const k2x = v2;

  // k3
  const p3 = add(s.pos, scale(k2x, h / 2));
  const v3 = add(s.vel, scale(k2v, h / 2));
  const a3 = acceleration(p3, ppH2);
  const k3v = a3;
  const k3x = v3;

  // k4
  const p4 = add(s.pos, scale(k3x, h));
  const v4 = add(s.vel, scale(k3v, h));
  const a4 = acceleration(p4, ppH);
  const k4v = a4;
  const k4x = v4;

  const newPos = add(
    s.pos,
    scale(add(add(k1x, scale(k2x, 2)), add(scale(k3x, 2), k4x)), h / 6),
  );
  const newVel = add(
    s.vel,
    scale(add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), h / 6),
  );
  return { pos: newPos, vel: newVel };
}

/** Distance [AU] to the nearest planet from position r, and which planet. */
function nearestPlanetDistance(
  r: Vec3,
  planetPos: Record<PlanetKey, Vec3>,
): { planet: PlanetKey; dist: number } {
  let best: PlanetKey = 'earth';
  let bestDist = Infinity;
  for (const p of PLANET_ORDER) {
    const dMag = len(sub(planetPos[p], r));
    if (dMag < bestDist) {
      bestDist = dMag;
      best = p;
    }
  }
  return { planet: best, dist: bestDist };
}

export interface TrajectorySample {
  jd: number;
  pos: Vec3;
  vel: Vec3;
  /** heliocentric speed [AU/day] */
  speed: number;
}

export interface FlybyEvent {
  planet: PlanetKey;
  jd: number;
  /** closest-approach distance [AU] */
  distance: number;
  /** heliocentric speed change |v_after| − |v_before| [km/s] */
  deltaV: number;
  /** heliocentric speed just before/after (km/s) */
  speedBefore: number;
  speedAfter: number;
}

export interface PropagationResult {
  samples: TrajectorySample[];
  flybys: FlybyEvent[];
  /** minimum approach distance recorded per planet [AU] */
  minApproach: Partial<Record<PlanetKey, number>>;
}

export interface PropagationOptions {
  startJD: number;
  /** initial heliocentric state of the spacecraft */
  initial: State;
  /** propagation duration [days] */
  durationDays: number;
  /** nominal step [days] */
  baseStep?: number;
  /** refine step when within this distance of any planet [AU] */
  closeRange?: number;
  /** refined step [days] */
  fineStep?: number;
  /** flyby detection threshold [AU] */
  flybyThreshold?: number;
  /** store a sample only every N accepted steps (for line drawing) */
  sampleEvery?: number;
  /** if true, integrate under the Sun's gravity only (pure 2-body). */
  sunOnly?: boolean;
}

const speedKms = (v: Vec3) => len(v) / KMS_TO_AU_PER_DAY;

/**
 * Propagate a spacecraft (test particle) under Sun + 8-planet gravity with RK4.
 * Fixed base step, refined near planets. Detects flybys (local minima in the
 * distance to any planet inside `flybyThreshold`).
 */
export function propagate(opts: PropagationOptions): PropagationResult {
  const baseStep = opts.baseStep ?? 0.5;
  const closeRange = opts.closeRange ?? 0.1;
  const fineStep = opts.fineStep ?? 0.02;
  const flybyThreshold = opts.flybyThreshold ?? 0.05;
  const sampleEvery = opts.sampleEvery ?? 1;
  const sunOnly = opts.sunOnly ?? false;

  let jd = opts.startJD;
  const endJD = opts.startJD + opts.durationDays;
  let s: RK4State = { pos: { ...opts.initial.pos }, vel: { ...opts.initial.vel } };

  const samples: TrajectorySample[] = [];
  const flybys: FlybyEvent[] = [];
  const minApproach: Partial<Record<PlanetKey, number>> = {};

  // Per-planet tracking for local-minimum (closest approach) detection.
  const prevDist: Partial<Record<PlanetKey, number>> = {};
  const prevPrevDist: Partial<Record<PlanetKey, number>> = {};
  const approachSpeedBefore: Partial<Record<PlanetKey, number>> = {};

  let stepCount = 0;
  samples.push({ jd, pos: { ...s.pos }, vel: { ...s.vel }, speed: len(s.vel) });

  while (jd < endJD) {
    let h: number;
    if (sunOnly) {
      h = Math.min(baseStep, endJD - jd);
    } else {
      const planetPos = planetPositionsAtJD(jd);
      const near = nearestPlanetDistance(s.pos, planetPos);
      h = Math.min(near.dist < closeRange ? fineStep : baseStep, endJD - jd);
    }

    s = rk4Step(s, jd, h, sunOnly);
    jd += h;
    stepCount++;

    if (sunOnly) {
      if (stepCount % sampleEvery === 0 || jd >= endJD) {
        samples.push({ jd, pos: { ...s.pos }, vel: { ...s.vel }, speed: len(s.vel) });
      }
      continue;
    }

    const pp = planetPositionsAtJD(jd);
    // Update per-planet closest approach + flyby detection.
    for (const p of PLANET_ORDER) {
      const d = len(sub(pp[p], s.pos));
      if (minApproach[p] === undefined || d < (minApproach[p] as number)) {
        minApproach[p] = d;
      }
      const p1 = prevDist[p];
      const p2 = prevPrevDist[p];
      // Local minimum: p2 > p1 <= d, and inside threshold.
      if (
        p1 !== undefined &&
        p2 !== undefined &&
        p1 <= p2 &&
        p1 <= d &&
        p1 < flybyThreshold
      ) {
        const speedAfter = speedKms(s.vel);
        const speedBefore = approachSpeedBefore[p] ?? speedAfter;
        flybys.push({
          planet: p,
          jd: jd - h, // approx epoch of closest approach
          distance: p1,
          deltaV: speedAfter - speedBefore,
          speedBefore,
          speedAfter,
        });
      }
      // Record incoming speed while still approaching (for delta-v baseline).
      if (p1 === undefined || d < p1) {
        approachSpeedBefore[p] = speedKms(s.vel);
      }
      prevPrevDist[p] = prevDist[p];
      prevDist[p] = d;
    }

    if (stepCount % sampleEvery === 0 || jd >= endJD) {
      samples.push({ jd, pos: { ...s.pos }, vel: { ...s.vel }, speed: len(s.vel) });
    }
  }

  return { samples, flybys, minApproach };
}

/** Specific orbital energy (2-body, w.r.t. Sun) [AU^2/day^2]. */
export function specificEnergy(state: State): number {
  const r = len(state.pos);
  const v2 = dot(state.vel, state.vel);
  return v2 / 2 - GM_SUN / r;
}

/**
 * Build a launch state: spacecraft starts at Earth's position with
 * velocity = Earth's heliocentric velocity + a v∞ vector.
 * inPlaneDeg: angle of v∞ in the ecliptic plane relative to Earth's velocity.
 * outPlaneDeg: elevation of v∞ above/below the ecliptic plane.
 */
export function buildLaunchState(
  earthState: State,
  vInfKms: number,
  inPlaneDeg: number,
  outPlaneDeg: number,
): State {
  const vInf = vInfKms * KMS_TO_AU_PER_DAY; // AU/day magnitude
  // Local frame: forward = Earth velocity dir; up = ecliptic +z; side = up × forward.
  const forward = normOr(earthState.vel, { x: 1, y: 0, z: 0 });
  const up = { x: 0, y: 0, z: 1 };
  const side = normOr(cross3(up, forward), { x: 0, y: 1, z: 0 });
  // Recompute an orth: in-plane basis = forward & side; out-of-plane = up.
  const ip = (inPlaneDeg * Math.PI) / 180;
  const op = (outPlaneDeg * Math.PI) / 180;
  const cosOp = Math.cos(op);
  const dir: Vec3 = {
    x: cosOp * (Math.cos(ip) * forward.x + Math.sin(ip) * side.x) + Math.sin(op) * up.x,
    y: cosOp * (Math.cos(ip) * forward.y + Math.sin(ip) * side.y) + Math.sin(op) * up.y,
    z: cosOp * (Math.cos(ip) * forward.z + Math.sin(ip) * side.z) + Math.sin(op) * up.z,
  };
  const vVec = add(earthState.vel, scale(dir, vInf));
  // Offset the start position just outside Earth's sphere of influence
  // (~0.006 AU) along the departure direction. Starting exactly at Earth's
  // position would produce a 1/r^2 singularity in Earth's gravity term and is
  // unphysical (the spacecraft actually departs from the SOI edge).
  const EARTH_SOI = 0.006; // AU (~900,000 km, comfortably beyond ~0.0062 AU SOI)
  const startPos = add(earthState.pos, scale(dir, EARTH_SOI));
  return { pos: startPos, vel: vVec };
}

/** Earth's sphere-of-influence radius used for launch offset [AU]. */
export const EARTH_SOI_AU = 0.006;

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function normOr(v: Vec3, fallback: Vec3): Vec3 {
  const l = len(v);
  return l === 0 ? fallback : scale(v, 1 / l);
}

export { speedKms, AU_IN_KM };
