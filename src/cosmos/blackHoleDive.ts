import * as THREE from 'three';
import { makeCoronaTexture } from '../scene/planetShaders';

// ---------------------------------------------------------------------------
// ブラックホール・ダイブ — いて座A*への降下体験
//
// 天の川銀河の中心に眠る超大質量ブラックホール「いて座A*」（太陽の約430万倍）
// へ、宇宙船でゆっくり降りていく。表示される物理量は実際の
// シュヴァルツシルト解に基づく:
//   ・時間の遅れ    γ = 1 / √(1 − rs/r)（静止観測者）
//   ・潮汐加速度    Δa = 2GM·h / r³（h = 身長1.8m、G単位で表示）
// 降下は r/rs の指数スクリプトで進み、地平線ぎりぎり（r = 1.02 rs）で
// 「突入」となる。降着円盤のドップラービーミング（近づく側が明るい）も
// 毎フレーム色計算で再現する。
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

/** 事象の地平線の見かけ半径（シーン単位） */
export const RS_UNITS = 14;
/** 降下開始の距離 [rs] */
const X_START = 400;
/** ここまで来たら「突入」扱い [rs] */
const X_PLUNGE = 1.02;
/** 降下スクリプト x(t) = 1 + (X_START−1)·e^(−K·t)。speed=1 で約120秒の旅。 */
const K = Math.log((X_START - 1) / (X_PLUNGE - 1)) / 120;

/** いて座A*の潮汐係数: Δa[G] = TIDAL_G1 / x³（x = r/rs、身長1.8m） */
const TIDAL_G1 = 1.02e-4;

const DISK_N = 5200;

export interface DiveStage {
  /** この距離 [rs] を切ったら表示 */
  x: number;
  title: string;
  text: string;
}

/** 降下中に順番に現れるナレーション。 */
export const DIVE_STAGES: DiveStage[] = [
  {
    x: X_START,
    title: '降下開始 — いて座A*',
    text: '天の川銀河の中心に眠る、太陽の430万倍の質量をもつ超大質量ブラックホール。2022年、人類はその「影」の撮影に成功しました。ここから事象の地平線まで、ゆっくり降りていきます。',
  },
  {
    x: 100,
    title: '降着円盤の上空',
    text: '吸い込まれていくガスは光速近くまで加速され、摩擦で数百万度に灼けています。円盤の片側だけが明るいのはドップラービーミング——こちらへ向かってくる側の光が増幅されて見えるためです。',
  },
  {
    x: 30,
    title: '時間が、ずれはじめる',
    text: '重力が時間の流れを遅くしはじめました。あなたの時計は、地球の時計より少しだけゆっくり進んでいます。振り返れば、外の宇宙がほんのわずかに早送りで動いて見えるはずです。',
  },
  {
    x: 6,
    title: '最内安定円軌道（ISCO）',
    text: 'ここより内側では、どんな物体も安定した円軌道を保てません。ガスも星の欠片も、あとは螺旋を描いて落ちていくだけ。引き返せない領域が、すぐそこまで迫っています。',
  },
  {
    x: 3,
    title: '光子球が見えてきた',
    text: '半径1.5rsでは、光そのものがブラックホールのまわりを円軌道で回り続けます。理論上、ここで真横を見つめれば——ぐるりと一周してきた光で、自分自身の背中が見えるのです。',
  },
  {
    x: 1.5,
    title: 'それでも、何も感じない',
    text: '頭と足にかかる重力の差（潮汐力）は、まだ約0.0003G。まったく何も感じません。これが巨大ブラックホールの意外な事実——もしこれが恒星質量のブラックホールだったら、あなたは数百km手前で麺のように引き伸ばされていました（スパゲッティ化）。大きいブラックホールほど、その境界は静かでおだやかなのです。',
  },
  {
    x: 1.05,
    title: '事象の地平線、直前',
    text: '外の宇宙の時間は、もう何倍も速く流れています。そして外から見たあなたは——地平線の手前でどんどん遅く、赤く、暗くなり、永遠に止まって見える。外の誰にも、あなたが「落ちた瞬間」を見ることはできません。',
  },
];

