import type { PlanetKey } from '../data/planetElements';
import { KMS_TO_AU_PER_DAY } from '../data/constants';
import { planetStateAtJD, type Vec3, type State } from '../ephemeris/ephemeris';
import { sub, len, add, scale, normalize } from './vec';
import { solveLambert } from './lambert';
import { EARTH_SOI_AU, propagate } from './propagate';

/**
 * Porkchop plot — the classic launch-window chart. For a grid of
 * (launch date × time of flight), solve Lambert's problem Earth → target and
 * record the departure/arrival hyperbolic excess speeds v∞ [km/s].
 */

export interface PorkchopConfig {
  target: PlanetKey;
  launchStartJD: number;
  launchSpanDays: number;
  nLaunch: number;
  tofMinDays: number;
  tofMaxDays: number;
  nTof: number;
}

export interface PorkchopBest {
  iLaunch: number;
  iTof: number;
  launchJD: number;
  tofDays: number;
  vinfDep: number;
  vinfArr: number;
}

export interface PorkchopGrid {
  config: PorkchopConfig;
  /** row-major [iTof * nLaunch + iLaunch], NaN where Lambert failed */
  vinfDep: Float32Array;
  vinfArr: Float32Array;
  best: PorkchopBest | null;
}

/** Per-target defaults: TOF range [days] and launch-window span [days]. */
export const PORKCHOP_TARGETS: Partial<
  Record<PlanetKey, { tofMin: number; tofMax: number; span: number }>
> = {
  mercury: { tofMin: 60, tofMax: 260, span: 500 },
  venus: { tofMin: 70, tofMax: 360, span: 750 },
  mars: { tofMin: 110, tofMax: 520, span: 1000 },
  jupiter: { tofMin: 450, tofMax: 2400, span: 900 },
  saturn: { tofMin: 1100, tofMax: 4500, span: 900 },
  uranus: { tofMin: 3200, tofMax: 9500, span: 1100 },
  neptune: { tofMin: 6000, tofMax: 14500, span: 1100 },
};

export interface TransferSolution {
  launchJD: number;
  tofDays: number;
  arrivalJD: number;
  /** heliocentric departure state (position offset just outside Earth's SOI) */
  initial: State;
  /** departure v∞ [km/s] */
  vinfDep: number;
  /** arrival v∞ relative to the target [km/s] */
  vinfArr: number;
  /** characteristic energy C3 [km²/s²] */
  c3: number;
  /** target position at arrival [AU] (for the arrival marker) */
  arrivalPos: Vec3;
}

/** Build the SOI-offset departure state for a Lambert departure velocity. */
function departureState(earth: State, v1: Vec3): State {
  // Depart from just outside Earth's SOI along the outgoing asymptote,
  // matching the manual-design launch convention (avoids the Earth-gravity
  // singularity at r=0).
  const dir = normalize(sub(v1, earth.vel));
  return { pos: add(earth.pos, scale(dir, EARTH_SOI_AU)), vel: v1 };
}

/**
 * Solve one Earth→target transfer; null if Lambert fails.
 *
 * The plain Lambert arc is a Sun-only (2-body) solution, but the app
 * propagates spacecraft under full Sun+8-planet gravity — Earth's pull at
 * departure and en-route perturbations bend the real trajectory off the
 * target by a few 0.01 AU. So after the initial solve we run a shooting-style
 * differential correction: propagate under N-body gravity, measure the miss
 * at arrival, shift the Lambert aim point by the negative miss, and repeat.
 * 3–4 iterations bring the real arrival within ~0.001 AU of the planet.
 */
export function solveTransfer(
  target: PlanetKey,
  launchJD: number,
  tofDays: number,
  maxIter = 4,
): TransferSolution | null {
  const earth = planetStateAtJD('earth', launchJD);
  const tgt = planetStateAtJD(target, launchJD + tofDays);

  let aim: Vec3 = { ...tgt.pos };
  let lam = solveLambert(earth.pos, aim, tofDays);
  if (!lam) return null;

  const tolAU = 0.0015;
  for (let iter = 0; iter < maxIter; iter++) {
    const prop = propagate({
      startJD: launchJD,
      initial: departureState(earth, lam.v1),
      durationDays: tofDays,
      baseStep: 0.5,
      closeRange: 0.1,
      fineStep: 0.02,
      sampleEvery: 1_000_000, // only endpoints needed here
    });
    const achieved = prop.samples[prop.samples.length - 1].pos;
    const err = sub(achieved, tgt.pos);
    if (len(err) < tolAU) break;
    aim = sub(aim, err);
    const next = solveLambert(earth.pos, aim, tofDays);
    if (!next) break; // keep the best solution found so far
    lam = next;
  }

  const vinfDepVec = sub(lam.v1, earth.vel);
  const vinfArrVec = sub(lam.v2, tgt.vel);
  const vinfDep = len(vinfDepVec) / KMS_TO_AU_PER_DAY;
  const vinfArr = len(vinfArrVec) / KMS_TO_AU_PER_DAY;

  return {
    launchJD,
    tofDays,
    arrivalJD: launchJD + tofDays,
    initial: departureState(earth, lam.v1),
    vinfDep,
    vinfArr,
    c3: vinfDep * vinfDep,
    arrivalPos: tgt.pos,
  };
}

/** Compute the full porkchop grid. Synchronous; ~100k Lambert solves/sec. */
export function computePorkchop(config: PorkchopConfig): PorkchopGrid {
  const { nLaunch, nTof } = config;
  const vinfDep = new Float32Array(nLaunch * nTof).fill(NaN);
  const vinfArr = new Float32Array(nLaunch * nTof).fill(NaN);
  let best: PorkchopBest | null = null;

  for (let j = 0; j < nTof; j++) {
    const tof =
      config.tofMinDays + ((config.tofMaxDays - config.tofMinDays) * j) / (nTof - 1);
    for (let i = 0; i < nLaunch; i++) {
      const launchJD =
        config.launchStartJD + (config.launchSpanDays * i) / (nLaunch - 1);
      const earth = planetStateAtJD('earth', launchJD);
      const tgt = planetStateAtJD(config.target, launchJD + tof);
      const lam = solveLambert(earth.pos, tgt.pos, tof);
      if (!lam) continue;
      const dep = len(sub(lam.v1, earth.vel)) / KMS_TO_AU_PER_DAY;
      const arr = len(sub(lam.v2, tgt.vel)) / KMS_TO_AU_PER_DAY;
      const idx = j * nLaunch + i;
      vinfDep[idx] = dep;
      vinfArr[idx] = arr;
      if (!best || dep < best.vinfDep) {
        best = { iLaunch: i, iTof: j, launchJD, tofDays: tof, vinfDep: dep, vinfArr: arr };
      }
    }
  }
  return { config, vinfDep, vinfArr, best };
}
