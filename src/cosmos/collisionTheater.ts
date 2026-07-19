import * as THREE from 'three';
import { makeCoronaTexture } from '../scene/planetShaders';

// ---------------------------------------------------------------------------
// 銀河衝突シアター — 天の川銀河 × アンドロメダ銀河
//
// いまから約45億年後にはじまると考えられている二大銀河の衝突・合体を、
// 制限多体シミュレーションでライブ再生する。星々はテスト粒子として
// ふたつの銀河核（点質量＋ソフトニング）の重力だけを感じ、核どうしは
// 相互重力＋力学的摩擦（近接時の減衰）で軌道を落としながら合体する。
// Toomre & Toomre (1972) の古典的な手法の現代風アレンジ。潮汐の尾は
// スクリプトではなく、この計算から創発的に生まれる。
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

/** 粒子が感じる核のソフトニング長^2（近接時の発散防止） */
const P_EPS2 = 7 * 7;
/** 核どうしのソフトニング長^2 */
const C_EPS2 = 10 * 10;
/** 力学的摩擦がはたらきはじめる核間距離 */
const DRAG_RANGE = 170;
/** 力学的摩擦の強さ */
const DRAG_K = 0.012;
/** 積分の基本ステップ */
const DT = 0.06;
/**
 * シミュレーション時間 → 億年の換算。
 * 数値検証で最初のすれ違いが simT≈62 だったので、実際の予測
 * 「約45億年後に最初の接近」に合わせて 45/62 ≈ 0.73 とする。
 * 完全合体は simT≈100前後 → 約70億年後（ミルコメダ誕生の予測と整合）。
 */
export const OKU_YEARS_PER_UNIT = 0.73;

interface GalaxyDef {
  gm: number;
  radius: number;
  n: number;
  tilt: THREE.Euler;
  cCore: number;
  cEdge: number;
  pos0: THREE.Vector3;
  vel0: THREE.Vector3;
}

/** 天の川（やや小さい・青白い円盤） */
const MILKY: GalaxyDef = {
  gm: 1400,
  radius: 46,
  n: 5200,
  tilt: new THREE.Euler(0.42, 0.1, 0.18),
  cCore: 0xfff0cc,
  cEdge: 0x7fa8ff,
  pos0: new THREE.Vector3(-130, -6, -34),
  // 接線成分を持たせ、一度すれ違ってから（潮汐の尾を伸ばして）合体する軌道に
  vel0: new THREE.Vector3(1.05, 0.08, 1.15),
};
/** アンドロメダ（ひとまわり大きい・金色がかった円盤） */
const ANDROMEDA: GalaxyDef = {
  gm: 1750,
  radius: 56,
  n: 6200,
  tilt: new THREE.Euler(-0.55, 0.45, -0.1),
  cCore: 0xffe2b0,
  cEdge: 0xd9a6ff,
  pos0: new THREE.Vector3(130, 6, 34),
  // 運動量がほぼ釣り合うよう質量比で反転
  vel0: new THREE.Vector3(-1.05, -0.08, -1.15).multiplyScalar(1400 / 1750),
};

interface Core {
  gm: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  glow: THREE.Sprite;
}

/**
 * 衝突シアター本体。group をシーンに追加し、毎フレーム stepFrame(dt) を
 * 呼ぶだけで動く。reset() でいつでも最初からやり直せる。
 */
export class CollisionTheater {
  readonly group = new THREE.Group();

  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private points: THREE.Points;
  private coreA: Core;
  private coreB: Core;

  /** シミュレーション経過時間（内部単位） */
  simT = 0;
  playing = true;
  /** 再生スピード倍率（HUD スライダー） */
  speed = 1;
  /** 一度でも核どうしが深く接触したら true（合体宣言、リセットまで保持） */
  merged = false;

  constructor() {
    this.n = MILKY.n + ANDROMEDA.n;
    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);

