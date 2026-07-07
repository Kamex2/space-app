import type { PlanetKey } from '../data/planetElements';

/** Visual attributes for each body (color, exaggerated + real radii). */
export interface PlanetVisual {
  color: number;
  /** exaggerated display radius [scene units] */
  displayRadius: number;
  /** real equatorial radius [AU] (for the "real size" toggle) */
  realRadiusAU: number;
}

// Real equatorial radii in km -> AU (1 AU = 1.495978707e8 km).
const KM = 1 / 1.495978707e8;

export const PLANET_VISUAL: Record<PlanetKey, PlanetVisual> = {
  mercury: { color: 0x9c8a7a, displayRadius: 0.18, realRadiusAU: 2439.7 * KM },
  venus:   { color: 0xd8b47a, displayRadius: 0.28, realRadiusAU: 6051.8 * KM },
  earth:   { color: 0x4a80d8, displayRadius: 0.3,  realRadiusAU: 6371.0 * KM },
  mars:    { color: 0xc1440e, displayRadius: 0.24, realRadiusAU: 3389.5 * KM },
  jupiter: { color: 0xd8a878, displayRadius: 0.7,  realRadiusAU: 69911 * KM },
  saturn:  { color: 0xe0c48a, displayRadius: 0.62, realRadiusAU: 58232 * KM },
  uranus:  { color: 0x8fd0d8, displayRadius: 0.45, realRadiusAU: 25362 * KM },
  neptune: { color: 0x3f6bd8, displayRadius: 0.44, realRadiusAU: 24622 * KM },
};

export const SUN_COLOR = 0xffcc44;