/** 突入後に表示する最後のカード。 */
export const DIVE_FINAL = {
  title: '事象の地平線を越えました',
  text: 'ここから先、すべての未来は中心の特異点へ向かいます。前へ進むことも、止まることも、引き返すことも——どんなロケットを吹かしても、外の宇宙へ戻る道はもう存在しません。内側では「外へ向かう方向」そのものが、「過去へ向かう方向」と同じ意味になるのです。\n\n（ご安心を。これはシミュレーションなので、時間を巻き戻して帰れます）',
};

/**
 * ダイブ本体。group をシーンに追加し、毎フレーム update() を呼ぶと
 * カメラを乗せて降下する。
 */
export class BlackHoleDive {
  readonly group = new THREE.Group();

  private disk: THREE.Points;
  private diskAngle: Float32Array;
  private diskRadius: Float32Array;
  /** 温度グラデーションの基本色（ドップラー係数を毎フレーム掛ける） */
  private diskBase: Float32Array;
  private photonRing: THREE.Mesh;
  private arcGroup: THREE.Group;

  /** 現在距離 [rs] */
  xRs = X_START;
  /** あなたの経過時間 [s]（スピード倍率込み） */
  yourSec = 0;
  /** 地球の経過時間 [s]（γ を積算） */
  earthSec = 0;
  playing = true;
  speed = 1;
  /** 地平線に到達したか */
  finished = false;

