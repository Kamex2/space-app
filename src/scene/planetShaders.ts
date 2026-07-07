import * as THREE from 'three';
import type { PlanetKey } from '../data/planetElements';

/**
 * Procedural GLSL materials for the Sun and planets — no textures, everything
 * is generated from 3D value-noise on the unit sphere. Lighting is computed
 * against the Sun at the scene origin.
 */

// ---------------------------------------------------------------------------
// Shared GLSL chunks
// ---------------------------------------------------------------------------
const NOISE_GLSL = /* glsl */ `
float hash13(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
        mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
        mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p){
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++){
    v += a * vnoise(p);
    p = p * 2.03 + vec3(11.5, 7.7, 3.1);
    a *= 0.5;
  }
  return v;
}
`;

const PLANET_VERT = /* glsl */ `
varying vec3 vL;
varying vec3 vN;
varying vec3 vW;
void main(){
  vL = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/** Lighting prologue shared by all planet fragment shaders. */
const LIGHT_GLSL = /* glsl */ `
vec3 sunDir = normalize(-vW);
float dif = max(dot(vN, sunDir), 0.0);
vec3 viewDir = normalize(cameraPosition - vW);
`;

function fragShader(surface: string, extra = ''): string {
  return /* glsl */ `
precision highp float;
varying vec3 vL;
varying vec3 vN;
varying vec3 vW;
uniform float uTime;
${NOISE_GLSL}
${extra}
void main(){
  vec3 p = normalize(vL);
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float lon = atan(p.z, p.x);
  ${LIGHT_GLSL}
  vec3 c;
  ${surface}
  vec3 col = c * (0.16 + 1.05 * dif);
  ${''}
  gl_FragColor = vec4(col, 1.0);
}
`;
}

function mat(fragmentShader: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT,
    fragmentShader,
    uniforms: { uTime: { value: 0 } },
  });
}

// ---------------------------------------------------------------------------
// Per-planet surfaces
// ---------------------------------------------------------------------------
function rockyFrag(base: string, dark: string, poles = false): string {
  return fragShader(/* glsl */ `
  float n = fbm(p * 4.5);
  float n2 = fbm(p * 12.0 + 5.0);
  c = mix(${base}, ${dark}, smoothstep(0.35, 0.75, n));
  c *= 0.85 + 0.3 * n2;
  ${poles ? 'c = mix(c, vec3(0.95, 0.95, 0.98), smoothstep(0.86, 0.94, abs(p.y) + fbm(p*5.0)*0.06));' : ''}
  `);
}

function gasFrag(
  colA: string,
  colB: string,
  colC: string,
  bands: number,
  turb: number,
  spot: boolean,
): string {
  return fragShader(/* glsl */ `
  float w = fbm(p * 3.0 + vec3(0.0, uTime * 0.005, 0.0)) * ${turb.toFixed(2)};
  float band = sin(lat * ${bands.toFixed(1)} + w * 2.4);
  c = mix(${colA}, ${colB}, band * 0.5 + 0.5);
  c = mix(c, ${colC}, smoothstep(0.55, 0.9, fbm(p * 6.5 + 13.7)) * 0.55);
  ${
    spot
      ? /* glsl */ `
  vec2 sp = vec2(lon - 0.9, lat + 0.36);
  sp.x = mod(sp.x + 3.14159, 6.28318) - 3.14159;
  float d = length(sp * vec2(1.0, 2.4));
  float inSpot = 1.0 - smoothstep(0.10, 0.17, d);
  c = mix(c, vec3(0.72, 0.30, 0.18), inSpot);
  c = mix(c, vec3(0.9, 0.55, 0.4), (1.0 - smoothstep(0.02, 0.06, d)) * 0.6);`
      : ''
  }
  `);
}

const EARTH_FRAG = /* glsl */ `
precision highp float;
varying vec3 vL;
varying vec3 vN;
varying vec3 vW;
uniform float uTime;
${NOISE_GLSL}
void main(){
  vec3 p = normalize(vL);
  ${LIGHT_GLSL}
  float h = fbm(p * 2.3 + 3.7);
  float land = smoothstep(0.50, 0.545, h);
  vec3 ocean = mix(vec3(0.015, 0.10, 0.28), vec3(0.03, 0.22, 0.42), fbm(p * 5.0));
  vec3 ground = mix(vec3(0.10, 0.32, 0.10), vec3(0.42, 0.34, 0.18), fbm(p * 7.0 + 9.0));
  ground = mix(ground, vec3(0.55, 0.48, 0.32), smoothstep(0.5, 0.8, fbm(p * 11.0)));
  vec3 c = mix(ocean, ground, land);
  float ice = smoothstep(0.82, 0.90, abs(p.y) + fbm(p * 4.0) * 0.08);
  c = mix(c, vec3(0.92, 0.94, 0.97), ice);
  float cl = smoothstep(0.52, 0.72, fbm(p * 3.6 + vec3(uTime * 0.012, 0.0, uTime * 0.009)));
  c = mix(c, vec3(0.96), cl * 0.85);
  // ocean specular
  float spec = pow(max(dot(reflect(-sunDir, vN), viewDir), 0.0), 24.0);
  vec3 col = c * (0.10 + 1.1 * dif) + (1.0 - land) * (1.0 - cl) * spec * 0.35;
  // night-side city lights on land
  float night = 1.0 - smoothstep(0.0, 0.12, dif);
  col += night * land * (1.0 - ice) * (1.0 - cl)
       * smoothstep(0.78, 0.95, vnoise(p * 34.0)) * vec3(1.0, 0.75, 0.35) * 0.85;
  // atmosphere rim
  float fr = pow(1.0 - abs(dot(viewDir, vN)), 2.6);
  col += vec3(0.30, 0.55, 1.0) * fr * (0.10 + 0.55 * dif);
  gl_FragColor = vec4(col, 1.0);
}
`;

const SUN_FRAG = /* glsl */ `
precision highp float;
varying vec3 vL;
varying vec3 vN;
varying vec3 vW;
uniform float uTime;
${NOISE_GLSL}
void main(){
  vec3 p = normalize(vL);
  float g = fbm(p * 4.0 + vec3(uTime * 0.05, 0.0, uTime * 0.03));
  float g2 = fbm(p * 9.0 - vec3(0.0, uTime * 0.07, 0.0));
  vec3 c = mix(vec3(1.0, 0.83, 0.35), vec3(1.0, 0.42, 0.06), smoothstep(0.30, 0.80, g));
  c = mix(c, vec3(1.0, 0.98, 0.88), smoothstep(0.62, 0.95, g2) * 0.55);
  vec3 viewDir = normalize(cameraPosition - vW);
  float limb = pow(abs(dot(viewDir, vN)), 0.55);
  gl_FragColor = vec4(c * (0.8 + 0.6 * limb) * 1.35, 1.0);
}
`;

const RING_VERT = /* glsl */ `
varying vec3 vLp;
varying vec3 vW;
varying vec3 vNW;
void main(){
  vLp = position;
  vNW = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const RING_FRAG = /* glsl */ `
precision highp float;
varying vec3 vLp;
varying vec3 vW;
varying vec3 vNW;
${NOISE_GLSL}
void main(){
  float r = length(vLp.xy);
  float bands = fbm(vec3(r * 22.0, 0.0, 0.0));
  float fine = vnoise(vec3(r * 90.0, 3.0, 0.0));
  float alpha = 0.72 * (0.45 + 0.55 * bands) * (0.7 + 0.3 * fine);
  // Cassini division (~1.95–2.02 Saturn radii)
  float cass = smoothstep(1.90, 1.96, r) * (1.0 - smoothstep(2.00, 2.06, r));
  alpha *= 1.0 - 0.9 * cass;
  // fade edges
  alpha *= smoothstep(1.22, 1.30, r) * (1.0 - smoothstep(2.20, 2.28, r));
  vec3 c = mix(vec3(0.78, 0.68, 0.52), vec3(0.55, 0.47, 0.36), bands);
  vec3 sunDir = normalize(-vW);
  float dif = clamp(abs(dot(vNW, sunDir)), 0.0, 1.0);
  gl_FragColor = vec4(c * (0.22 + 0.95 * dif), alpha);
}
`;

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------
export function makePlanetMaterial(key: PlanetKey): THREE.ShaderMaterial {
  switch (key) {
    case 'mercury':
      return mat(rockyFrag('vec3(0.62, 0.58, 0.52)', 'vec3(0.34, 0.31, 0.28)'));
    case 'venus':
      return mat(
        fragShader(/* glsl */ `
  float sw = fbm(p * 3.0 + vec3(fbm(p * 2.0 + uTime * 0.004) * 1.5));
  c = mix(vec3(0.90, 0.78, 0.55), vec3(0.72, 0.58, 0.36), sw);
  c = mix(c, vec3(0.96, 0.90, 0.75), smoothstep(0.6, 0.85, fbm(p * 5.5)) * 0.5);
  `),
      );
    case 'earth': {
      return new THREE.ShaderMaterial({
        vertexShader: PLANET_VERT,
        fragmentShader: EARTH_FRAG,
        uniforms: { uTime: { value: 0 } },
      });
    }
    case 'mars':
      return mat(rockyFrag('vec3(0.72, 0.36, 0.16)', 'vec3(0.42, 0.20, 0.10)', true));
    case 'jupiter':
      return mat(
        gasFrag('vec3(0.83, 0.72, 0.58)', 'vec3(0.60, 0.45, 0.33)', 'vec3(0.90, 0.85, 0.75)', 16, 1.0, true),
      );
    case 'saturn':
      return mat(
        gasFrag('vec3(0.87, 0.78, 0.58)', 'vec3(0.72, 0.62, 0.44)', 'vec3(0.93, 0.88, 0.72)', 12, 0.6, false),
      );
    case 'uranus':
      return mat(
        gasFrag('vec3(0.58, 0.82, 0.86)', 'vec3(0.46, 0.72, 0.78)', 'vec3(0.75, 0.92, 0.94)', 6, 0.3, false),
      );
    case 'neptune':
      return mat(
        gasFrag('vec3(0.22, 0.38, 0.85)', 'vec3(0.14, 0.26, 0.62)', 'vec3(0.55, 0.68, 0.95)', 8, 0.7, false),
      );
  }
}

export function makeSunMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT,
    fragmentShader: SUN_FRAG,
    uniforms: { uTime: { value: 0 } },
  });
}

