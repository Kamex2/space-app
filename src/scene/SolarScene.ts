import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  CSS2DRenderer,
  CSS2DObject,
} from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { PLANET_ORDER, PLANET_NAME_JA, type PlanetKey } from '../data/planetElements';
import {
  planetStateAtJD,
  planetElementsAtJD,
  elementsToState,
  orbitalPeriodDays,
  type Vec3,
} from '../ephemeris/ephemeris';
import { SMALL_BODIES, type SmallBodyElements } from '../data/smallBodies';
import { smallBodyStateAtJD, smallBodyElementsAtJD } from '../ephemeris/smallBody';
import { PLANET_VISUAL } from './planetVisuals';
import {
  makePlanetMaterial,
  makeSunMaterial,
  makeRingMaterial,
  makeCoronaTexture,
  PLANET_SPIN,
} from './planetShaders';
import {
  mapPositionInto,
  mapRadius,
  unmapPosition,
  type ScaleMode,
} from './scaleMapping';

const tmpVec = new THREE.Vector3();
const DEG = Math.PI / 180;

/** A single planet's scene objects. */
interface PlanetObj {
  key: PlanetKey;
  /** carries position + axial tilt */
  group: THREE.Group;
  /** unit sphere, scaled to display radius; spins around local Y */
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  orbit: THREE.Line;
  label: CSS2DObject;
}

export interface SceneCallbacks {
  onPlanetClick: (key: PlanetKey) => void;
}

/** A comet/asteroid's scene objects. */
interface SmallBodyObj {
  def: SmallBodyElements;
  mesh: THREE.Mesh;
  orbit: THREE.Line;
  label: CSS2DObject;
  /** anti-sunward dust tail (comets only) */
  tail: THREE.Points | null;
  /** per-particle lateral jitter, fixed at build time */
  tailJitter: Float32Array | null;
}

/** One meteor streak in the pool. */
interface Meteor {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  /** head colour */
  r: number;
  g: number;
  b: number;
  /** streak length multiplier (fireballs are long and bright) */
  streak: number;
}

/** background sporadic meteors: always a few falling, any day of the year */
const SPORADIC_RATE = 0.45;

export type ViewMode = '3d' | '2d' | '4d';

const TAIL_PARTICLES = 90;
const METEOR_POOL = 80;
/** spacetime view: scene units per day along the time (Y) axis */
const ST_UNITS_PER_DAY = 0.012;
/** spacetime view: half-span of the baked worldlines [days] */
const ST_HALF_SPAN = 3 * 365.25;
/**
 * Sun's galactic velocity (~230 km/s ≈ 0.13 AU/day) rendered at 1/6 scale so
 * the planetary helices stay readable next to the drift.
 */
const ST_GAL_UNITS_PER_DAY = 0.022 * 10; // AU/day(vis) × SCENE_AU
/** direction of galactic motion (toward Cygnus), ecliptic→scene mapped */
const ST_GAL_DIR = new THREE.Vector3(0.494, 0.862, 0.111).normalize();

/**
 * Builds and manages the Three.js scene: sun, planets, orbits, starfield,
 * labels, camera/controls, scale + size toggles, and picking.
 */
