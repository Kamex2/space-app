import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { makeCoronaTexture } from '../scene/planetShaders';
import { ALL_BODIES, UNKNOWN_GALAXIES, type CosmicBody } from './cosmosData';
import { CollisionTheater } from './collisionTheater';
import { BlackHoleDive } from './blackHoleDive';

const TAU = Math.PI * 2;
/** カメラの基本視野角。ワープ中はここから広げて加速感を出す。 */
const BASE_FOV = 58;

/** 天体1件ぶんのシーンオブジェクト。 */
interface CosmosObj {
  body: CosmicBody;
  /** 位置・回転をになうグループ */
  group: THREE.Group;
  /** レイキャスト用の透明な当たり判定球 */
  pick: THREE.Mesh;
  /** 遠距離でも見える中心グロー */
  glow: THREE.Sprite;
  /** グローの基本サイズ（ホバー拡大から戻すため） */
  glowScale: number;
  label: CSS2DObject;
  /** 恒星系: 主星まわりを回る惑星（angle をアニメ） */
  planets: { mesh: THREE.Object3D; orbit: number; speed: number; angle: number }[];
  /** 自転（銀河・特異天体） */
  spin: number;
}

export interface CosmosCallbacks {
  onSelect: (body: CosmicBody) => void;
  /** ダブルクリックで即ワープしたいとき */
  onWarpRequest?: (body: CosmicBody) => void;
  /** 太陽系へ帰還 */
  onReturnHome: () => void;
}

/** 決定論的な擬似乱数（id からレイアウトのゆらぎを作る）。 */
function hashSeed(s: string): () => number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return (state >>> 8) / 0xffffff;
  };
}

/**
 * 大宇宙の探索シーン。銀河・星雲・恒星系を手続き的に生成し、ワープ航行と
 * 天体フォーカスを提供する。太陽系シーンとは完全に独立して動く。
 */