    const colors = new Float32Array(this.n * 3);
    this.fillColors(colors, 0, MILKY);
    this.fillColors(colors, MILKY.n, ANDROMEDA);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 1.1,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.group.add(this.points);

    this.coreA = this.makeCore(MILKY);
    this.coreB = this.makeCore(ANDROMEDA);
    this.reset();
  }

  private makeCore(def: GalaxyDef): Core {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeCoronaTexture(),
        color: def.cCore,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.4,
      }),
    );
    glow.scale.setScalar(16);
    this.group.add(glow);
    return { gm: def.gm, pos: new THREE.Vector3(), vel: new THREE.Vector3(), glow };
  }

  private fillColors(colors: Float32Array, offset: number, def: GalaxyDef) {
    const cCore = new THREE.Color(def.cCore);
    const cEdge = new THREE.Color(def.cEdge);
    const tmp = new THREE.Color();
    for (let i = 0; i < def.n; i++) {
      // 半径分布とそろえるため sqrt 分布の t で色を混ぜる
      const t = Math.sqrt((i + 0.5) / def.n);
      tmp.copy(cCore).lerp(cEdge, t);
      const b = 0.55 + Math.random() * 0.45;
      const k = (offset + i) * 3;
      colors[k] = tmp.r * b;
      colors[k + 1] = tmp.g * b;
      colors[k + 2] = tmp.b * b;
    }
  }

  /** 初期状態（衝突前・接近中）へ巻き戻す。 */
  reset() {
    this.simT = 0;
    this.playing = true;
    this.merged = false;
    this.coreA.pos.copy(MILKY.pos0);
    this.coreA.vel.copy(MILKY.vel0);
    this.coreB.pos.copy(ANDROMEDA.pos0);
    this.coreB.vel.copy(ANDROMEDA.vel0);
    this.initDisk(0, MILKY, this.coreA);
    this.initDisk(MILKY.n, ANDROMEDA, this.coreB);
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** 回転円盤として粒子を初期化（円軌道速度＋銀河ごとの傾き）。 */
  private initDisk(offset: number, def: GalaxyDef, core: Core) {
    const rot = new THREE.Matrix4().makeRotationFromEuler(def.tilt);
    const p = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i < def.n; i++) {
      // 中心にやや集中する面密度（sqrt 分布）＋内縁の穴
      const r = def.radius * (0.1 + 0.9 * Math.sqrt((i + 0.5) / def.n));
      const ang = Math.random() * TAU;
      const thick = (Math.random() - 0.5) * def.radius * 0.05;
      p.set(Math.cos(ang) * r, thick, Math.sin(ang) * r).applyMatrix4(rot);
      // 円軌道速度（接線方向）も同じ傾きで回す
      const vc = Math.sqrt(def.gm / Math.sqrt(r * r + P_EPS2));
      v.set(-Math.sin(ang) * vc, 0, Math.cos(ang) * vc).applyMatrix4(rot);
      const k = (offset + i) * 3;
      this.pos[k] = core.pos.x + p.x;
      this.pos[k + 1] = core.pos.y + p.y;
      this.pos[k + 2] = core.pos.z + p.z;
      this.vel[k] = core.vel.x + v.x;
      this.vel[k + 1] = core.vel.y + v.y;
      this.vel[k + 2] = core.vel.z + v.z;
    }
  }

  /** 現在の核間距離（HUD 表示・検証用）。 */
  coreSeparation(): number {
    return this.coreA.pos.distanceTo(this.coreB.pos);
  }

  /** 経過時間を億年で返す。 */
  okuYears(): number {
    return this.simT * OKU_YEARS_PER_UNIT;
  }

  /** 実時間 dtSec ぶんだけシミュレーションを進める（内部でサブステップ）。 */
  stepFrame(dtSec: number) {
    if (!this.playing) return;
    // 実1秒 = 内部 10×speed 単位。安定性のため DT 刻みに分割。
    const advance = Math.min(dtSec, 0.05) * 10 * this.speed;
    let steps = Math.ceil(advance / DT);
    if (steps > 24) steps = 24; // 高速再生でも1フレームの計算量に上限
    const dt = advance / steps;
    for (let s = 0; s < steps; s++) this.step(dt);
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.coreA.glow.position.copy(this.coreA.pos);
    this.coreB.glow.position.copy(this.coreB.pos);
  }

  /** 1ステップ：核（相互重力＋摩擦）→ 粒子（両核からの重力）。 */
  private step(dt: number) {
    const A = this.coreA;
    const B = this.coreB;
    // --- 核どうし ---
    let dx = B.pos.x - A.pos.x;
    let dy = B.pos.y - A.pos.y;
    let dz = B.pos.z - A.pos.z;
    const d2 = dx * dx + dy * dy + dz * dz + C_EPS2;
    const d = Math.sqrt(d2);
    const inv3 = 1 / (d2 * d);
    // 相互重力
    A.vel.x += dx * inv3 * B.gm * dt;
    A.vel.y += dy * inv3 * B.gm * dt;
    A.vel.z += dz * inv3 * B.gm * dt;
    B.vel.x -= dx * inv3 * A.gm * dt;
    B.vel.y -= dy * inv3 * A.gm * dt;
    B.vel.z -= dz * inv3 * A.gm * dt;
    // 深い接触で合体宣言（二度目の突入以降はほぼ離れられない）
    if (d < 15 && this.simT > 70) this.merged = true;
    // 力学的摩擦：近接時に相対速度を減衰 → 軌道が落ちて合体へ
    if (d < DRAG_RANGE) {
      const k = DRAG_K * (1 - d / DRAG_RANGE) * dt;
      const rvx = (A.vel.x - B.vel.x) * k;
      const rvy = (A.vel.y - B.vel.y) * k;
      const rvz = (A.vel.z - B.vel.z) * k;
      A.vel.x -= rvx;
      A.vel.y -= rvy;
      A.vel.z -= rvz;
      B.vel.x += rvx;
      B.vel.y += rvy;
      B.vel.z += rvz;
    }
    A.pos.x += A.vel.x * dt;
    A.pos.y += A.vel.y * dt;
    A.pos.z += A.vel.z * dt;
    B.pos.x += B.vel.x * dt;
    B.pos.y += B.vel.y * dt;
    B.pos.z += B.vel.z * dt;

    // --- 粒子（テスト粒子、セミインプリシット・オイラー） ---
    const ax = A.pos.x;
    const ay = A.pos.y;
    const az = A.pos.z;
    const bx = B.pos.x;
    const by = B.pos.y;
    const bz = B.pos.z;
    const gmA = A.gm;
    const gmB = B.gm;
    const pos = this.pos;
    const vel = this.vel;
    for (let k = 0; k < pos.length; k += 3) {
      const px = pos[k];
      const py = pos[k + 1];
      const pz = pos[k + 2];
      // 核A
      let ddx = ax - px;
      let ddy = ay - py;
      let ddz = az - pz;
      let r2 = ddx * ddx + ddy * ddy + ddz * ddz + P_EPS2;
      let f = (gmA / (r2 * Math.sqrt(r2))) * dt;
      let vx = vel[k] + ddx * f;
      let vy = vel[k + 1] + ddy * f;
      let vz = vel[k + 2] + ddz * f;
      // 核B
      ddx = bx - px;
      ddy = by - py;
      ddz = bz - pz;
      r2 = ddx * ddx + ddy * ddy + ddz * ddz + P_EPS2;
      f = (gmB / (r2 * Math.sqrt(r2))) * dt;
      vx += ddx * f;
      vy += ddy * f;
      vz += ddz * f;
      vel[k] = vx;
      vel[k + 1] = vy;
      vel[k + 2] = vz;
      pos[k] = px + vx * dt;
      pos[k + 1] = py + vy * dt;
      pos[k + 2] = pz + vz * dt;
    }
    this.simT += dt;
  }
}
