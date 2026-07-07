import { DEG2RAD } from '../data/constants';
import type { SmallBodyElements } from '../data/smallBodies';
import { elementsToState, type State, type OsculatingElements } from './ephemeris';

/**
 * 2-body Kepler propagation of a small body from its fixed osculating
 * elements: M(t) = M0 + n·(t − epoch), everything else constant.
 * (Planetary perturbations are ignored — see data/smallBodies.ts.)
 */
export function smallBodyElementsAtJD(
  body: SmallBodyElements,
  jd: number,
): OsculatingElements {
  const n = 360 / body.periodDays; // deg/day
  let maDeg = (body.ma + n * (jd - body.epochJD)) % 360;
  if (maDeg > 180) maDeg -= 360;
  if (maDeg < -180) maDeg += 360;

  const omega = body.w * DEG2RAD;
  const Omega = body.om * DEG2RAD;
  return {
    a: body.a,
    e: body.e,
    I: body.i * DEG2RAD,
    omega,
    Omega,
    M: maDeg * DEG2RAD,
    L: 0, // unused by elementsToState
    varpi: omega + Omega,
  };
}

/** Heliocentric state [AU, AU/day] of a small body at a given JD. */
export function smallBodyStateAtJD(body: SmallBodyElements, jd: number): State {
  return elementsToState(smallBodyElementsAtJD(body, jd));
}