/** Saturn's rings: local XY-plane annulus, radii in planet radii. */
export function makeRingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
}

/** Radial-gradient sprite texture for the solar corona (canvas-generated). */
export function makeCoronaTexture(): THREE.Texture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 220, 140, 0.85)');
  g.addColorStop(0.25, 'rgba(255, 170, 70, 0.35)');
  g.addColorStop(0.6, 'rgba(255, 120, 40, 0.10)');
  g.addColorStop(1, 'rgba(255, 100, 30, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Rotation / axial data (visual flavour; deg tilts, hours per rotation;
// negative = retrograde)
// ---------------------------------------------------------------------------
export const PLANET_SPIN: Record<PlanetKey, { tiltDeg: number; periodHours: number }> = {
  mercury: { tiltDeg: 0.03, periodHours: 1407.6 },
  venus: { tiltDeg: 177.4, periodHours: -5832.5 },
  earth: { tiltDeg: 23.4, periodHours: 23.93 },
  mars: { tiltDeg: 25.2, periodHours: 24.62 },
  jupiter: { tiltDeg: 3.1, periodHours: 9.93 },
  saturn: { tiltDeg: 26.7, periodHours: 10.66 },
  uranus: { tiltDeg: 97.8, periodHours: -17.24 },
  neptune: { tiltDeg: 28.3, periodHours: 16.11 },
};
