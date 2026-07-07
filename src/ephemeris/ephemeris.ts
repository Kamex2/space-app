import {
  PLANET_ELEMENTS,
  PLANET_ORDER,
  type KeplerElementRow,
  type PlanetKey,
} from '../data/planetElements';
import { DEG2RAD, GM_SUN } from '../data/constants';
import { julianCenturiesSinceJ2000 } from './time';
import { solveKepler } from './kepler';

/** Simple 3-component vector in the J2000 ecliptic frame (Sun-centred). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Heliocentric state: position [AU] and velocity [AU/day]. */
export interface State {
  pos: Vec3;
  vel: Vec3;
}

/** Instantaneous osculating elements at a given epoch (angles in radians). */
export interface OsculatingElements {
  a: number; // au
  e: number;
  I: number; // rad (inclination)
  omega: number; // rad (argument of perihelion, ω = ϖ − Ω)
  Omega: number; // rad (longitude of ascending node)
  M: number; // rad (mean anomaly, normalised to [-pi, pi])
  L: number; // rad (mean longitude)
  varpi: number; // rad (longitude of perihelion)
}

/**
 * Compute the time-varying elements for a body at Julian-centuries `T`,
 * following the JPL procedure:  elem = elem0 + rate * T.
 * Returns angles in radians.
 */
export function elementsAt(row: KeplerElementRow, T: number): OsculatingElements {
  const a = row.a + row.aDot * T;
  const e = row.e + row.eDot * T;
  const I = (row.I + row.IDot * T) * DEG2RAD;
  const L = (row.L + row.LDot * T) * DEG2RAD;
  const varpi = (row.varpi + row.varpiDot * T) * DEG2RAD;
  const Omega = (row.Omega + row.OmegaDot * T) * DEG2RAD;

  const omega = varpi - Omega; // argument of perihelion

  // Mean anomaly M = L − ϖ, normalised to [-pi, pi].
  let M = L - varpi;
  M = M % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI;
  if (M < -Math.PI) M += 2 * Math.PI;

  return { a, e, I, omega, Omega, M, L, varpi };
}

/**
 * Convert osculating elements to a heliocentric state vector.
 * Position via the standard rotation; velocity by analytic differentiation
 * of the orbit (using dE/dt = n / (1 − e·cosE), n = sqrt(GM/a^3)).
 */
export function elementsToState(el: OsculatingElements): State {
  const { a, e, I, omega, Omega, M } = el;

  const E = solveKepler(M, e, 1e-10);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);

  // Position in the orbital plane (perifocal frame), x' toward perihelion.
  const xp = a * (cosE - e);
  const yp = a * Math.sqrt(1 - e * e) * sinE;

  // Mean motion n [rad/day]; a is in AU and GM_SUN in AU^3/day^2.
  const n = Math.sqrt(GM_SUN / (a * a * a));
  // dE/dt from differentiating M = E − e·sinE:  n = (1 − e·cosE)·dE/dt.
  const Edot = n / (1 - e * cosE);

  // Perifocal velocity (derivatives of xp, yp w.r.t. time).
  const vxp = -a * sinE * Edot;
  const vyp = a * Math.sqrt(1 - e * e) * cosE * Edot;

  // Rotation perifocal -> ecliptic:  R = Rz(Omega) · Rx(I) · Rz(omega).
  const cosO = Math.cos(Omega);
  const sinO = Math.sin(Omega);
  const cosw = Math.cos(omega);
  const sinw = Math.sin(omega);
  const cosI = Math.cos(I);
  const sinI = Math.sin(I);

  // Combined rotation matrix elements (column-major terms used inline).
  const m11 = cosO * cosw - sinO * sinw * cosI;
  const m12 = -cosO * sinw - sinO * cosw * cosI;
  const m21 = sinO * cosw + cosO * sinw * cosI;
  const m22 = -sinO * sinw + cosO * cosw * cosI;
  const m31 = sinw * sinI;
  const m32 = cosw * sinI;

  const pos: Vec3 = {
    x: m11 * xp + m12 * yp,
    y: m21 * xp + m22 * yp,
    z: m31 * xp + m32 * yp,
  };
  const vel: Vec3 = {
    x: m11 * vxp + m12 * vyp,
    y: m21 * vxp + m22 * vyp,
    z: m31 * vxp + m32 * vyp,
  };

  return { pos, vel };
}

/** Heliocentric state of a planet at a given Julian Date. */
export function planetStateAtJD(planet: PlanetKey, jd: number): State {
  const T = julianCenturiesSinceJ2000(jd);
  const el = elementsAt(PLANET_ELEMENTS[planet], T);
  return elementsToState(el);
}

/** Osculating elements of a planet at a given Julian Date. */
export function planetElementsAtJD(planet: PlanetKey, jd: number): OsculatingElements {
  const T = julianCenturiesSinceJ2000(jd);
  return elementsAt(PLANET_ELEMENTS[planet], T);
}

/** All 8 planet states at once (Julian Date). */
export function allPlanetStatesAtJD(jd: number): Record<PlanetKey, State> {
  const out = {} as Record<PlanetKey, State>;
  for (const p of PLANET_ORDER) out[p] = planetStateAtJD(p, jd);
  return out;
}

/** Orbital period [days] from semi-major axis a [AU]. */
export function orbitalPeriodDays(a: number): number {
  const n = Math.sqrt(GM_SUN / (a * a * a)); // rad/day
  return (2 * Math.PI) / n;
}

/** Heliocentric ecliptic longitude [deg, 0..360] of a position vector. */
export function eclipticLongitudeDeg(pos: Vec3): number {
  let lon = (Math.atan2(pos.y, pos.x) * 180) / Math.PI;
  if (lon < 0) lon += 360;
  return lon;
}

/** |r| magnitude of a heliocentric position [AU]. */
export function radius(pos: Vec3): number {
  return Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
}
