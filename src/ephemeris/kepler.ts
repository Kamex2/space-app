/**
 * Solve Kepler's equation  M = E − e·sin(E)  for the eccentric anomaly E,
 * using Newton–Raphson.
 *
 * @param M    mean anomaly [rad]
 * @param e    eccentricity [-]
 * @param tol  absolute tolerance on the residual [rad]
 * @param maxIter iteration cap (safety)
 * @returns E [rad]
 */
export function solveKepler(
  M: number,
  e: number,
  tol = 1e-8,
  maxIter = 100,
): number {
  // Normalise M into [-pi, pi] for numerical robustness.
  let Mn = M % (2 * Math.PI);
  if (Mn > Math.PI) Mn -= 2 * Math.PI;
  if (Mn < -Math.PI) Mn += 2 * Math.PI;

  // Spec-mandated initial guess: E = M + e·sin(M). For highly eccentric
  // orbits (comets, e ≳ 0.8) Newton from that guess can overshoot near
  // perihelion, so start from the more robust cube-root seed instead.
  let E: number;
  if (e < 0.8) {
    E = Mn + e * Math.sin(Mn);
  } else {
    E = Math.cbrt(6 * Mn); // ~perihelion behaviour of E(M) for e→1
    if (Math.abs(Mn) > 1) E = Mn + e * Math.sin(Mn);
  }

  for (let i = 0; i < maxIter; i++) {
    const f = E - e * Math.sin(E) - Mn; // residual of Kepler's equation
    if (Math.abs(f) < tol) return E;
    const fPrime = 1 - e * Math.cos(E);
    let step = f / fPrime;
    // Damp huge Newton steps (flat fPrime near E≈0 when e→1).
    if (Math.abs(step) > 1) step = Math.sign(step);
    E -= step;
  }
  // Newton failed to converge (pathological e/M combination) — fall back to
  // bisection, which is guaranteed on g(E) = E − e·sinE − M (monotonic).
  let lo = -Math.PI;
  let hi = Math.PI;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    const g = mid - e * Math.sin(mid) - Mn;
    if (Math.abs(g) < tol) return mid;
    if (g > 0) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

/** Residual |E − e·sinE − M| after solving; used by sanity checks. */
export function keplerResidual(M: number, e: number, E: number): number {
  let Mn = M % (2 * Math.PI);
  if (Mn > Math.PI) Mn -= 2 * Math.PI;
  if (Mn < -Math.PI) Mn += 2 * Math.PI;
  return Math.abs(E - e * Math.sin(E) - Mn);
}