  constructor() {
    // --- 事象の地平線（純黒の球：円盤と星々を背にした影になる） ---
    const horizon = new THREE.Mesh(
      new THREE.SphereGeometry(RS_UNITS, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    this.group.add(horizon);

    // --- 光子リング（カメラ正対の細い明環） ---
    this.photonRing = new THREE.Mesh(
      new THREE.RingGeometry(RS_UNITS * 1.45, RS_UNITS * 1.58, 96),
      new THREE.MeshBasicMaterial({
        color: 0xfff0d0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.group.add(this.photonRing);

    // --- 重力レンズ風のアーチ（円盤の向こう側が上下に曲がって見える近似） ---
    this.arcGroup = new THREE.Group();
    const arcTop = new THREE.Mesh(
      new THREE.TorusGeometry(RS_UNITS * 2.5, RS_UNITS * 0.16, 10, 64, Math.PI),
      new THREE.MeshBasicMaterial({
        color: 0xffa050,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const arcBottom = new THREE.Mesh(
      new THREE.TorusGeometry(RS_UNITS * 1.95, RS_UNITS * 0.11, 10, 64, Math.PI),
      new THREE.MeshBasicMaterial({
        color: 0xff8840,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    arcBottom.rotation.z = Math.PI; // 下側の弧
    this.arcGroup.add(arcTop, arcBottom);
    this.group.add(this.arcGroup);

    // --- 降着円盤（ケプラー回転＋ドップラービーミング） ---
    this.diskAngle = new Float32Array(DISK_N);
    this.diskRadius = new Float32Array(DISK_N);
    this.diskBase = new Float32Array(DISK_N * 3);
    const pos = new Float32Array(DISK_N * 3);
    const col = new Float32Array(DISK_N * 3);
    const cHot = new THREE.Color(1.0, 0.97, 0.9);
    const cMid = new THREE.Color(1.0, 0.72, 0.42);
    const cCool = new THREE.Color(0.85, 0.4, 0.18);
    const tmp = new THREE.Color();
    for (let i = 0; i < DISK_N; i++) {
      const t = Math.pow(Math.random(), 1.5); // 内側に密度
      const r = RS_UNITS * (2.2 + 7.4 * t);
      this.diskRadius[i] = r;
      this.diskAngle[i] = Math.random() * TAU;
      // 温度: 内側ほど白熱
      if (t < 0.4) tmp.copy(cHot).lerp(cMid, t / 0.4);
      else tmp.copy(cMid).lerp(cCool, (t - 0.4) / 0.6);
      const b = 0.7 + Math.random() * 0.3;
      this.diskBase[i * 3] = tmp.r * b;
      this.diskBase[i * 3 + 1] = tmp.g * b;
      this.diskBase[i * 3 + 2] = tmp.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.disk = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 1.5,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.disk.frustumCulled = false;
    this.group.add(this.disk);

    // --- 中心のかすかな青いハロー ---
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeCoronaTexture(),
        color: 0x6688cc,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.16,
      }),
    );
    halo.scale.setScalar(RS_UNITS * 7);
    this.group.add(halo);

    this.reset();
  }

  /** 降下をはじめからやり直す。 */
  reset() {
    this.xRs = X_START;
    this.yourSec = 0;
    this.earthSec = 0;
    this.playing = true;
    this.finished = false;
  }

  /** 時間の遅れ γ（静止観測者、r/rs から）。 */
  gamma(): number {
    const x = Math.max(this.xRs, 1.0005);
    return 1 / Math.sqrt(1 - 1 / x);
  }

  /** 頭と足の重力差 [G]（身長1.8m、いて座A*）。 */
  tidalG(): number {
    return TIDAL_G1 / Math.pow(this.xRs, 3);
  }

  /** いまの距離を切ったナレーション段階（-1 = まだ）。 */
  stageIndex(): number {
    let idx = -1;
    for (let i = 0; i < DIVE_STAGES.length; i++) {
      if (this.xRs <= DIVE_STAGES[i].x) idx = i;
    }
    return idx;
  }

  /**
   * 毎フレーム呼ぶ。降下スクリプトを進め、円盤を回し、カメラを乗せる。
   */
  update(dt: number, camera: THREE.PerspectiveCamera, controls: { target: THREE.Vector3 }) {
    if (this.playing && !this.finished) {
      const step = dt * this.speed;
      this.yourSec += step;
      this.earthSec += this.gamma() * step;
      this.xRs = 1 + (X_START - 1) * Math.exp(-K * this.yourSec);
      if (this.xRs <= X_PLUNGE) {
        this.xRs = X_PLUNGE;
        this.finished = true;
        this.playing = false;
      }
    }

    // --- 円盤: ケプラー回転（内側ほど速い）＋ドップラービーミング ---
    const posAttr = this.disk.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.disk.geometry.getAttribute('color') as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const col = colAttr.array as Float32Array;
    // カメラの方位角から「近づいてくる側」を求める
    const camAz = Math.atan2(camera.position.z, camera.position.x);
    for (let i = 0; i < DISK_N; i++) {
      const r = this.diskRadius[i];
      const w = 0.55 * Math.pow((RS_UNITS * 2.2) / r, 1.5); // 視覚用ケプラー角速度
      this.diskAngle[i] += w * dt;
      const ang = this.diskAngle[i];
      pos[i * 3] = Math.cos(ang) * r;
      pos[i * 3 + 1] = (Math.sin(ang * 3 + r) * 0.15 + 0) * RS_UNITS * 0.04;
      pos[i * 3 + 2] = Math.sin(ang) * r;
      // 接線速度がカメラへ向く側（ang ≈ camAz − 90°）が増光・青方偏移
      const doppler = Math.sin(camAz - ang);
      const f = 0.55 + 0.75 * Math.max(0, doppler) + 0.12;
      col[i * 3] = this.diskBase[i * 3] * f;
      col[i * 3 + 1] = this.diskBase[i * 3 + 1] * f;
      col[i * 3 + 2] = this.diskBase[i * 3 + 2] * f * (1 + 0.25 * Math.max(0, doppler));
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // 光子リングとレンズアーチはつねにカメラ正対
    this.photonRing.lookAt(camera.position);
    this.arcGroup.rotation.y = camAz + Math.PI / 2;

    // --- カメラを降下パスに乗せる ---
    const x = this.xRs;
    const camd = RS_UNITS * (1.6 + Math.pow(Math.max(x - 1, 0), 0.62));
    const az = -0.5 + this.yourSec * 0.004; // ゆっくり回り込みながら
    const h = RS_UNITS * 0.6 + camd * 0.2 * Math.min(1, x / 50);
    camera.position.set(Math.cos(az) * camd, h, Math.sin(az) * camd);
    controls.target.set(0, 0, 0);
    camera.lookAt(0, 0, 0);
  }
}