export class SolarScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labelRenderer: CSS2DRenderer;
  readonly controls: OrbitControls;
  private composer: EffectComposer;

  private sun!: THREE.Mesh;
  private sunMaterial!: THREE.ShaderMaterial;
  private planets: Record<PlanetKey, PlanetObj> = {} as Record<PlanetKey, PlanetObj>;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  scaleMode: ScaleMode = 'compressed';
  realSizes = false;

  /** planet currently focused (camera follows), or null. */
  focused: PlanetKey | null = null;

  private currentJD: number;
  private lastOrbitJD: number;
  private elapsed = 0;

  // --- spacecraft trajectory (design-mode preview + committed flight) ---
  private trajLine: THREE.Line;
  private craftMesh: THREE.Mesh;
  private craftLabel: CSS2DObject;
  private craftTrail: THREE.Line;
  private craftTrailPositions: number[] = [];
  private flybyMarkers: THREE.Group = new THREE.Group();
  private arrivalMarker: THREE.Mesh;

  // --- real small bodies (comets & asteroids) ---
  private smallBodies: SmallBodyObj[] = [];
  smallBodiesVisible = true;

  // --- meteor showers ---
  private meteorSegs!: THREE.LineSegments;
  private meteors: Meteor[] = [];
  private meteorActivity: { dir: THREE.Vector3; rate: number }[] = [];

  // --- view modes (2D / 3D / 4D spacetime) ---
  viewMode: ViewMode = '3d';
  galactic = false;
  private stGroup: THREE.Group | null = null;
  private stGrid: THREE.Object3D | null = null;
  private stRefJD = 0;

  // --- NEO approach highlight lines ---
  private neoLines!: THREE.LineSegments;
  private neoActiveKeys = new Set<string>();

  // --- pilot (spaceship) mode ---
  pilotActive = false;
  private ship!: THREE.Group;
  private shipVel = new THREE.Vector3();
  private shipGlows: THREE.Sprite[] = [];
  private keys = new Set<string>();

  private callbacks: SceneCallbacks;

  constructor(
    container: HTMLElement,
    labelContainer: HTMLElement,
    initialJD: number,
    callbacks: SceneCallbacks,
  ) {
    this.callbacks = callbacks;
    this.currentJD = initialJD;
    this.lastOrbitJD = initialJD;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000008, 1);
    container.appendChild(this.renderer.domElement);

    // Label renderer overlay
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    labelContainer.appendChild(this.labelRenderer.domElement);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.01,
      100000,
    );
    this.camera.position.set(0, 60, 120);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 4000;

    this.buildSun();
    this.buildStarfield();
    this.buildMilkyWay();
    this.buildPlanets();
    this.buildSmallBodies();
    this.buildMeteorPool();
    this.buildNeoLines();
    this.buildShip();

    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
      this.keys.add(e.key.toLowerCase());
      if (
        this.pilotActive &&
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(
          e.key.toLowerCase(),
        )
      ) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    // Spacecraft trajectory preview line
    const trajGeo = new THREE.BufferGeometry();
    trajGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    this.trajLine = new THREE.Line(
      trajGeo,
      new THREE.LineBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.9 }),
    );
    this.trajLine.visible = false;
    this.scene.add(this.trajLine);

    // Committed spacecraft mesh + trail + label
    this.craftMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    this.craftMesh.visible = false;
    this.scene.add(this.craftMesh);

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    this.craftTrail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.8 }),
    );
    this.craftTrail.visible = false;
    this.scene.add(this.craftTrail);

    const craftDiv = document.createElement('div');
    craftDiv.className = 'planet-label craft-label';
    craftDiv.textContent = '探査機';
    this.craftLabel = new CSS2DObject(craftDiv);
    this.craftLabel.visible = false;
    this.craftMesh.add(this.craftLabel);

    this.scene.add(this.flybyMarkers);

    // Arrival marker (Lambert transfers): blue target ring, camera-facing.
    this.arrivalMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.75, 24),
      new THREE.MeshBasicMaterial({
        color: 0x66aaff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      }),
    );
    this.arrivalMarker.visible = false;
    this.scene.add(this.arrivalMarker);

    // Events
    this.renderer.domElement.addEventListener('click', this.onClick);
    this.renderer.domElement.addEventListener('dblclick', () => this.clearFocus());
    window.addEventListener('resize', this.onResize);

    // Post-processing (bloom on the sun)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.7, // strength
      0.5, // radius
      0.82, // threshold
    );
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());

    this.updatePlanetSizes();
    this.updatePositions(initialJD, true);
  }

  // -------------------------------------------------------------------------
  private buildSun() {
    const geo = new THREE.SphereGeometry(2.2, 48, 48);
    this.sunMaterial = makeSunMaterial();
    this.sun = new THREE.Mesh(geo, this.sunMaterial);
    this.scene.add(this.sun);

    // Corona: additive radial-gradient sprite behind the disc.
    const corona = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeCoronaTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.9,
      }),
    );
    corona.scale.setScalar(11);
    this.sun.add(corona);

    const div = document.createElement('div');
    div.className = 'planet-label sun-label';
    div.textContent = '太陽';
    const label = new CSS2DObject(div);
    label.position.set(0, 3, 0);
    this.sun.add(label);
  }

  private buildStarfield() {
    const count = 4000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const R = 3000;
    const tint = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // uniform on a sphere shell
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const r = R * (0.8 + Math.random() * 0.2);
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * s * Math.sin(theta);
      // stellar tints: mostly white, a few blue / amber giants
      const t = Math.random();
      if (t < 0.72) tint.setRGB(1, 1, 1);
      else if (t < 0.86) tint.setRGB(0.72, 0.82, 1);
      else tint.setRGB(1, 0.85, 0.65);
      const b = 0.55 + Math.random() * 0.45;
      colors[i * 3] = tint.r * b;
      colors[i * 3 + 1] = tint.g * b;
      colors[i * 3 + 2] = tint.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.4,
      sizeAttenuation: false,
      vertexColors: true,
    });
    this.scene.add(new THREE.Points(geo, mat));
  }

  /** Faint band of dense stars tilted ~60° from the ecliptic. */
  private buildMilkyWay() {
    const count = 9000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const R = 2900;
    // band frame: rotate around X by 60°
    const cosT = Math.cos(60 * DEG);
    const sinT = Math.sin(60 * DEG);
    const tint = new THREE.Color();
    const gauss = () =>
      (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
    for (let i = 0; i < count; i++) {
      const along = Math.random() * Math.PI * 2;
      // denser core towards one direction of the band
      const spread = gauss() * 0.13 * (1 + 0.8 * Math.abs(Math.sin(along / 2)));
      const bx = Math.cos(along) * Math.cos(spread);
      const by = Math.sin(spread);
      const bz = Math.sin(along) * Math.cos(spread);
      const x = bx;
      const y = by * cosT - bz * sinT;
      const z = by * sinT + bz * cosT;
      positions[i * 3] = x * R;
      positions[i * 3 + 1] = y * R;
      positions[i * 3 + 2] = z * R;
      const t = Math.random();
      if (t < 0.6) tint.setRGB(0.85, 0.88, 1);
      else if (t < 0.85) tint.setRGB(1, 0.95, 0.85);
      else tint.setRGB(1, 0.8, 0.7);
      const b = 0.12 + Math.random() * 0.4;
      colors[i * 3] = tint.r * b;
      colors[i * 3 + 1] = tint.g * b;
      colors[i * 3 + 2] = tint.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.1,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.scene.add(new THREE.Points(geo, mat));
  }

  private buildPlanets() {
    for (const key of PLANET_ORDER) {
      const group = new THREE.Group();
      group.rotation.z = PLANET_SPIN[key].tiltDeg * DEG;
      this.scene.add(group);

      const material = makePlanetMaterial(key);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), material);
      mesh.userData.planet = key;
      group.add(mesh);

      if (key === 'saturn') {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.24, 2.27, 128),
          makeRingMaterial(),
        );
        ring.rotation.x = -Math.PI / 2; // annulus into the equatorial plane
        mesh.add(ring);
      }

      const orbit = this.makeOrbitLine(key, this.currentJD);
      this.scene.add(orbit);

      const div = document.createElement('div');
      div.className = 'planet-label';
      div.textContent = PLANET_NAME_JA[key];
      const label = new CSS2DObject(div);
      label.position.set(0, 1.4, 0);
      mesh.add(label);

      this.planets[key] = { key, group, mesh, material, orbit, label };
    }
  }

  // -------------------------------------------------------------------------
  // Real comets & asteroids
  private buildSmallBodies() {
    for (const def of SMALL_BODIES) {
      const isNeo = def.type === 'neo';
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(isNeo ? 0.09 : 0.13, 0),
        new THREE.MeshBasicMaterial({ color: def.color }),
      );
      this.scene.add(mesh);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(this.smallBodyOrbitPoints(def), 3));
      const orbit = new THREE.LineLoop(
        geo,
        new THREE.LineBasicMaterial({
          color: def.color,
          transparent: true,
          opacity: isNeo ? 0.12 : 0.2,
        }),
      );
      this.scene.add(orbit);

      const div = document.createElement('div');
      div.className = 'planet-label small-label';
      div.textContent = def.nameJa;
      const label = new CSS2DObject(div);
      label.position.set(0, 0.5, 0);
      mesh.add(label);

      let tail: THREE.Points | null = null;
      let tailJitter: Float32Array | null = null;
      if (def.type === 'comet') {
        const tgeo = new THREE.BufferGeometry();
        tgeo.setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array(TAIL_PARTICLES * 3), 3),
        );
        tail = new THREE.Points(
          tgeo,
          new THREE.PointsMaterial({
            color: def.color,
            size: 1.8,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        tail.visible = false;
        this.scene.add(tail);
        tailJitter = new Float32Array(TAIL_PARTICLES * 2);
        for (let i = 0; i < TAIL_PARTICLES * 2; i++) tailJitter[i] = Math.random() * 2 - 1;
      }

      this.smallBodies.push({ def, mesh, orbit, label, tail, tailJitter });
    }
  }

  /** Small-body orbit ellipse in current scale-space (fixed elements). */
  private smallBodyOrbitPoints(def: SmallBodyElements): Float32Array {
    const segments = 256;
    const el = smallBodyElementsAtJD(def, def.epochJD);
    const out = new Float32Array(segments * 3);
    for (let i = 0; i < segments; i++) {
      const M = (i / segments) * 2 * Math.PI - Math.PI;
      const state = elementsToState({ ...el, M });
      mapPositionInto(state.pos, this.scaleMode, tmpVec);
      out[i * 3] = tmpVec.x;
      out[i * 3 + 1] = tmpVec.y;
      out[i * 3 + 2] = tmpVec.z;
    }
    return out;
  }

  private rebuildSmallBodyOrbits() {
    for (const b of this.smallBodies) {
      const pts = this.smallBodyOrbitPoints(b.def);
      (b.orbit.geometry.getAttribute('position').array as Float32Array).set(pts);
      b.orbit.geometry.getAttribute('position').needsUpdate = true;
      b.orbit.geometry.computeBoundingSphere();
    }
  }

  private updateSmallBodies(jd: number) {
    const visible = this.smallBodiesVisible && this.viewMode !== '4d';
    for (const b of this.smallBodies) {
      b.mesh.visible = visible;
      b.orbit.visible = visible;
      b.label.visible = visible;
      if (!visible) {
        if (b.tail) b.tail.visible = false;
        continue;
      }
      const state = smallBodyStateAtJD(b.def, jd);
      mapPositionInto(state.pos, this.scaleMode, tmpVec);
      b.mesh.position.copy(tmpVec);

      if (b.tail && b.tailJitter) {
        const rAU = Math.hypot(state.pos.x, state.pos.y, state.pos.z);
        if (rAU < 4.5) {
          b.tail.visible = true;
          // dust tail points away from the Sun; longer near perihelion
          const lenAU = Math.min(1.6, 0.15 + 0.85 / (rAU * rAU));
          const inv = 1 / rAU;
          const attr = b.tail.geometry.getAttribute('position') as THREE.BufferAttribute;
          const arr = attr.array as Float32Array;
          const v = new THREE.Vector3();
          for (let i = 0; i < TAIL_PARTICLES; i++) {
            const t = Math.pow(i / TAIL_PARTICLES, 1.4);
            const spread = t * lenAU * 0.16;
            const posAU = {
              x: state.pos.x * (1 + (lenAU * t * inv)) + b.tailJitter[i * 2] * spread,
              y: state.pos.y * (1 + (lenAU * t * inv)) + b.tailJitter[i * 2 + 1] * spread,
              z: state.pos.z * (1 + (lenAU * t * inv)) + b.tailJitter[i * 2] * spread * 0.4,
            };
            mapPositionInto(posAU, this.scaleMode, v);
            arr[i * 3] = v.x;
            arr[i * 3 + 1] = v.y;
            arr[i * 3 + 2] = v.z;
          }
          attr.needsUpdate = true;
          b.tail.geometry.computeBoundingSphere();
        } else {
          b.tail.visible = false;
        }
      }
    }
  }

  setSmallBodiesVisible(v: boolean) {
    this.smallBodiesVisible = v;
    this.updateSmallBodies(this.currentJD);
  }

  // -------------------------------------------------------------------------
  // NEO approach highlights: red line from each flagged NEO to Earth
  private buildNeoLines() {
    const maxLines = SMALL_BODIES.filter((b) => b.type === 'neo').length + 1;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxLines * 6), 3));
    this.neoLines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: 0xff5544,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.neoLines.frustumCulled = false;
    this.scene.add(this.neoLines);
  }

  /** Flag which small bodies are in an active close-approach window. */
  setNeoApproachActive(keys: string[]) {
    this.neoActiveKeys = new Set(keys);
  }

  private updateNeoLines() {
    const attr = this.neoLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    arr.fill(0);
    if (this.viewMode !== '4d' && this.smallBodiesVisible) {
      const earth = this.planets.earth.group.position;
      let n = 0;
      for (const b of this.smallBodies) {
        if (!this.neoActiveKeys.has(b.def.key)) continue;
        arr[n * 6] = b.mesh.position.x;
        arr[n * 6 + 1] = b.mesh.position.y;
        arr[n * 6 + 2] = b.mesh.position.z;
        arr[n * 6 + 3] = earth.x;
        arr[n * 6 + 4] = earth.y;
        arr[n * 6 + 5] = earth.z;
        n++;
      }
    }
    attr.needsUpdate = true;
  }

  /** Heliocentric AU position of a small body at the current JD. */
  smallBodyPosAU(key: string): Vec3 | null {
    const b = this.smallBodies.find((s) => s.def.key === key);
    return b ? smallBodyStateAtJD(b.def, this.currentJD).pos : null;
  }

  // -------------------------------------------------------------------------
  // Meteor showers (streaks around Earth while a shower is active)
  private buildMeteorPool() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(METEOR_POOL * 6), 3),
    );
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(METEOR_POOL * 6), 3));
    this.meteorSegs = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.meteorSegs.frustumCulled = false;
    this.scene.add(this.meteorSegs);
    for (let i = 0; i < METEOR_POOL; i++) {
      this.meteors.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        r: 1,
        g: 1,
        b: 1,
        streak: 1,
      });
    }
  }

  /** Grab a free meteor slot near Earth; returns null when the pool is full. */
  private spawnMeteorSlot(): Meteor | null {
    return this.meteors.find((m) => m.life <= 0) ?? null;
  }

  /**
   * A real recorded bolide: bright orange streak plunging INTO Earth,
   * with a couple of dimmer fragments. energyKt scales the show.
   */
  spawnFireball(energyKt: number) {
    const earthPos = this.planets.earth.group.position;
    const size = this.planets.earth.mesh.scale.x;
    const dir = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
    ).normalize();
    const strength = Math.min(2.5, 0.8 + energyKt);
    const n = 1 + Math.min(3, Math.round(energyKt * 2));
    for (let i = 0; i < n; i++) {
      const m = this.spawnMeteorSlot();
      if (!m) return;
      const jitter = new THREE.Vector3(
        Math.random() * 0.4 - 0.2,
        Math.random() * 0.4 - 0.2,
        Math.random() * 0.4 - 0.2,
      );
      // start well outside, fly toward Earth's centre (impact trajectory)
      m.pos.copy(earthPos).addScaledVector(dir.clone().add(jitter).normalize(), size * 9);
      m.vel
        .copy(earthPos)
        .sub(m.pos)
        .normalize()
        .multiplyScalar(size * (9 + 4 * strength));
      m.maxLife = 0.9 + 0.3 * strength;
      m.life = m.maxLife;
      const main = i === 0;
      m.r = 1;
      m.g = main ? 0.72 : 0.5;
      m.b = main ? 0.35 : 0.25;
      m.streak = main ? 2.6 * strength : 1.4;
    }
  }

  /**
   * Set the currently active showers. RA/dec of each radiant is converted to
   * an ecliptic→scene direction; meteors streak AWAY from the radiant (they
   * hit Earth from the radiant direction), at `rate` spawns/second.
   */
  setMeteorActivity(specs: { raDeg: number; decDeg: number; rate: number }[]) {
    const EPS = 23.4393 * DEG;
    this.meteorActivity = specs.map((s) => {
      const ra = s.raDeg * DEG;
      const dec = s.decDeg * DEG;
      // equatorial → ecliptic
      const xq = Math.cos(dec) * Math.cos(ra);
      const yq = Math.cos(dec) * Math.sin(ra);
      const zq = Math.sin(dec);
      const xe = xq;
      const ye = yq * Math.cos(EPS) + zq * Math.sin(EPS);
      const ze = -yq * Math.sin(EPS) + zq * Math.cos(EPS);
      // ecliptic → scene axes (x, z, -y); flight direction = −radiant
      const dir = new THREE.Vector3(-xe, -ze, ye).normalize();
      return { dir, rate: s.rate };
    });
  }

  private updateMeteors(dt: number) {
    if (this.viewMode === '4d') {
      this.meteorSegs.visible = false;
      return;
    }
    this.meteorSegs.visible = true;
    const earthPos = this.planets.earth.group.position;
    const size = this.planets.earth.mesh.scale.x;
    // spawn: active showers (from their radiant) + constant sporadics
    const spawnOne = (dir: THREE.Vector3 | null) => {
      const m = this.spawnMeteorSlot();
      if (!m) return;
      // random point in a shell around Earth
      const off = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      )
        .normalize()
        .multiplyScalar(size * (2.2 + Math.random() * 4.5));
      const d =
        dir ??
        new THREE.Vector3(
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
        ).normalize();
      m.pos.copy(earthPos).add(off);
      m.vel
        .copy(d)
        .multiplyScalar(size * (7 + Math.random() * 5))
        .addScaledVector(off, 0.35);
      m.maxLife = 0.35 + Math.random() * 0.4;
      m.life = m.maxLife;
      m.r = 1;
      m.g = 1;
      m.b = 1;
      m.streak = 1;
    };
    for (const act of this.meteorActivity) {
      let expected = act.rate * dt;
      while (expected > 0) {
        if (Math.random() > expected) break;
        expected -= 1;
        spawnOne(act.dir);
      }
    }
    if (Math.random() < SPORADIC_RATE * dt) spawnOne(null);
    // integrate + write buffers
    const pos = this.meteorSegs.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.meteorSegs.geometry.getAttribute('color') as THREE.BufferAttribute;
    const parr = pos.array as Float32Array;
    const carr = col.array as Float32Array;
    for (let i = 0; i < METEOR_POOL; i++) {
      const m = this.meteors[i];
      if (m.life > 0) {
        m.life -= dt;
        m.pos.addScaledVector(m.vel, dt);
        const a = Math.max(0, m.life / m.maxLife);
        const hx = m.pos.x;
        const hy = m.pos.y;
        const hz = m.pos.z;
        const tScale = 0.09 * m.streak;
        parr[i * 6] = hx;
        parr[i * 6 + 1] = hy;
        parr[i * 6 + 2] = hz;
        parr[i * 6 + 3] = hx - m.vel.x * tScale;
        parr[i * 6 + 4] = hy - m.vel.y * tScale;
        parr[i * 6 + 5] = hz - m.vel.z * tScale;
        // bright head, dim tinted tail
        carr[i * 6] = a * m.r;
        carr[i * 6 + 1] = a * m.g;
        carr[i * 6 + 2] = a * m.b;
        carr[i * 6 + 3] = a * m.r * 0.15;
        carr[i * 6 + 4] = a * m.g * 0.3;
        carr[i * 6 + 5] = a * m.b * 0.4;
      } else {
        for (let k = 0; k < 6; k++) {
          parr[i * 6 + k] = 0;
          carr[i * 6 + k] = 0;
        }
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Pilot (spaceship) mode
  private buildShip() {
    this.ship = new THREE.Group();
    // Lit metal materials (a dedicated key light rides with the ship so the
    // hull reads as shaded metal even though planets use custom shaders).
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x8e9cb4,
      metalness: 0.85,
      roughness: 0.35,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x2e3850,
      metalness: 0.7,
      roughness: 0.5,
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x0a1a2e,
      metalness: 0.2,
      roughness: 0.1,
      emissive: new THREE.Color(0x2288ff),
      emissiveIntensity: 0.7,
    });

    // fuselage: tapered body, nose along −Z
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 0.9, 8), hullMat);
    fuselage.rotation.x = -Math.PI / 2;
    fuselage.position.z = 0.05;
    this.ship.add(fuselage);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 8), darkMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -0.56;
    this.ship.add(nose);

    // cockpit canopy
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), canopyMat);
    canopy.scale.set(0.85, 0.55, 1.7);
    canopy.position.set(0, 0.085, -0.14);
    this.ship.add(canopy);

    // swept wings + wingtip running lights (red = left/port, green = right)
    const wingGeo = new THREE.BoxGeometry(0.62, 0.018, 0.3);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeo, hullMat);
      wing.position.set(side * 0.38, -0.02, 0.22);
      wing.rotation.y = -side * 0.5; // sweep back
      wing.rotation.z = side * 0.06; // slight dihedral
      this.ship.add(wing);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 8, 6),
        new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff3333 : 0x33ff55 }),
      );
      tip.position.set(side * 0.66, -0.045, 0.36);
      this.ship.add(tip);
    }

    // vertical stabilizer + dorsal spine
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.26, 0.24), hullMat);
    fin.position.set(0, 0.16, 0.34);
    fin.rotation.x = 0.35;
    this.ship.add(fin);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.7), darkMat);
    spine.position.set(0, 0.075, 0.12);
    this.ship.add(spine);

    // twin engine nacelles + exhaust glows
    for (const side of [-1, 1]) {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.3, 8), darkMat);
      eng.rotation.x = -Math.PI / 2;
      eng.position.set(side * 0.15, -0.015, 0.42);
      this.ship.add(eng);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeCoronaTexture(),
          color: 0x66ccff,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0,
        }),
      );
      glow.position.set(side * 0.15, -0.015, 0.62);
      glow.scale.setScalar(0.55);
      this.ship.add(glow);
      this.shipGlows.push(glow);
    }

    // key light + fill so the metal hull is always readable
    const key = new THREE.PointLight(0xfff2dd, 2.2, 30, 1.2);
    key.position.set(1.5, 2.5, -1);
    this.ship.add(key);
    const fill = new THREE.PointLight(0x4466aa, 0.9, 20, 1.5);
    fill.position.set(-2, -1.5, 2);
    this.ship.add(fill);

    this.ship.visible = false;
    this.scene.add(this.ship);
  }

  enterPilot() {
    this.pilotActive = true;
    this.focused = null;
    this.controls.enabled = false;
    // start just "above" Earth, nose toward the Sun
    const earth = this.planets.earth.group.position;
    this.ship.position.copy(earth).add(new THREE.Vector3(0, 1.2, 2.2));
    this.ship.lookAt(0, 0, 0);
    this.shipVel.set(0, 0, 0);
    this.ship.visible = true;
  }

  exitPilot() {
    this.pilotActive = false;
    this.ship.visible = false;
    this.controls.enabled = true;
    this.controls.target.set(0, 0, 0);
  }

  private updatePilot(dt: number) {
    const k = this.keys;
    const turn = 1.6 * dt;
    if (k.has('a') || k.has('arrowleft')) this.ship.rotateY(turn);
    if (k.has('d') || k.has('arrowright')) this.ship.rotateY(-turn);
    if (k.has('arrowup')) this.ship.rotateX(turn * 0.75);
    if (k.has('arrowdown')) this.ship.rotateX(-turn * 0.75);

    // adaptive max speed: fast in deep space, slow near bodies (supercruise)
    const near = this.nearestBodyScene(this.ship.position);
    const vmax = Math.min(260, Math.max(0.6, near.surfaceDist * 0.55));
    const boost = k.has('shift') ? 3 : 1;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.ship.quaternion);

    let thrusting = false;
    if (k.has('w')) {
      this.shipVel.addScaledVector(fwd, vmax * 1.6 * dt * boost);
      thrusting = true;
    }
    if (k.has('s')) this.shipVel.addScaledVector(fwd, -vmax * 1.0 * dt);
    // gentle drag so releasing the key coasts to a stop
    this.shipVel.multiplyScalar(Math.exp(-0.9 * dt));
    const speed = this.shipVel.length();
    const cap = vmax * boost;
    if (speed > cap) this.shipVel.multiplyScalar(cap / speed);
    this.ship.position.addScaledVector(this.shipVel, dt);

    const boostGlow = k.has('shift') && thrusting;
    for (const glow of this.shipGlows) {
      glow.material.color.setHex(boostGlow ? 0xffaa44 : 0x66ccff);
      glow.material.opacity +=
        ((thrusting ? (boostGlow ? 0.9 : 0.6) : 0) - glow.material.opacity) *
        Math.min(1, 8 * dt);
      glow.scale.setScalar(0.55 + (boostGlow ? 0.25 : 0) + 0.06 * Math.sin(this.elapsed * 30));
    }

    // chase camera
    const back = new THREE.Vector3(0, 1.1, 4.2).applyQuaternion(this.ship.quaternion);
    const desired = this.ship.position.clone().add(back);
    this.camera.position.lerp(desired, 1 - Math.exp(-5 * dt));
    const lookAt = this.ship.position.clone().addScaledVector(fwd, 6);
    this.camera.lookAt(lookAt);
  }

  /** Nearest body (sun or planet) to a scene position, minus its visual radius. */
  private nearestBodyScene(p: THREE.Vector3): {
    key: PlanetKey | 'sun';
    surfaceDist: number;
  } {
    let bestKey: PlanetKey | 'sun' = 'sun';
    let best = p.length() - 2.2;
    for (const key of PLANET_ORDER) {
      const pl = this.planets[key];
      const d = p.distanceTo(pl.group.position) - pl.mesh.scale.x;
      if (d < best) {
        best = d;
        bestKey = key;
      }
    }
    return { key: bestKey, surfaceDist: Math.max(0.01, best) };
  }

  /** Telemetry for the pilot HUD (distances are real AU via inverse mapping). */
  pilotTelemetry(): {
    nearestJa: string;
    nearestAU: number;
    rSunAU: number;
    speed: number;
  } {
    const near = this.nearestBodyScene(this.ship.position);
    const shipAU = unmapPosition(this.ship.position, this.scaleMode);
    const rSunAU = Math.hypot(shipAU.x, shipAU.y, shipAU.z);
    let nearestAU = rSunAU;
    let nearestJa = '太陽';
    if (near.key !== 'sun') {
      const p = planetStateAtJD(near.key, this.currentJD).pos;
      nearestAU = Math.hypot(shipAU.x - p.x, shipAU.y - p.y, shipAU.z - p.z);
      nearestJa = PLANET_NAME_JA[near.key];
    }
    return { nearestJa, nearestAU, rSunAU, speed: this.shipVel.length() };
  }

  // -------------------------------------------------------------------------
  // View modes: 3D free / 2D top-down / 4D spacetime worldlines
  setViewMode(mode: ViewMode, jd: number) {
    if (mode === this.viewMode) return;
    const prev = this.viewMode;
    this.viewMode = mode;

    // camera constraints
    if (mode === '2d') {
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = 0.02;
    } else {
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = Math.PI;
    }

    if (mode === '4d') {
      this.buildSpacetime(jd);
    } else if (prev === '4d') {
      this.disposeSpacetime();
    }
    // orbit lines hidden in 4D (worldlines replace them)
    for (const key of PLANET_ORDER) {
      this.planets[key].orbit.visible = mode !== '4d';
    }
    this.updateSmallBodies(jd);
  }

  setGalactic(g: boolean, jd: number) {
    this.galactic = g;
    if (this.viewMode === '4d') {
      this.disposeSpacetime();
      this.buildSpacetime(jd);
    }
  }

  private buildSpacetime(jd: number) {
    this.stRefJD = jd;
    const group = new THREE.Group();

    // "now" plane
    const grid = new THREE.PolarGridHelper(46, 8, 6, 72, 0x2a3c5a, 0x1a2438);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    this.stGrid = grid;
    this.scene.add(grid);

    const galPerDay = this.galactic ? ST_GAL_UNITS_PER_DAY : 0;

    // Sun worldline
    {
      const pts: number[] = [];
      for (const s of [-ST_HALF_SPAN, ST_HALF_SPAN]) {
        pts.push(
          ST_GAL_DIR.x * galPerDay * s,
          s * ST_UNITS_PER_DAY + ST_GAL_DIR.y * galPerDay * s,
          ST_GAL_DIR.z * galPerDay * s,
        );
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      group.add(
        new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9 }),
        ),
      );
    }

    // Planet worldlines: helices through spacetime
    for (const key of PLANET_ORDER) {
      const periodDays = orbitalPeriodDays(planetElementsAtJD(key, jd).a);
      const stepDays = Math.max(0.8, periodDays / 90); // ~90 pts per orbit
      const n = Math.min(2400, Math.floor((2 * ST_HALF_SPAN) / stepDays));
      const arr = new Float32Array(n * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const dts = -ST_HALF_SPAN + ((2 * ST_HALF_SPAN) * i) / (n - 1);
        const state = planetStateAtJD(key, this.stRefJD + dts);
        mapPositionInto(state.pos, this.scaleMode, v);
        arr[i * 3] = v.x + ST_GAL_DIR.x * galPerDay * dts;
        arr[i * 3 + 1] = v.y + dts * ST_UNITS_PER_DAY + ST_GAL_DIR.y * galPerDay * dts;
        arr[i * 3 + 2] = v.z + ST_GAL_DIR.z * galPerDay * dts;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: PLANET_VISUAL[key].color,
          transparent: true,
          opacity: 0.85,
        }),
      );
      line.frustumCulled = false;
      group.add(line);
    }

    this.stGroup = group;
    this.scene.add(group);
    this.updateSpacetime(jd);
  }

  private disposeSpacetime() {
    if (this.stGroup) {
      this.scene.remove(this.stGroup);
      this.stGroup.traverse((o) => {
        if (o instanceof THREE.Line) o.geometry.dispose();
      });
      this.stGroup = null;
    }
    if (this.stGrid) {
      this.scene.remove(this.stGrid);
      this.stGrid = null;
    }
  }

  /** Slide the baked worldlines so "now" stays on the grid plane. */
  private updateSpacetime(jd: number) {
    if (!this.stGroup) return;
    const dts = jd - this.stRefJD;
    if (Math.abs(dts) > ST_HALF_SPAN * 0.55) {
      // drifted past the baked range — rebake around the new epoch
      this.disposeSpacetime();
      this.buildSpacetime(jd);
      return;
    }
    const galPerDay = this.galactic ? ST_GAL_UNITS_PER_DAY : 0;
    this.stGroup.position.set(
      -ST_GAL_DIR.x * galPerDay * dts,
      -dts * ST_UNITS_PER_DAY - ST_GAL_DIR.y * galPerDay * dts,
      -ST_GAL_DIR.z * galPerDay * dts,
    );
  }

  /** Build an orbit ellipse from the osculating elements at a given JD. */
  private makeOrbitLine(key: PlanetKey, jd: number): THREE.Line {
    const geo = new THREE.BufferGeometry();
    const pts = this.orbitPoints(key, jd);
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: PLANET_VISUAL[key].color,
      transparent: true,
      opacity: 0.35,
    });
    return new THREE.LineLoop(geo, mat);
  }

  /** Sample the orbit ellipse in current scale-space. */
  private orbitPoints(key: PlanetKey, jd: number): Float32Array {
    const segments = 180;
    const el = planetElementsAtJD(key, jd);
    const out = new Float32Array(segments * 3);
    for (let i = 0; i < segments; i++) {
      const M = (i / segments) * 2 * Math.PI - Math.PI;
      const state = elementsToState({ ...el, M });
      mapPositionInto(state.pos, this.scaleMode, tmpVec);
      out[i * 3] = tmpVec.x;
      out[i * 3 + 1] = tmpVec.y;
      out[i * 3 + 2] = tmpVec.z;
    }
    return out;
  }

  private rebuildOrbits(jd: number) {
    for (const key of PLANET_ORDER) {
      const p = this.planets[key];
      const pts = this.orbitPoints(key, jd);
      const attr = p.orbit.geometry.getAttribute('position') as THREE.BufferAttribute;
      if (attr.count * 3 === pts.length) {
        (attr.array as Float32Array).set(pts);
        attr.needsUpdate = true;
      } else {
        p.orbit.geometry.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      }
    }
    this.lastOrbitJD = jd;
  }

  // -------------------------------------------------------------------------
  updatePlanetSizes() {
    for (const key of PLANET_ORDER) {
      const vis = PLANET_VISUAL[key];
      const r = this.realSizes
        ? mapRadius(vis.realRadiusAU, this.scaleMode)
        : vis.displayRadius;
      this.planets[key].mesh.scale.setScalar(Math.max(r, 0.001));
    }
  }

  setScaleMode(mode: ScaleMode) {
    if (mode === this.scaleMode) return;
    this.scaleMode = mode;
    this.rebuildOrbits(this.currentJD);
    this.rebuildSmallBodyOrbits();
    this.updatePlanetSizes();
    if (this.viewMode === '4d') {
      this.disposeSpacetime();
      this.buildSpacetime(this.currentJD);
    }
    this.updatePositions(this.currentJD, false);
  }

  setRealSizes(real: boolean) {
    this.realSizes = real;
    this.updatePlanetSizes();
  }

  /**
   * Move planets to their positions at `jd`. Rebuilds orbit lines only when the
   * date has moved enough that the osculating ellipse noticeably changed.
   */
  updatePositions(jd: number, forceOrbit: boolean) {
    this.currentJD = jd;
    for (const key of PLANET_ORDER) {
      const state = planetStateAtJD(key, jd);
      mapPositionInto(state.pos, this.scaleMode, tmpVec);
      const p = this.planets[key];
      p.group.position.copy(tmpVec);
      // sidereal spin (visual): absolute angle from JD so scrubbing time works
      const period = PLANET_SPIN[key].periodHours;
      p.mesh.rotation.y = 2 * Math.PI * (((jd * 24) / period) % 1);
    }
    // Orbit lines drift slowly; rebuild only every ~5 years of change.
    if (forceOrbit || Math.abs(jd - this.lastOrbitJD) > 365.25 * 5) {
      this.rebuildOrbits(jd);
    }
    this.updateSmallBodies(jd);
    this.updateNeoLines();
    if (this.viewMode === '4d') this.updateSpacetime(jd);
  }

  /** Heliocentric position of a planet at current JD (AU). */
  planetPosAU(key: PlanetKey): Vec3 {
    return planetStateAtJD(key, this.currentJD).pos;
  }

  // -------------------------------------------------------------------------
  // Spacecraft trajectory preview
  setTrajectoryPreview(positionsAU: Vec3[]) {
    if (positionsAU.length < 2) {
      this.trajLine.visible = false;
      return;
    }
    const arr = new Float32Array(positionsAU.length * 3);
    for (let i = 0; i < positionsAU.length; i++) {
      mapPositionInto(positionsAU[i], this.scaleMode, tmpVec);
      arr[i * 3] = tmpVec.x;
      arr[i * 3 + 1] = tmpVec.y;
      arr[i * 3 + 2] = tmpVec.z;
    }
    this.trajLine.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.trajLine.geometry.computeBoundingSphere();
    this.trajLine.visible = true;
  }

  hideTrajectoryPreview() {
    this.trajLine.visible = false;
  }

  /** Update flyby markers (small rings) from AU positions. */
  setFlybyMarkers(positionsAU: Vec3[]) {
    this.flybyMarkers.clear();
    for (const posAU of positionsAU) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.6, 20),
        new THREE.MeshBasicMaterial({
          color: 0xffff66,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        }),
      );
      mapPositionInto(posAU, this.scaleMode, tmpVec);
      ring.position.copy(tmpVec);
      ring.lookAt(this.camera.position);
      this.flybyMarkers.add(ring);
    }
  }

  clearFlybyMarkers() {
    this.flybyMarkers.clear();
  }

  /** Show/hide the blue arrival-target ring (Lambert transfers). */
  setArrivalMarker(posAU: Vec3 | null) {
    if (!posAU) {
      this.arrivalMarker.visible = false;
      return;
    }
    mapPositionInto(posAU, this.scaleMode, tmpVec);
    this.arrivalMarker.position.copy(tmpVec);
    this.arrivalMarker.visible = true;
  }

  // Committed spacecraft flight
  showCraft(show: boolean) {
    this.craftMesh.visible = show;
    this.craftLabel.visible = show;
    this.craftTrail.visible = show;
    if (!show) {
      this.craftTrailPositions = [];
    }
  }

  setCraftPosition(posAU: Vec3) {
    mapPositionInto(posAU, this.scaleMode, tmpVec);
    this.craftMesh.position.copy(tmpVec);
    // append to trail
    this.craftTrailPositions.push(tmpVec.x, tmpVec.y, tmpVec.z);
    const maxPts = 4000;
    if (this.craftTrailPositions.length > maxPts * 3) {
      this.craftTrailPositions.splice(0, this.craftTrailPositions.length - maxPts * 3);
    }
    this.craftTrail.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(this.craftTrailPositions), 3),
    );
    this.craftTrail.geometry.computeBoundingSphere();
  }

  resetCraftTrail() {
    this.craftTrailPositions = [];
    this.craftTrail.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(0), 3),
    );
  }

  // -------------------------------------------------------------------------
  // Picking + focus
  private onClick = (ev: MouseEvent) => {
    this.pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = PLANET_ORDER.map((k) => this.planets[k].mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const key = hits[0].object.userData.planet as PlanetKey;
      this.focusPlanet(key);
      this.callbacks.onPlanetClick(key);
    }
  };

  focusPlanet(key: PlanetKey) {
    this.focused = key;
  }

  clearFocus() {
    this.focused = null;
    this.controls.target.set(0, 0, 0);
  }

  /** Distance to keep the camera when following a focused planet. */
  private focusDistance(key: PlanetKey): number {
    const r = this.realSizes
      ? mapRadius(PLANET_VISUAL[key].realRadiusAU, this.scaleMode)
      : PLANET_VISUAL[key].displayRadius;
    return Math.max(r * 8, 4);
  }

  // -------------------------------------------------------------------------
  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };

  /** Called every animation frame. */
  render(dtSec = 0.016) {
    this.elapsed += dtSec;
    // animate shader time (sun granulation, clouds, gas-giant drift)
    this.sunMaterial.uniforms.uTime.value = this.elapsed;
    for (const key of PLANET_ORDER) {
      this.planets[key].material.uniforms.uTime.value = this.elapsed;
    }
    // Follow focused planet.
    if (this.focused) {
      const target = this.planets[this.focused].group.position;
      this.controls.target.lerp(target, 0.2);
      // Keep a reasonable distance behind.
      const desired = this.focusDistance(this.focused);
      const dir = tmpVec.copy(this.camera.position).sub(this.controls.target);
      if (dir.length() > desired * 3 || dir.length() < desired * 0.3) {
        dir.setLength(desired * 1.5);
        this.camera.position.copy(this.controls.target).add(dir);
      }
    }
    // Meteor shower streaks around Earth.
    this.updateMeteors(dtSec);
    // Pilot mode: fly the ship + chase camera.
    if (this.pilotActive) this.updatePilot(dtSec);
    // NEO approach lines pulse gently.
    (this.neoLines.material as THREE.LineBasicMaterial).opacity =
      0.45 + 0.3 * Math.sin(this.elapsed * 3);
    // Face flyby + arrival markers toward camera.
    for (const child of this.flybyMarkers.children) {
      child.lookAt(this.camera.position);
    }
    if (this.arrivalMarker.visible) {
      this.arrivalMarker.lookAt(this.camera.position);
      const pulse = 1 + 0.15 * Math.sin(this.elapsed * 4);
      this.arrivalMarker.scale.setScalar(pulse);
    }
    // OrbitControls.update() re-imposes its own camera pose, so it must not
    // run while the chase camera is driving.
    if (!this.pilotActive) this.controls.update();
    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }
}
