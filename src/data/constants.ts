// Physical constants (values fixed by the requirements spec, §5).
import type { PlanetKey } from './planetElements';

/** Sun's gravitational parameter GM_sun [AU^3 / day^2]. */
export const GM_SUN = 2.9591220828559093e-4;

/** Planet mass ratios (Sun mass / planet mass), from spec §5. */
export const PLANET_MASS_RATIO: Record<PlanetKey, number> = {
  mercury: 6023600,
  venus: 408523.71,
  earth: 328900.56, // Earth + Moon
  mars: 3098708,
  jupiter: 1047.3486,
  saturn: 3497.898,
  uranus: 22902.98,
  neptune: 19412.24,
};

/** Planet gravitational parameters GM [AU^3 / day^2] = GM_sun / massRatio. */
export const PLANET_GM: Record<PlanetKey, number> = Object.fromEntries(
  (Object.keys(PLANET_MASS_RATIO) as PlanetKey[]).map((k) => [
    k,
    GM_SUN / PLANET_MASS_RATIO[k],
  ]),
) as Record<PlanetKey, number>;

/** 1 AU in kilometres. */
export const AU_IN_KM = 1.495978707e8;

/** Unit conversion: 1 km/s expressed in AU/day (spec §5). */
export const KMS_TO_AU_PER_DAY = 5.7755e-4;

/** Days per Julian century. */
export const DAYS_PER_CENTURY = 36525.0;

/** Julian Date of the J2000.0 epoch (2000-01-01 12:00 TT). */
export const JD_J2000 = 2451545.0;

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