export class CosmosScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labelRenderer: CSS2DRenderer;
  readonly controls: OrbitControls;
  private composer: EffectComposer;

  private objs: CosmosObj[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private elapsed = 0;

  // --- ホバー（クリックできる天体を知らせる） ---
  private hovered: CosmosObj | null = null;
  private hoverPointer = new THREE.Vector2(-2, -2);
  private pointerInside = false;
  private hoverCheckedAt = 0;

  focused: CosmicBody | null = null;
  running = false;

  // --- ワープ航行 ---
  private warping = false;
  private warpT = 0;
  private warpDur = 1;
  private warpFrom = new THREE.Vector3();
  private warpTo = new THREE.Vector3();
  private warpTargetFrom = new THREE.Vector3();
  private warpTargetTo = new THREE.Vector3();
  private warpDir = new THREE.Vector3(0, 0, -1);
  private warpField!: THREE.LineSegments;
  private warpIntensity = 0;
  private onWarpArrive: (() => void) | null = null;

  // --- 自由航行（WASD） ---
  private keys = new Set<string>();
  private cruiseEnabled = true;

  // --- 銀河衝突シアター ---
  theater: CollisionTheater | null = null;
  theaterActive = false;
  private savedCamPos = new THREE.Vector3();
  private savedCamTarget = new THREE.Vector3();

  // --- ブラックホール・ダイブ ---
  dive: BlackHoleDive | null = null;
  diveActive = false;
  private savedDiveCamPos = new THREE.Vector3();
  private savedDiveCamTarget = new THREE.Vector3();

  private callbacks: CosmosCallbacks;

  constructor(container: HTMLElement, labelContainer: HTMLElement, callbacks: CosmosCallbacks) {
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x01010a, 1);
    this.renderer.domElement.style.display = 'none';
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.labelRenderer.domElement.style.display = 'none';
    this.labelRenderer.domElement.classList.add('cosmos-labels');
    labelContainer.appendChild(this.labelRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      BASE_FOV,
      window.innerWidth / window.innerHeight,
      0.05,
      400000,
    );
    this.camera.position.set(150, 90, 300);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 120000;
    this.controls.autoRotateSpeed = 0.16; // 没入モードのゆっくりした周回
    this.controls.target.set(120, 0, 40);

    this.buildBackdrop();
    this.buildIntergalacticVoid();
    for (const body of ALL_BODIES) this.buildBody(body);
    this.buildWarpField();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.85,
        0.6,
        0.5,
      ),
    );
    this.composer.addPass(new OutputPass());

    this.renderer.domElement.addEventListener('click', this.onClick);
    this.renderer.domElement.addEventListener('dblclick', this.onDblClick);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  // -------------------------------------------------------------------------
  // 背景：全天の微光星
  private buildBackdrop() {
    const count = 7000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const R = 180000;
    const tint = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * TAU;
      const r = R * (0.75 + Math.random() * 0.25);
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * s * Math.sin(theta);
      const t = Math.random();
      if (t < 0.7) tint.setRGB(1, 1, 1);
      else if (t < 0.87) tint.setRGB(0.7, 0.8, 1);
      else tint.setRGB(1, 0.83, 0.6);
      const b = 0.4 + Math.random() * 0.6;
      colors[i * 3] = tint.r * b;
      colors[i * 3 + 1] = tint.g * b;
      colors[i * 3 + 2] = tint.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.scene.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true }),
      ),
    );
  }

  /** 深宇宙にちりばめた無数の遠方銀河（小さな光点）。 */
  private buildIntergalacticVoid() {
    const count = 1400;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const tint = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * TAU;
      const r = 14000 + Math.random() * 90000;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * u * 0.8;
      positions[i * 3 + 2] = r * s * Math.sin(theta);
      const t = Math.random();
      if (t < 0.5) tint.setRGB(1, 0.9, 0.75);
      else if (t < 0.8) tint.setRGB(0.8, 0.85, 1);
      else tint.setRGB(1, 0.7, 0.85);
      const b = 0.5 + Math.random() * 0.5;
      colors[i * 3] = tint.r * b;
      colors[i * 3 + 1] = tint.g * b;
      colors[i * 3 + 2] = tint.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.scene.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          size: 2.4,
          sizeAttenuation: false,
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
        }),
      ),
    );
  }

  // -------------------------------------------------------------------------
  private buildBody(body: CosmicBody) {
    const group = new THREE.Group();
    group.position.set(body.pos[0], body.pos[1], body.pos[2]);
    const rand = hashSeed(body.id);
    // 決定論的なランダム傾き
    group.rotation.set(
      (rand() - 0.5) * 1.6,
      rand() * TAU,
      (rand() - 0.5) * 1.6,
    );
    this.scene.add(group);

    let spin = 0;
    const planets: CosmosObj['planets'] = [];

    // いて座A*だけは専用のミニ・ブラックホール外観
    if (body.id === 'sgr-a') {
      this.buildMiniBlackHole(group, body);
      spin = 0.35;
    } else
    switch (body.kind) {
      case 'home':
      case 'galaxy-spiral':
        this.buildSpiralGalaxy(group, body, rand);
        spin = 0.02;
        break;
      case 'galaxy-elliptical':
        this.buildEllipticalGalaxy(group, body, rand);
        spin = 0.01;
        break;
      case 'galaxy-irregular':
        this.buildIrregularGalaxy(group, body, rand);
        spin = 0.015;
        break;
      case 'cluster':
        this.buildCluster(group, body, rand);
        break;
      case 'nebula':
        this.buildNebula(group, body, rand);
        break;
      case 'starsystem':
        this.buildStarSystem(group, body, planets, rand);
        break;
      case 'anomaly':
        this.buildAnomaly(group, body, rand);
        spin = 0.25;
        break;
    }

    // 中心グロー
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeCoronaTexture(),
        color: body.color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: body.kind === 'home' ? 0.5 : 0.8,
      }),
    );
    const glowScale =
      body.kind === 'starsystem' ? body.scale * 4 : body.scale * (body.kind === 'nebula' ? 1.4 : 0.9);
    glow.scale.setScalar(glowScale);
    group.add(glow);

    // 当たり判定球（透明）
    const pick = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(body.scale * 0.7, 2), 8, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    pick.userData.id = body.id;
    group.add(pick);

    // ラベル
    const div = document.createElement('div');
    div.className = 'cosmos-label' + (body.fictional ? ' fictional' : '');
    div.innerHTML = `${body.fictional ? '✦ ' : ''}${body.nameJa}`;
    const label = new CSS2DObject(div);
    label.position.set(0, body.scale * 0.55 + 2, 0);
    group.add(label);

    this.objs.push({ body, group, pick, glow, glowScale, label, planets, spin });
  }

  /** 対数螺旋のパーティクル円盤。 */
  private buildSpiralGalaxy(group: THREE.Group, body: CosmicBody, rand: () => number) {
    const arms = body.params?.arms ?? 4;
    const spin = body.params?.spin ?? 2.6;
    const R = body.scale;
    const n = body.kind === 'home' ? 26000 : 12000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const cCore = new THREE.Color(body.color);
    const cEdge = new THREE.Color(body.color2);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const t = Math.pow(rand(), 0.55); // 中心に密度
      const rad = t * R;
      const arm = Math.floor(rand() * arms);
      const armAngle = (arm / arms) * TAU;
      const swirl = t * spin * TAU;
      const scatter = (rand() - 0.5) * (0.5 - 0.35 * t) + (rand() - 0.5) * 0.12;
      const ang = armAngle + swirl + scatter;
      const thick = (rand() - 0.5) * R * 0.06 * (1 - t * 0.7);
      pos[i * 3] = Math.cos(ang) * rad;
      pos[i * 3 + 1] = thick;
      pos[i * 3 + 2] = Math.sin(ang) * rad;
      tmp.copy(cCore).lerp(cEdge, Math.min(1, t * 1.15));
      const b = 0.55 + rand() * 0.45;
      col[i * 3] = tmp.r * b;
      col[i * 3 + 1] = tmp.g * b;
      col[i * 3 + 2] = tmp.b * b;
    }
    this.addPoints(group, pos, col, R > 250 ? 1.5 : 1.2);
    this.addCoreBulge(group, body, R * 0.16);
  }

  private buildEllipticalGalaxy(group: THREE.Group, body: CosmicBody, rand: () => number) {
    const R = body.scale;
    const n = 14000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const cCore = new THREE.Color(body.color);
    const cEdge = new THREE.Color(body.color2);
    const tmp = new THREE.Color();
    const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
    for (let i = 0; i < n; i++) {
      const rr = Math.pow(rand(), 0.5);
      const x = gauss() * R * rr;
      const y = gauss() * R * 0.55 * rr;
      const z = gauss() * R * 0.8 * rr;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      const d = Math.min(1, Math.hypot(x, y, z) / R);
      tmp.copy(cCore).lerp(cEdge, d);
      const b = 0.5 + rand() * 0.5;
      col[i * 3] = tmp.r * b;
      col[i * 3 + 1] = tmp.g * b;
      col[i * 3 + 2] = tmp.b * b;
    }
    this.addPoints(group, pos, col, 1.3);
    this.addCoreBulge(group, body, R * 0.2);
  }

  private buildIrregularGalaxy(group: THREE.Group, body: CosmicBody, rand: () => number) {
    const R = body.scale;
    const n = 10000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const cA = new THREE.Color(body.color);
    const cB = new THREE.Color(body.color2);
    const tmp = new THREE.Color();
    // 2〜3個の塊が寄り集まった形
    const blobs = 2 + Math.floor(rand() * 2);
    const centers: [number, number, number][] = [];
    for (let b = 0; b < blobs; b++)
      centers.push([(rand() - 0.5) * R, (rand() - 0.5) * R * 0.4, (rand() - 0.5) * R]);
    const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
    for (let i = 0; i < n; i++) {
      const c = centers[Math.floor(rand() * blobs)];
      pos[i * 3] = c[0] + gauss() * R * 0.4;
      pos[i * 3 + 1] = c[1] + gauss() * R * 0.2;
      pos[i * 3 + 2] = c[2] + gauss() * R * 0.4;
      tmp.copy(rand() < 0.7 ? cA : cB);
      const b = 0.5 + rand() * 0.5;
      col[i * 3] = tmp.r * b;
      col[i * 3 + 1] = tmp.g * b;
      col[i * 3 + 2] = tmp.b * b;
    }
    this.addPoints(group, pos, col, 1.3);
  }

  private buildCluster(group: THREE.Group, body: CosmicBody, rand: () => number) {
    const R = body.scale;
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const cA = new THREE.Color(body.color);
    const cB = new THREE.Color(body.color2);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      // 中心集中の球状分布
      const rr = Math.pow(rand(), 1.8) * R;
      const u = rand() * 2 - 1;
      const th = rand() * TAU;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = rr * s * Math.cos(th);
      pos[i * 3 + 1] = rr * u;
      pos[i * 3 + 2] = rr * s * Math.sin(th);
      tmp.copy(cA).lerp(cB, rand() * 0.6);
      const b = 0.6 + rand() * 0.4;
      col[i * 3] = tmp.r * b;
      col[i * 3 + 1] = tmp.g * b;
      col[i * 3 + 2] = tmp.b * b;
    }
    this.addPoints(group, pos, col, 2.0);
  }

  private buildNebula(group: THREE.Group, body: CosmicBody, rand: () => number) {
    const R = body.scale;
    const layers = 3;
    const cA = new THREE.Color(body.color);
    const cB = new THREE.Color(body.color2);
    for (let L = 0; L < layers; L++) {
      const n = 3000;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const tmp = new THREE.Color();
      const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
      const scaleL = R * (0.6 + L * 0.28);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = gauss() * scaleL;
        pos[i * 3 + 1] = gauss() * scaleL * 0.7;
        pos[i * 3 + 2] = gauss() * scaleL;
        tmp.copy(L % 2 === 0 ? cA : cB).lerp(L % 2 === 0 ? cB : cA, rand() * 0.5);
        const b = 0.25 + rand() * 0.45;
        col[i * 3] = tmp.r * b;
        col[i * 3 + 1] = tmp.g * b;
        col[i * 3 + 2] = tmp.b * b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      group.add(
        new THREE.Points(
          geo,
          new THREE.PointsMaterial({
            size: 3.5 - L * 0.6,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
    }
    // 星雲のなかに散らばる若い星々
    const sn = 120;
    const spos = new Float32Array(sn * 3);
    const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
    for (let i = 0; i < sn; i++) {
      spos[i * 3] = gauss() * R * 0.8;
      spos[i * 3 + 1] = gauss() * R * 0.5;
      spos[i * 3 + 2] = gauss() * R * 0.8;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    group.add(
      new THREE.Points(
        sgeo,
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 2.2,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0.9,
        }),
      ),
    );
  }

  private buildStarSystem(
    group: THREE.Group,
    body: CosmicBody,
    planets: CosmosObj['planets'],
    rand: () => number,
  ) {
    const starColor = body.params?.starColor ?? body.color;
    const star = new THREE.Mesh(
      new THREE.SphereGeometry(body.scale * 0.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: starColor }),
    );
    group.add(star);
    // 連星
    if (body.params?.twin) {
      const comp = new THREE.Mesh(
        new THREE.SphereGeometry(body.scale * 0.28, 16, 16),
        new THREE.MeshBasicMaterial({ color: body.color2 }),
      );
      comp.position.set(body.scale * 1.1, 0, 0);
      group.add(comp);
    }
    // 環（アンバー・リングなど）
    if (body.params?.rings) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(body.scale * 0.9, body.scale * 1.25, 64),
        new THREE.MeshBasicMaterial({
          color: body.color2,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
        }),
      );
      ring.rotation.x = Math.PI / 2.2;
      group.add(ring);
    }
    // 惑星たち
    for (const p of body.params?.planets ?? []) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(p.size, 0.05), 12, 12),
        new THREE.MeshBasicMaterial({ color: p.color }),
      );
      if (p.ring) {
        const r = new THREE.Mesh(
          new THREE.RingGeometry(p.size * 1.4, p.size * 2.2, 32),
          new THREE.MeshBasicMaterial({
            color: 0xe6cd8f,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7,
          }),
        );
        r.rotation.x = Math.PI / 2.3;
        mesh.add(r);
      }
      // 薄い軌道リング
      const orbitRing = new THREE.Mesh(
        new THREE.RingGeometry(p.orbit - 0.02, p.orbit + 0.02, 96),
        new THREE.MeshBasicMaterial({
          color: 0x88aacc,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.18,
        }),
      );
      orbitRing.rotation.x = Math.PI / 2;
      group.add(orbitRing);
      group.add(mesh);
      planets.push({
        mesh,
        orbit: p.orbit,
        speed: 0.4 + rand() * 0.8,
        angle: rand() * TAU,
      });
    }
  }

  private buildAnomaly(group: THREE.Group, body: CosmicBody, rand: () => number) {
    // 中心の歪んだ発光核
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(body.scale * 0.3, 2),
      new THREE.MeshBasicMaterial({ color: body.color, wireframe: true, transparent: true, opacity: 0.7 }),
    );
    group.add(core);
    const inner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(body.scale * 0.2, 1),
      new THREE.MeshBasicMaterial({ color: body.color2 }),
    );
    group.add(inner);
    // 渦を巻く光のハロー
    const n = 4000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const cA = new THREE.Color(body.color);
    const cB = new THREE.Color(body.color2);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const t = rand();
      const rad = body.scale * (0.35 + t * 0.65);
      const ang = t * 8 * TAU + rand() * 0.4;
      const tilt = (rand() - 0.5) * body.scale * 0.5;
      pos[i * 3] = Math.cos(ang) * rad;
      pos[i * 3 + 1] = tilt + Math.sin(t * TAU) * body.scale * 0.15;
      pos[i * 3 + 2] = Math.sin(ang) * rad;
      tmp.copy(cA).lerp(cB, rand());
      const b = 0.5 + rand() * 0.5;
      col[i * 3] = tmp.r * b;
      col[i * 3 + 1] = tmp.g * b;
      col[i * 3 + 2] = tmp.b * b;
    }
    this.addPoints(group, pos, col, 2.0);
    // 光の環
    if (body.params?.rings) {
      for (let k = 0; k < 3; k++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(body.scale * (0.5 + k * 0.22), body.scale * 0.012, 8, 96),
          new THREE.MeshBasicMaterial({
            color: k % 2 ? body.color2 : body.color,
            transparent: true,
            opacity: 0.5,
          }),
        );
        ring.rotation.x = Math.PI / 2 + (rand() - 0.5);
        ring.rotation.y = rand() * TAU;
        group.add(ring);
      }
    }
  }

  /** いて座A*：黒い地平線＋光子リング＋小さな降着円盤。 */
  private buildMiniBlackHole(group: THREE.Group, body: CosmicBody) {
    const r = body.scale * 0.3;
    // 事象の地平線（純黒）
    group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(r, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0x000000 }),
      ),
    );
    // 光子リング
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 1.4, r * 1.55, 48),
      new THREE.MeshBasicMaterial({
        color: 0xfff0d0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2.4;
    group.add(ring);
    // 小さな降着円盤（傾いた輪の点群）
    const n = 900;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const cIn = new THREE.Color(1, 0.95, 0.85);
    const cOut = new THREE.Color(body.color);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const t = Math.pow(Math.random(), 1.4);
      const rad = r * (1.8 + 4.5 * t);
      const ang = Math.random() * TAU;
      pos[i * 3] = Math.cos(ang) * rad;
      pos[i * 3 + 1] = (Math.random() - 0.5) * r * 0.15;
      pos[i * 3 + 2] = Math.sin(ang) * rad;
      tmp.copy(cIn).lerp(cOut, t);
      const b = 0.5 + Math.random() * 0.5;
      col[i * 3] = tmp.r * b;
      col[i * 3 + 1] = tmp.g * b;
      col[i * 3 + 2] = tmp.b * b;
    }
    this.addPoints(group, pos, col, 1.4);
  }

  /** 銀河中心の明るいバルジ。 */
  private addCoreBulge(group: THREE.Group, body: CosmicBody, r: number) {
    const bulge = new THREE.Mesh(
      new THREE.SphereGeometry(r, 20, 20),
      new THREE.MeshBasicMaterial({
        color: body.color,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    group.add(bulge);
  }

  private addPoints(group: THREE.Group, pos: Float32Array, col: Float32Array, size: number) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    points.frustumCulled = false;
    group.add(points);
  }

  // -------------------------------------------------------------------------
  // ワープ演出：カメラの進行方向へ星が流れる
  private buildWarpField() {
    const n = 700;
    const pos = new Float32Array(n * 6);
    const D = 900;
    const Rr = 380;
    for (let i = 0; i < n; i++) {
      const th = Math.random() * TAU;
      const rr = 30 + Math.random() * Rr;
      const x = Math.cos(th) * rr;
      const y = Math.sin(th) * rr;
      const z = -D / 2 + Math.random() * D;
      const len = 8 + Math.random() * 20;
      pos[i * 6] = x;
      pos[i * 6 + 1] = y;
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x;
      pos[i * 6 + 4] = y;
      pos[i * 6 + 5] = z - len;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.warpField = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: 0x99ccff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.warpField.frustumCulled = false;
    this.warpField.visible = false;
    this.scene.add(this.warpField);
  }

  private updateWarpField(dt: number) {
    const mat = this.warpField.material as THREE.LineBasicMaterial;
    mat.opacity += (this.warpIntensity - mat.opacity) * Math.min(1, dt * 6);
    if (mat.opacity < 0.01 && !this.warping) {
      this.warpField.visible = false;
      return;
    }
    this.warpField.visible = true;
    // カメラ位置へ、進行方向を向けて配置
    this.warpField.position.copy(this.camera.position);
    this.warpField.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.warpDir);
    // 星を後方へ流す
    const attr = this.warpField.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const speed = 700 * this.warpIntensity * dt;
    const D = 900;
    for (let i = 0; i < arr.length; i += 6) {
      arr[i + 2] += speed;
      arr[i + 5] += speed;
      if (arr[i + 2] > D / 2) {
        arr[i + 2] -= D;
        arr[i + 5] -= D;
      }
    }
    attr.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  /** ワープ航行中か（自動探索ツアーの制御用）。 */
  isWarping(): boolean {
    return this.warping;
  }

  /** カメラ＋注視点のワープ・トゥイーンを開始する共通処理。 */
  private startWarp(camDest: THREE.Vector3, targetDest: THREE.Vector3, onArrive?: () => void) {
    this.warpFrom.copy(this.camera.position);
    this.warpTo.copy(camDest);
    this.warpTargetFrom.copy(this.controls.target);
    this.warpTargetTo.copy(targetDest);
    this.warpDir.subVectors(camDest, this.camera.position).normalize();
    const travel = this.warpFrom.distanceTo(this.warpTo);
    this.warpDur = Math.min(3.2, Math.max(1.1, 0.7 + travel / 4000));
    this.warpT = 0;
    this.warping = true;
    this.controls.enabled = false;
    this.onWarpArrive = onArrive ?? null;
  }

  /** 天体へワープする。pullback > 1 で到着位置を引きにする。 */
  warpToBody(body: CosmicBody, onArrive?: () => void, pullback = 1) {
    const obj = this.objs.find((o) => o.body.id === body.id);
    if (!obj) return;
    this.focused = body;
    const dest = obj.group.position.clone();
    // 天体の外側、少し引いた位置へ
    const dist = Math.max(body.scale * 2.2, 8) * pullback;
    const dir = new THREE.Vector3()
      .subVectors(this.camera.position, dest)
      .normalize();
    if (dir.lengthSq() < 0.001) dir.set(0.4, 0.25, 1).normalize();
    const camDest = dest.clone().addScaledVector(dir, dist).add(new THREE.Vector3(0, dist * 0.28, 0));
    this.startWarp(camDest, dest, onArrive);
  }

  /** 引きの全景（天の川と周辺の銀河たちが見える位置）へ戻る。 */
  warpToOverview(onArrive?: () => void) {
    this.focused = null;
    this.startWarp(new THREE.Vector3(220, 900, 1600), new THREE.Vector3(0, 0, 0), onArrive);
  }

  private updateWarp(dt: number) {
    if (!this.warping) {
      this.warpIntensity = Math.max(0, this.warpIntensity - dt * 2);
      return;
    }
    this.warpT += dt / this.warpDur;
    const t = Math.min(1, this.warpT);
    // イーズイン・アウト
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    this.camera.position.lerpVectors(this.warpFrom, this.warpTo, e);
    this.controls.target.lerpVectors(this.warpTargetFrom, this.warpTargetTo, e);
    // 中盤で最大の流れ
    this.warpIntensity = Math.sin(t * Math.PI);
    if (t >= 1) {
      this.warping = false;
      this.controls.enabled = true;
      const cb = this.onWarpArrive;
      this.onWarpArrive = null;
      if (cb) cb();
    }
  }

  // -------------------------------------------------------------------------
  /** 画面座標から最前面の天体を拾う（クリック・ホバー共通）。 */
  private pickAt(clientX: number, clientY: number): CosmosObj | null {
    this.pointer.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const picks = this.objs.map((o) => o.pick);
    const hits = this.raycaster.intersectObjects(picks, false);
    if (!hits.length) return null;
    const id = hits[0].object.userData.id as string;
    return this.objs.find((o) => o.body.id === id) ?? null;
  }

  private onClick = (ev: MouseEvent) => {
    if (this.warping || this.theaterActive || this.diveActive) return;
    const obj = this.pickAt(ev.clientX, ev.clientY);
    if (obj) this.callbacks.onSelect(obj.body);
  };

  private onDblClick = (ev: MouseEvent) => {
    if (this.warping || this.theaterActive || this.diveActive) return;
    const obj = this.pickAt(ev.clientX, ev.clientY);
    if (obj) this.callbacks.onWarpRequest?.(obj.body);
  };

  private onPointerMove = (ev: PointerEvent) => {
    this.hoverPointer.set(ev.clientX, ev.clientY);
    this.pointerInside = true;
  };

  private onPointerLeave = () => {
    this.pointerInside = false;
    this.setHovered(null);
  };

  /** ホバー中の天体を切り替え、グロー拡大とカーソルで知らせる。 */
  private setHovered(obj: CosmosObj | null) {
    if (obj === this.hovered) return;
    if (this.hovered) this.hovered.glow.scale.setScalar(this.hovered.glowScale);
    this.hovered = obj;
    if (obj) obj.glow.scale.setScalar(obj.glowScale * 1.22);
    this.renderer.domElement.style.cursor = obj ? 'pointer' : '';
  }

  /** 約0.1秒おきにホバー判定（毎フレームのレイキャストは避ける）。 */
  private updateHover() {
    if (this.elapsed - this.hoverCheckedAt < 0.1) return;
    this.hoverCheckedAt = this.elapsed;
    if (!this.pointerInside || this.warping || this.theaterActive || this.diveActive) {
      this.setHovered(null);
      return;
    }
    this.setHovered(this.pickAt(this.hoverPointer.x, this.hoverPointer.y));
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
    this.keys.add(e.key.toLowerCase());
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());

  /** WASD / QE で自由航行（カメラと注視点をいっしょに動かす）。 */
  private updateCruise(dt: number) {
    if (
      !this.cruiseEnabled ||
      this.warping ||
      !this.running ||
      this.theaterActive ||
      this.diveActive
    )
      return;
    const k = this.keys;
    if (!(k.has('w') || k.has('s') || k.has('a') || k.has('d') || k.has('q') || k.has('e'))) return;
    const dist = this.camera.position.distanceTo(this.controls.target);
    const step = Math.max(3, dist * 0.9) * dt * (k.has('shift') ? 3 : 1);
    const fwd = new THREE.Vector3().subVectors(this.controls.target, this.camera.position).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, this.camera.up).normalize();
    const up = this.camera.up.clone();
    const move = new THREE.Vector3();
    if (k.has('w')) move.addScaledVector(fwd, step);
    if (k.has('s')) move.addScaledVector(fwd, -step);
    if (k.has('d')) move.addScaledVector(right, step);
    if (k.has('a')) move.addScaledVector(right, -step);
    if (k.has('e')) move.addScaledVector(up, step);
    if (k.has('q')) move.addScaledVector(up, -step);
    this.camera.position.add(move);
    this.controls.target.add(move);
    this.focused = null;
  }

  // -------------------------------------------------------------------------
  private onResize = () => {
    if (!this.running) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };

  /** 現在のカメラから太陽系（sol）までの距離感を返す（HUD 表示用）。 */
  cameraNearestInfo(): { body: CosmicBody; dist: number } | null {
    let best: { body: CosmicBody; dist: number } | null = null;
    for (const o of this.objs) {
      const d = this.camera.position.distanceTo(o.group.position);
      if (!best || d < best.dist) best = { body: o.body, dist: d };
    }
    return best;
  }

  setActive(active: boolean) {
    this.running = active;
    this.renderer.domElement.style.display = active ? 'block' : 'none';
    this.labelRenderer.domElement.style.display = active ? 'block' : 'none';
    if (active) this.onResize();
  }

  /** 没入モードのゆっくりした周回ドリフト（放置中も画が生きる）。 */
  setDrift(on: boolean) {
    this.controls.autoRotate = on;
  }

  /** ワープのFOVキックを解除して基本視野角へ戻す。 */
  private resetFov() {
    this.camera.fov = BASE_FOV;
    this.camera.updateProjectionMatrix();
  }

  /** 起動直後の見せ場：天の川全景 → 太陽系へゆっくり寄る。 */
  introFlyTo(id: string) {
    // まず銀河全景を映す位置に置く
    this.camera.position.set(120, 420, 620);
    this.controls.target.set(0, 0, 0);
    const body = ALL_BODIES.find((b) => b.id === id);
    if (body) setTimeout(() => this.warpToBody(body), 900);
  }

  /** 没入モードの導入：銀河のそばから、引きの全景へゆっくり下がる。 */
  introOverview() {
    this.camera.position.set(110, 340, 520);
    this.controls.target.set(0, 0, 0);
    setTimeout(() => {
      this.warpToOverview();
      this.warpDur = 6.5;
    }, 600);
  }

  // -------------------------------------------------------------------------
  // 銀河衝突シアター：全天体を隠し、専用ステージで衝突シミュレーションを上演
  setTheater(on: boolean) {
    if (on === this.theaterActive) return;
    this.theaterActive = on;
    if (on) {
      if (!this.theater) {
        this.theater = new CollisionTheater();
        this.theater.group.position.set(0, 0, 0);
        this.scene.add(this.theater.group);
      }
      this.theater.reset();
      this.theater.group.visible = true;
      // ワープ中なら打ち切り、カメラを保存してステージ席へ
      this.warping = false;
      this.warpIntensity = 0;
      this.resetFov();
      this.setHovered(null);
      this.controls.enabled = true;
      this.savedCamPos.copy(this.camera.position);
      this.savedCamTarget.copy(this.controls.target);
      this.camera.position.set(0, 190, 430);
      this.controls.target.set(0, 0, 0);
      for (const o of this.objs) {
        o.group.visible = false;
        o.label.visible = false;
      }
    } else {
      if (this.theater) this.theater.group.visible = false;
      this.camera.position.copy(this.savedCamPos);
      this.controls.target.copy(this.savedCamTarget);
      for (const o of this.objs) o.group.visible = true;
    }
  }

  // -------------------------------------------------------------------------
  // ブラックホール・ダイブ：全天体を隠し、いて座A*への降下を上演
  setDive(on: boolean) {
    if (on === this.diveActive) return;
    this.diveActive = on;
    if (on) {
      if (!this.dive) {
        this.dive = new BlackHoleDive();
        this.dive.group.position.set(0, 0, 0);
        this.scene.add(this.dive.group);
      }
      this.dive.reset();
      this.dive.group.visible = true;
      this.warping = false;
      this.warpIntensity = 0;
      this.resetFov();
      this.setHovered(null);
      this.savedDiveCamPos.copy(this.camera.position);
      this.savedDiveCamTarget.copy(this.controls.target);
      this.controls.enabled = false; // 降下中はカメラをダイブが運転
      for (const o of this.objs) {
        o.group.visible = false;
        o.label.visible = false;
      }
    } else {
      if (this.dive) this.dive.group.visible = false;
      this.camera.position.copy(this.savedDiveCamPos);
      this.controls.target.copy(this.savedDiveCamTarget);
      this.controls.enabled = true;
      for (const o of this.objs) o.group.visible = true;
    }
  }

  /**
   * まだ発見していない未知の銀河のうち、現在地に近いものを1つ返す。
   * すべて発見済みならランダムに1つ返す。
   */
  scanNearestUnknown(discoveredIds: Set<string>): CosmicBody | null {
    const undiscovered = UNKNOWN_GALAXIES.filter((b) => !discoveredIds.has(b.id));
    const pool = undiscovered.length ? undiscovered : UNKNOWN_GALAXIES;
    if (!pool.length) return null;
    let best: CosmicBody | null = null;
    let bestD = Infinity;
    for (const b of pool) {
      const d = this.camera.position.distanceTo(
        new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2]),
      );
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  render(dt: number) {
    if (!this.running) return;
    this.elapsed += dt;

    // ダイブ中はブラックホール演出とカメラ降下だけを進める
    if (this.diveActive && this.dive) {
      this.dive.update(dt, this.camera, this.controls);
      this.composer.render();
      this.labelRenderer.render(this.scene, this.camera);
      return;
    }

    // シアター上演中は衝突シミュレーションだけを進める
    if (this.theaterActive && this.theater) {
      this.theater.stepFrame(dt);
      this.controls.update();
      this.composer.render();
      this.labelRenderer.render(this.scene, this.camera);
      return;
    }

    this.updateWarp(dt);
    this.updateCruise(dt);
    this.updateWarpField(dt);
    this.updateHover();

    // ワープ中は視野角を広げて加速感を出す（明るさには触れない）
    const targetFov = BASE_FOV + this.warpIntensity * 16;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 7);
      this.camera.updateProjectionMatrix();
    }

    const camPos = this.camera.position;
    for (const o of this.objs) {
      // 自転
      if (o.spin) o.group.rotation.y += o.spin * dt;
      // 惑星公転
      for (const p of o.planets) {
        p.angle += p.speed * dt;
        p.mesh.position.set(Math.cos(p.angle) * p.orbit, 0, Math.sin(p.angle) * p.orbit);
      }
      // グローは常にカメラへ正対（スプライトなので自動）／サイズを距離で微調整
      // ラベルは近い天体・注視天体のみ表示（乱雑さ回避）
      const d = camPos.distanceTo(o.group.position);
      const showLabel =
        o.body === this.focused ||
        o.body.kind === 'home' ||
        d < Math.max(o.body.scale * 14, 400);
      o.label.visible = showLabel;
    }

    if (!this.warping) this.controls.update();
    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }
}
