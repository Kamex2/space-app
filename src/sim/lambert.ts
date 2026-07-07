import { GM_SUN } from '../data/constants';
import type { Vec3 } from '../ephemeris/ephemeris';
import { sub, len, cross, scale } from './vec';

/**
 * Lambert problem solver — universal-variables formulation
 * (Bate–Mueller–White / Curtis, Algorithm 5.2).
 *
 * Given two heliocentric positions r1, r2 [AU] and a time of flight [days],
 * find the departure and arrival velocities [AU/day] of the connecting conic.
 * Single-revolution, prograde by default. Returns null when no solution
 * exists (degenerate geometry or unconverged).
 */
export interface LambertResult {
  v1: Vec3;
  v2: Vec3;
}

/** Stumpff function C(z). */
function stumpffC(z: number): number {
  if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5;
}

/** Stumpff function S(z). */
function stumpffS(z: number): number {
  if (z > 1e-8) {
    const sz = Math.sqrt(z);
    return (sz - Math.sin(sz)) / (sz * sz * sz);
  }
  if (z < -1e-8) {
    const sz = Math.sqrt(-z);
    return (Math.sinh(sz) - sz) / (sz * sz * sz);
  }
  return 1 / 6;
}

export function solveLambert(
  r1vec: Vec3,
  r2vec: Vec3,
  tofDays: number,
  mu: number = GM_SUN,
  prograde = true,
): LambertResult | null {
  if (tofDays <= 0) return null;
  const r1 = len(r1vec);
  const r2 = len(r2vec);
  if (r1 === 0 || r2 === 0) return null;

  const cr = cross(r1vec, r2vec);
  let cosDth = (r1vec.x * r2vec.x + r1vec.y * r2vec.y + r1vec.z * r2vec.z) / (r1 * r2);
  cosDth = Math.min(1, Math.max(-1, cosDth));
  let dth = Math.acos(cosDth);
  // Transfer-angle quadrant from the orbit normal: prograde transfers have
  // the angular momentum along +z (ecliptic north).
  if (prograde ? cr.z < 0 : cr.z >= 0) dth = 2 * Math.PI - dth;

  const sinDth = Math.sin(dth);
  const A = sinDth * Math.sqrt((r1 * r2) / (1 - Math.cos(dth)));
  if (!Number.isFinite(A) || Math.abs(A) < 1e-12) return null; // dth ≈ 0 or π

  const sqrtMu = Math.sqrt(mu);
  const yOf = (z: number): number => {
    const C = stumpffC(z);
    const S = stumpffS(z);
    return r1 + r2 + (A * (z * S - 1)) / Math.sqrt(C);
  };
  // F(z) is monotonically increasing in z; F(z*) = 0 at the solution.
  const F = (z: number): number => {
    const y = yOf(z);
    if (y < 0 || !Number.isFinite(y)) return -1e9; // below the valid branch
    const C = stumpffC(z);
    const S = stumpffS(z);
    return Math.pow(y / C, 1.5) * S + A * Math.sqrt(y) - sqrtMu * tofDays;
  };

  // Bracket the root, then bisect (robust; each solve is cheap).
  const FOUR_PI2 = 4 * Math.PI * Math.PI;
  let zLo = -FOUR_PI2;
  let zHi = FOUR_PI2 * 0.9999; // approaching (2π)² F → +∞ for elliptic branch
  let fLo = F(zLo);
  let guard = 0;
  while (fLo > 0 && guard++ < 40) {
    zLo *= 2;
    fLo = F(zLo);
  }
  if (fLo > 0) return null;
  if (F(zHi) < 0) return null;

  let z = 0;
  for (let i = 0; i < 90; i++) {
    z = 0.5 * (zLo + zHi);
    const f = F(z);
    if (f > 0) zHi = z;
    else zLo = z;
  }

  const y = yOf(z);
  if (y < 0 || !Number.isFinite(y)) return null;

  // Lagrange coefficients.
  const f = 1 - y / r1;
  const g = A * Math.sqrt(y / mu);
  const gdot = 1 - y / r2;
  if (Math.abs(g) < 1e-14) return null;

  const v1 = scale(sub(r2vec, scale(r1vec, f)), 1 / g);
  const v2 = scale(sub(scale(r2vec, gdot), r1vec), 1 / g);
  if (![v1.x, v1.y, v1.z, v2.x, v2.y, v2.z].every(Number.isFinite)) return null;
  return { v1, v2 };
}
