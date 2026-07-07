import * as THREE from 'three';
import type { Vec3 } from '../ephemeris/ephemeris';

/**
 * Distance-scale mapping from heliocentric AU coordinates to scene units.
 * Two modes:
 *   - 'real'       : linear (1 AU -> SCENE_AU units).
 *   - 'compressed' : radial compression r' = r^0.6, so outer planets stay
 *                    visible. The same mapping is applied consistently to
 *                    orbit lines, planet positions and spacecraft trajectory.
 */
export type ScaleMode = 'real' | 'compressed';

/** Scene units per AU in linear (real) mode. */
export const SCENE_AU = 10;

const COMPRESS_EXP = 0.6;

/** Map a heliocentric AU vector to scene-space (returns a new THREE.Vector3). */
export function mapPosition(pos: Vec3, mode: ScaleMode): THREE.Vector3 {
  const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
  if (r === 0) return new THREE.Vector3(0, 0, 0);
  let factor: number;
  if (mode === 'compressed') {
    const rp = Math.pow(r, COMPRESS_EXP);
    factor = (rp / r) * SCENE_AU;
  } else {
    factor = SCENE_AU;
  }
  // Ecliptic (x,y,z) -> Three.js (x, z, -y): ecliptic +z becomes scene +y (up).
  return new THREE.Vector3(pos.x * factor, pos.z * factor, -pos.y * factor);
}

/** Convenience: map into an existing Vector3 to avoid allocations. */
export function mapPositionInto(pos: Vec3, mode: ScaleMode, out: THREE.Vector3): THREE.Vector3 {
  const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
  if (r === 0) return out.set(0, 0, 0);
  let factor: number;
  if (mode === 'compressed') {
    factor = (Math.pow(r, COMPRESS_EXP) / r) * SCENE_AU;
  } else {
    factor = SCENE_AU;
  }
  return out.set(pos.x * factor, pos.z * factor, -pos.y * factor);
}

/** Map a scalar AU radius to a scene radius (used for camera distances). */
export function mapRadius(rAU: number, mode: ScaleMode): number {
  if (mode === 'compressed') return Math.pow(rAU, COMPRESS_EXP) * SCENE_AU;
  return rAU * SCENE_AU;
}

/** Inverse of mapPositionInto: scene-space Vector3 → heliocentric AU vector. */
export function unmapPosition(v: THREE.Vector3, mode: ScaleMode): Vec3 {
  const r = v.length();
  if (r === 0) return { x: 0, y: 0, z: 0 };
  const rAU =
    mode === 'compressed'
      ? Math.pow(r / SCENE_AU, 1 / COMPRESS_EXP)
      : r / SCENE_AU;
  const k = rAU / r;
  // scene (x, y, z) came from ecliptic (x, z, -y) — invert the axis swap
  return { x: v.x * k, y: -v.z * k, z: v.y * k };
}
