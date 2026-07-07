import type { PlanetKey } from '../data/planetElements';
import { planetStateAtJD, type State, type Vec3 } from '../ephemeris/ephemeris';
import {
  buildLaunchState,
  propagate,
  type FlybyEvent,
  type PropagationResult,
} from './propagate';

export interface SwingbyParams {
  /** launch epoch (Julian Date) */
  startJD: number;
  /** excess velocity v∞ [km/s] */
  vInf: number;
  /** in-plane angle relative to Earth's velocity [deg] */
  inPlaneDeg: number;
  /** out-of-plane angle [deg] */
  outPlaneDeg: number;
  /** preview horizon [years] */
  years: number;
}

export interface SwingbyResult {
  positions: Vec3[];
  flybys: FlybyEvent[];
  minApproach: Partial<Record<PlanetKey, number>>;
  raw: PropagationResult;
}

/**
 * Compute a spacecraft trajectory from the launch parameters.
 * Down-samples the trajectory line for drawing to keep it light.
 */
export function computeSwingby(params: SwingbyParams): SwingbyResult {
  const earth = planetStateAtJD('earth', params.startJD);
  const initial = buildLaunchState(
    earth,
    params.vInf,
    params.inPlaneDeg,
    params.outPlaneDeg,
  );
  const durationDays = params.years * 365.25;
  const raw = propagate({
    startJD: params.startJD,
    initial,
    durationDays,
    baseStep: 0.5,
    closeRange: 0.1,
    fineStep: 0.02,
    flybyThreshold: 0.05,
    sampleEvery: 4, // ~2-day drawing resolution at base step
  });

  const positions = raw.samples.map((s) => s.pos);
  return {
    positions,
    flybys: raw.flybys,
    minApproach: raw.minApproach,
    raw,
  };
}

/**
 * Propagate from an arbitrary heliocentric state (e.g. a Lambert-transfer
 * departure) with the same integrator settings as the manual design mode.
 */
export function computeFromState(
  startJD: number,
  initial: State,
  years: number,
): SwingbyResult {
  const raw = propagate({
    startJD,
    initial,
    durationDays: years * 365.25,
    baseStep: 0.5,
    closeRange: 0.1,
    fineStep: 0.02,
    flybyThreshold: 0.05,
    sampleEvery: 4,
  });
  return {
    positions: raw.samples.map((s) => s.pos),
    flybys: raw.flybys,
    minApproach: raw.minApproach,
    raw,
  };
}

/**
 * Interpolate the full state (position + velocity) at a given JD,
 * for the craft telemetry readout. Null outside the sampled range.
 */
export function sampleStateAtJD(
  raw: PropagationResult,
  jd: number,
): { pos: Vec3; vel: Vec3 } | null {
  const s = raw.samples;
  if (s.length === 0) return null;
  if (jd <= s[0].jd) return { pos: s[0].pos, vel: s[0].vel };
  if (jd >= s[s.length - 1].jd) {
    const last = s[s.length - 1];
    return { pos: last.pos, vel: last.vel };
  }
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].jd <= jd) lo = mid;
    else hi = mid;
  }
  const a = s[lo];
  const b = s[hi];
  const t = (jd - a.jd) / (b.jd - a.jd);
  const lerp = (p: Vec3, q: Vec3): Vec3 => ({
    x: p.x + (q.x - p.x) * t,
    y: p.y + (q.y - p.y) * t,
    z: p.z + (q.z - p.z) * t,
  });
  return { pos: lerp(a.pos, b.pos), vel: lerp(a.vel, b.vel) };
}

/**
 * Interpolate the committed trajectory to a given JD (for animated playback).
 * Returns null if jd is outside the sampled range.
 */
export function sampleTrajectoryAtJD(raw: PropagationResult, jd: number): Vec3 | null {
  const s = raw.samples;
  if (s.length === 0) return null;
  if (jd <= s[0].jd) return s[0].pos;
  if (jd >= s[s.length - 1].jd) return s[s.length - 1].pos;
  // Binary search for the bracketing samples.
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].jd <= jd) lo = mid;
    else hi = mid;
  }
  const a = s[lo];
  const b = s[hi];
  const t = (jd - a.jd) / (b.jd - a.jd);
  return {
    x: a.pos.x + (b.pos.x - a.pos.x) * t,
    y: a.pos.y + (b.pos.y - a.pos.y) * t,
    z: a.pos.z + (b.pos.z - a.pos.z) * t,
  };
}
