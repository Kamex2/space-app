import './style.css';
import { PLANET_NAME_JA, type PlanetKey } from './data/planetElements';
import {
  planetStateAtJD,
  planetElementsAtJD,
  radius,
  orbitalPeriodDays,
  eclipticLongitudeDeg,
} from './ephemeris/ephemeris';
import { RAD2DEG, AU_IN_KM, KMS_TO_AU_PER_DAY } from './data/constants';
import { dateToJulian, julianToDate, JD_MIN, JD_MAX } from './ephemeris/time';
import { activeShowersAt } from './data/meteorShowers';
import { SolarScene, type ViewMode } from './scene/SolarScene';
import { len, sub } from './sim/vec';
import { NEO_APPROACHES, SMALL_BODIES, AU_PER_LD } from './data/smallBodies';
import { FIREBALLS, fireballPlaceJa } from './data/fireballs';
import { PLANET_INFO } from './data/planetInfo';
import { buildHud, setDateInput } from './ui/hud';
import { formatJDDate, formatJDInput } from './ui/format';
import { CosmosScene } from './cosmos/CosmosScene';
import { buildCosmosHud, renderCosmosInfo, renderCosmosLog } from './cosmos/cosmosHud';
import { COSMOS, KIND_JA, distanceLabel, type CosmicBody } from './cosmos/cosmosData';
import { DIVE_STAGES, DIVE_FINAL } from './cosmos/blackHoleDive';
import { CosmosAudio } from './cosmos/cosmosAudio';

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
const app = document.querySelector<HTMLDivElement>('#app')!;
const sceneContainer = document.createElement('div');
sceneContainer.className = 'scene-container';
app.appendChild(sceneContainer);

let currentJD = dateToJulian(new Date(Date.UTC(2000, 0, 1)));

const hud = buildHud(
  app,
  formatJDInput(JD_MIN),
  formatJDInput(JD_MAX),
  formatJDInput(currentJD),
);

const scene = new SolarScene(sceneContainer, app, currentJD, {
  onPlanetClick: (key) => {
    focusedPlanet = key;
    updateInfoPanel();
  },
});

let playing = false;
let speedDaysPerSec = 10;
let focusedPlanet: PlanetKey | null = null;

// NEO close-approach lookup tables
const NEO_NAME = new Map(SMALL_BODIES.map((b) => [b.key, b.nameJa]));
const NEO_JD = NEO_APPROACHES.map((a) => ({
  ...a,
  jd: dateToJulian(new Date(a.dateIso)),
}));

// Real recorded fireballs, sorted by epoch for playback triggering
const FIREBALL_JD = FIREBALLS.map((f) => ({ ...f, jd: dateToJulian(new Date(f.dateIso)) })).sort(
  (a, b) => a.jd - b.jd,
);

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------
function clampJD(jd: number): number {
  return Math.min(JD_MAX, Math.max(JD_MIN, jd));
}

function setJD(jd: number, forceOrbit = false) {
  const prevJD = currentJD;
  currentJD = clampJD(jd);
  scene.updatePositions(currentJD, forceOrbit);
  hud.dateLabel.textContent = formatJDDate(currentJD);
  updateInfoPanel();
  updateLiveUniverse();
  // Fireball playback: when the clock sweeps past a recorded bolide epoch
  // (smooth playback only — a date jump doesn't dump the whole archive).
  if (currentJD > prevJD && currentJD - prevJD < 3) {
    for (const f of FIREBALL_JD) {
      if (f.jd > prevJD && f.jd <= currentJD) scene.spawnFireball(f.energyKt);
      if (f.jd > currentJD) break;
    }
  }
}

// ---------------------------------------------------------------------------
// Live universe: meteor showers + "いま、地球は" panel
// ---------------------------------------------------------------------------
let lastLiveDay = -1;
function updateLiveUniverse(force = false) {
  const day = Math.floor(currentJD);
  if (!force && day === lastLiveDay) return;
  lastLiveDay = day;

  const date = julianToDate(currentJD);
  const showers = activeShowersAt(date);

  // meteor visuals: spawn rate scaled from ZHR and proximity to the peak
  scene.setMeteorActivity(
    showers.map((a) => ({
      raDeg: a.shower.radiantRA,
      decDeg: a.shower.radiantDec,
      rate: (a.shower.zhr / 18) * a.intensity,
    })),
  );

  // ---- panel ----
  const earth = planetStateAtJD('earth', currentJD);
  const rSun = radius(earth.pos);
  const vKms = len(earth.vel) / KMS_TO_AU_PER_DAY;
  const lightSec = (rSun * AU_IN_KM) / 299792.458;
  const lm = Math.floor(lightSec / 60);
  const ls = Math.round(lightSec % 60);

  let nearest: { key: PlanetKey; d: number } | null = null;
  for (const k of ['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as PlanetKey[]) {
    const d = len(sub(planetStateAtJD(k, currentJD).pos, earth.pos));
    if (!nearest || d < nearest.d) nearest = { key: k, d };
  }

  // NEO close approaches: upcoming within 180 days (or just past, 5 days)
  const upcoming = NEO_JD.filter((a) => a.jd - currentJD > -5 && a.jd - currentJD < 180).sort(
    (a, b) => a.jd - b.jd,
  );
  // highlight lines in the scene while within ±30 days of closest approach
  scene.setNeoApproachActive(
    NEO_JD.filter((a) => Math.abs(a.jd - currentJD) < 30).map((a) => a.bodyKey),
  );
  const neoRows = upcoming
    .slice(0, 3)
    .map((a) => {
      const days = Math.round(a.jd - currentJD);
      const ld = a.distAU / AU_PER_LD;
      const pos = scene.smallBodyPosAU(a.bodyKey);
      const dNow = pos ? len(sub(pos, earth.pos)) : null;
      const when =
        days > 0 ? `あと${days}日で最接近` : days === 0 ? '今日最接近!' : `${-days}日前に通過`;
      return `<div class="now-neo">⚠ ${NEO_NAME.get(a.bodyKey) ?? a.bodyKey}が接近中（${when}）<br><span class="now-sub">最接近距離 ${ld.toFixed(1)} LD・相対速度 ${a.vRelKms.toFixed(1)} km/s${dNow !== null ? `・現在 ${dNow.toFixed(3)} AU` : ''}</span></div>`;
    })
    .join('');

  // most recent recorded fireball (within the last 90 days of sim time)
  let fireballRow = '';
  for (let i = FIREBALL_JD.length - 1; i >= 0; i--) {
    const f = FIREBALL_JD[i];
    if (f.jd <= currentJD) {
      const daysAgo = Math.floor(currentJD - f.jd);
      if (daysAgo <= 90) {
        const d = julianToDate(f.jd);
        fireballRow = `<div class="now-fireball">🔥 ${d.getUTCMonth() + 1}月${d.getUTCDate()}日、${fireballPlaceJa(f)}の上空で火球を観測<br><span class="now-sub">エネルギー TNT換算 ${f.energyKt} kt・${daysAgo === 0 ? '今日' : daysAgo + '日前'}（実際の観測記録）</span></div>`;
      }
      break;
    }
  }

  const showerRows = showers.length
    ? showers
        .map((a) => {
          const peakTxt =
            a.daysToPeak === 0
              ? '今夜が極大!'
              : a.daysToPeak > 0
                ? `極大まで${a.daysToPeak}日`
                : `極大から${-a.daysToPeak}日`;
          return `<div class="now-shower">☄ ${a.shower.nameJa}が活動中（ZHR ${a.shower.zhr}・${peakTxt}）<br><span class="now-sub">母天体: ${a.shower.parentJa}</span></div>`;
        })
        .join('')
    : '<div class="now-row"><span>活動中の主要流星群</span><span>なし</span></div>';

  hud.nowPanel.innerHTML = `
    <div class="now-row"><span>太陽まで</span><span>${rSun.toFixed(4)} AU（光で${lm}分${ls}秒）</span></div>
    <div class="now-row"><span>公転スピード</span><span>秒速 ${vKms.toFixed(2)} km</span></div>
    <div class="now-row"><span>一番近い惑星</span><span>${nearest ? PLANET_NAME_JA[nearest.key] : '—'} ${nearest ? nearest.d.toFixed(2) : ''} AU</span></div>
    ${neoRows}
    ${fireballRow}
    ${showerRows}
    <div class="now-sub">太陽系はいまも秒速約230kmで銀河系を移動中（1周 約2.3億年）</div>
  `;
}

// ---------------------------------------------------------------------------
// Info panels
// ---------------------------------------------------------------------------
function updateInfoPanel() {
  if (!focusedPlanet) {
    hud.infoPanel.innerHTML = '惑星をクリックすると情報を表示します。';
    return;
  }
  const key = focusedPlanet;
  const state = planetStateAtJD(key, currentJD);
  const el = planetElementsAtJD(key, currentJD);
  const r = radius(state.pos);
  const period = orbitalPeriodDays(el.a);
  const periodYears = period / 365.25;
  const lon = eclipticLongitudeDeg(state.pos);
  const info = PLANET_INFO[key];
  hud.infoPanel.innerHTML = `
    <div class="info-name">${PLANET_NAME_JA[key]}</div>
    <div class="info-desc">${info.descJa}</div>
    <div class="info-row"><span>直径</span><span>${info.diameterKm.toLocaleString()} km</span></div>
    <div class="info-row"><span>質量（地球=1）</span><span>${info.massEarths}</span></div>
    <div class="info-row"><span>自転周期</span><span>${info.rotationJa}</span></div>
    <div class="info-row"><span>衛星の数</span><span>${info.moons}</span></div>
    <div class="info-row"><span>表面温度</span><span>${info.tempJa}</span></div>
    <div class="info-divider"></div>
    <div class="info-row"><span>太陽からの距離</span><span>${r.toFixed(4)} AU</span></div>
    <div class="info-row"><span>公転周期</span><span>${periodYears.toFixed(2)} 年 (${period.toFixed(1)} 日)</span></div>
    <div class="info-row"><span>離心率</span><span>${el.e.toFixed(5)}</span></div>
    <div class="info-row"><span>軌道傾斜角</span><span>${(el.I * RAD2DEG).toFixed(3)}°</span></div>
    <div class="info-row"><span>日心黄経</span><span>${lon.toFixed(2)}°</span></div>
    <div class="info-fact">💡 ${info.funFactJa}</div>
  `;
}

// ---------------------------------------------------------------------------
// Time controls wiring
// ---------------------------------------------------------------------------
function setPlaying(on: boolean) {
  playing = on;
  hud.playBtn.textContent = playing ? '⏸ 一時停止' : '▶ 再生';
}

hud.playBtn.addEventListener('click', () => setPlaying(!playing));
window.addEventListener('keydown', (ev) => {
  if (ev.code !== 'Space') return;
  if (cosmosActive) return; // 大宇宙モード中に太陽系の再生状態を裏で変えない
  const t = ev.target as HTMLElement;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'BUTTON')) return;
  ev.preventDefault();
  setPlaying(!playing);
});

hud.todayBtn.addEventListener('click', () => {
  const t = clampJD(dateToJulian(new Date()));
  setJD(t, true);
  setDateInput(hud.dateInput, t);
});

// Live mode: sync to the real clock and advance at 1 s = 1 s.
let liveMode = false;
function setLiveMode(on: boolean) {
  liveMode = on;
  hud.liveBtn.classList.toggle('active', on);
  if (on) {
    const t = clampJD(dateToJulian(new Date()));
    setJD(t, true);
    setDateInput(hud.dateInput, t);
    speedDaysPerSec = 1 / 86400;
    hud.speedLabel.textContent = '速度: リアルタイム（1秒=1秒）';
    setPlaying(true);
  }
}
hud.liveBtn.addEventListener('click', () => setLiveMode(!liveMode));

// ---------------------------------------------------------------------------
// View modes (2D / 3D / 4D spacetime)
// ---------------------------------------------------------------------------
function setView(mode: ViewMode) {
  if (pilotMode && mode !== '3d') setPilotMode(false);
  scene.setViewMode(mode, currentJD);
  hud.view3dBtn.classList.toggle('active', mode === '3d');
  hud.view2dBtn.classList.toggle('active', mode === '2d');
  hud.view4dBtn.classList.toggle('active', mode === '4d');
  const st = mode === '4d';
  hud.galacticBtn.style.display = st ? 'block' : 'none';
  hud.stCaption.style.display = st ? 'block' : 'none';
  if (st) {
    focusedPlanet = null;
    scene.clearFocus();
    updateInfoPanel();
  }
}
hud.view3dBtn.addEventListener('click', () => setView('3d'));
hud.view2dBtn.addEventListener('click', () => setView('2d'));
hud.view4dBtn.addEventListener('click', () => setView('4d'));
hud.galacticBtn.addEventListener('click', () => {
  const g = !scene.galactic;
  scene.setGalactic(g, currentJD);
  hud.galacticBtn.textContent = `銀河モード: ${g ? 'ON' : 'OFF'}`;
});

hud.smallBodiesBtn.addEventListener('click', () => {
  const v = !scene.smallBodiesVisible;
  scene.setSmallBodiesVisible(v);
  hud.smallBodiesBtn.textContent = `彗星・小惑星: ${v ? '表示' : '非表示'}`;
});

// ---------------------------------------------------------------------------
// Pilot (spaceship) mode
// ---------------------------------------------------------------------------
let pilotMode = false;
function setPilotMode(on: boolean) {
  pilotMode = on;
  if (on) {
    setView('3d');
    scene.enterPilot();
    hud.pilotBtn.textContent = '🚀 操縦をやめる';
    hud.pilotPanel.style.display = 'block';
    hud.helpBox.classList.add('fade');
    if (!playing) setPlaying(true);
  } else {
    scene.exitPilot();
    hud.pilotBtn.textContent = '🚀 宇宙船モード';
    hud.pilotPanel.style.display = 'none';
  }
}
hud.pilotBtn.addEventListener('click', () => setPilotMode(!pilotMode));
hud.dateInput.addEventListener('change', () => {
  const parts = hud.dateInput.value.split('-').map(Number);
  if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
    const jd = dateToJulian(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
    setJD(jd, true);
  }
});
hud.speedSlider.addEventListener('input', () => {
  if (liveMode) setLiveMode(false);
  speedDaysPerSec = Number(hud.speedSlider.value);
  const abs = Math.abs(speedDaysPerSec);
  const dir = speedDaysPerSec < 0 ? '逆再生 ' : '';
  let text: string;
  if (abs >= 365) text = `${dir}${(abs / 365).toFixed(2)}年/秒`;
  else if (abs >= 30) text = `${dir}${(abs / 30).toFixed(1)}ヶ月/秒`;
  else text = `${dir}${abs}日/秒`;
  hud.speedLabel.textContent = `速度: ${text}`;
});

// ---------------------------------------------------------------------------
// Scale / size toggles
// ---------------------------------------------------------------------------
hud.scaleBtn.addEventListener('click', () => {
  const next = scene.scaleMode === 'compressed' ? 'real' : 'compressed';
  scene.setScaleMode(next);
  hud.scaleBtn.textContent = `スケール: ${next === 'compressed' ? '圧縮' : '実スケール'}`;
});

hud.sizeBtn.addEventListener('click', () => {
  const real = !scene.realSizes;
  scene.setRealSizes(real);
  hud.sizeBtn.textContent = `惑星サイズ: ${real ? '実寸比' : '誇張'}`;
});

hud.backToSunBtn.addEventListener('click', () => {
  focusedPlanet = null;
  scene.clearFocus();
  updateInfoPanel();
});

// ---------------------------------------------------------------------------
// Cosmos (大宇宙) mode — explore galaxies, nebulae and imagined realms.
// The cosmos scene + HUD are created lazily on first entry so the solar app
// pays nothing until the user leaves home.
// ---------------------------------------------------------------------------
let cosmosActive = false;
let cosmos: CosmosScene | null = null;
let cosmosHud: ReturnType<typeof buildCosmosHud> | null = null;
const cosmosVisited: CosmicBody[] = [];
const audio = new CosmosAudio();

const enterCosmosBtn = hud.enterCosmosBtn;

// ---- シネマ字幕 ----
// 没入モード（HUDが消えている間）だけ画面下部に現れる、プラネタリウムの
// 字幕。自動探索がどこを飛んでいるのか、無人運転でも伝わるようにする。
let cinemaTimer: number | null = null;
function showCinema(title: string, sub: string, tag = '', holdMs = 11_000) {
  if (!cosmosHud) return;
  cosmosHud.cinemaTitle.textContent = title;
  cosmosHud.cinemaSub.textContent = sub;
  cosmosHud.cinemaTag.textContent = tag;
  cosmosHud.cinemaEl.classList.add('show');
  if (cinemaTimer !== null) clearTimeout(cinemaTimer);
  cinemaTimer = holdMs > 0 ? window.setTimeout(() => hideCinema(), holdMs) : null;
}
function hideCinema() {
  if (cinemaTimer !== null) {
    clearTimeout(cinemaTimer);
    cinemaTimer = null;
  }
  cosmosHud?.cinemaEl.classList.remove('show');
}

function selectCosmosBody(body: CosmicBody) {
  if (!cosmos || !cosmosHud) return;
  cosmosHud.highlight(body.id);
  renderCosmosInfo(
    cosmosHud.infoPanel,
    body,
    () => warpToCosmosBody(body),
    () => setDiveMode(true),
  );
}

function warpToCosmosBody(body: CosmicBody, pullback = 1) {
  if (!cosmos || !cosmosHud) return;
  if (theaterOn) setTheaterMode(false);
  if (diveOn) setDiveMode(false);
  cosmosHud.statusEl.textContent = `${body.nameJa} へワープ中…`;
  showCinema(`${body.fictional ? '✦ ' : ''}${body.nameJa}`, 'ワープ中…', '', 0);
  audio.warp();
  cosmos.warpToBody(
    body,
    () => {
      if (!cosmos || !cosmosHud) return;
      cosmosHud.statusEl.textContent = `${body.nameJa} に到達`;
      const isNew = !cosmosVisited.some((v) => v.id === body.id);
      if (isNew) {
        cosmosVisited.push(body);
        renderCosmosLog(cosmosHud.logPanel, cosmosVisited);
      }
      const discovery = isNew && !!body.discoverable;
      showCinema(
        `${body.fictional ? '✦ ' : ''}${body.nameJa}`,
        `${KIND_JA[body.kind]}・${distanceLabel(body.distanceLy)}`,
        discovery ? `🔭 新発見！ ${body.tag}` : body.tag,
        12_000,
      );
      if (discovery) audio.discover();
      else audio.arrive();
    },
    pullback,
  );
}

function ensureCosmos() {
  if (cosmos) return;
  cosmos = new CosmosScene(sceneContainer, app, {
    onSelect: (body) => selectCosmosBody(body),
    onWarpRequest: (body) => {
      selectCosmosBody(body);
      warpToCosmosBody(body);
    },
    onReturnHome: () => exitCosmos(),
  });
  cosmosHud = buildCosmosHud(app, {
    onSelect: (body) => selectCosmosBody(body),
    onWarp: (body) => warpToCosmosBody(body),
    onReturnHome: () => exitCosmos(),
    onScan: () => scanUnknownGalaxy(),
    onTheater: () => setTheaterMode(!theaterOn),
    onDive: () => setDiveMode(!diveOn),
    onAutoToggle: () => setAutoTour(!autoTour),
    onSoundToggle: () => {
      if (!cosmosHud) return;
      const on = audio.toggle();
      cosmosHud.soundBtn.textContent = on ? '🔊 サウンド: ON' : '🔇 サウンド: OFF';
      cosmosHud.soundBtn.classList.toggle('active-theater', on);
    },
  });
  // パネルにカーソルを載せている間は、没入モードへフェードアウトしない
  cosmosHud.root.addEventListener('pointerover', () => (hudHover = true));
  cosmosHud.root.addEventListener('pointerout', () => (hudHover = false));
  // シアター操作パネルの配線
  cosmosHud.thPlayBtn.addEventListener('click', () => {
    if (!cosmos?.theater || !cosmosHud) return;
    cosmos.theater.playing = !cosmos.theater.playing;
    cosmosHud.thPlayBtn.textContent = cosmos.theater.playing ? '⏸ 一時停止' : '▶ 再生';
  });
  cosmosHud.thResetBtn.addEventListener('click', () => {
    if (!cosmos?.theater || !cosmosHud) return;
    cosmos.theater.reset();
    cosmosHud.thPlayBtn.textContent = '⏸ 一時停止';
  });
  cosmosHud.thSpeedSlider.addEventListener('input', () => {
    if (!cosmos?.theater || !cosmosHud) return;
    cosmos.theater.speed = Number(cosmosHud.thSpeedSlider.value);
  });
  cosmosHud.thCloseBtn.addEventListener('click', () => setTheaterMode(false));
  // ダイブ操作パネルの配線
  cosmosHud.dvPlayBtn.addEventListener('click', () => {
    if (!cosmos?.dive || !cosmosHud) return;
    if (cosmos.dive.finished) return;
    cosmos.dive.playing = !cosmos.dive.playing;
    cosmosHud.dvPlayBtn.textContent = cosmos.dive.playing ? '⏸ 一時停止' : '▶ 降下再開';
  });
  cosmosHud.dvSpeedSlider.addEventListener('input', () => {
    if (!cosmos?.dive || !cosmosHud) return;
    cosmos.dive.speed = Number(cosmosHud.dvSpeedSlider.value);
  });
  cosmosHud.dvExitBtn.addEventListener('click', () => setDiveMode(false));
  cosmosHud.dvRetryBtn.addEventListener('click', () => {
    if (!cosmos?.dive || !cosmosHud) return;
    cosmosHud.dvFade.classList.remove('on');
    cosmosHud.dvFinal.style.display = 'none';
    cosmosHud.dvPlayBtn.textContent = '⏸ 一時停止';
    diveStageShown = -2;
    diveFinalShown = false;
    cosmos.dive.reset();
  });
  cosmosHud.dvLeaveBtn.addEventListener('click', () => setDiveMode(false));
}

function scanUnknownGalaxy() {
  if (!cosmos || !cosmosHud) return;
  if (theaterOn) setTheaterMode(false);
  const discovered = new Set(cosmosVisited.map((v) => v.id));
  const body = cosmos.scanNearestUnknown(discovered);
  if (!body) return;
  cosmosHud.statusEl.textContent = `未知の銀河「${body.nameJa}」を捕捉。ワープします`;
  selectCosmosBody(body);
  warpToCosmosBody(body);
}

// ---- 銀河衝突シアター ----
let theaterOn = false;
function setTheaterMode(on: boolean) {
  if (!cosmos || !cosmosHud) return;
  if (on && diveOn) setDiveMode(false);
  theaterOn = on;
  cosmos.setTheater(on);
  cosmosHud.setTheaterMode(on);
  if (on) {
    cosmosHud.statusEl.textContent = '銀河衝突シアター 上演中';
    cosmosHud.thPlayBtn.textContent = '⏸ 一時停止';
    audio.boom();
  } else {
    cosmosHud.statusEl.textContent = '目的地を選んでワープしよう';
    hideCinema();
  }
}

// ---- ブラックホール・ダイブ ----
let diveOn = false;
let diveStageShown = -2; // 表示済みナレーション段階（-2 = 未初期化）
let diveFinalShown = false;
function setDiveMode(on: boolean) {
  if (!cosmos || !cosmosHud) return;
  if (on && theaterOn) setTheaterMode(false);
  diveOn = on;
  diveStageShown = -2;
  diveFinalShown = false;
  cosmos.setDive(on);
  cosmosHud.setDiveMode(on);
  if (on) {
    cosmosHud.statusEl.textContent = 'いて座A*へ降下中…';
    cosmosHud.dvPlayBtn.textContent = '⏸ 一時停止';
    cosmosHud.dvSpeedSlider.value = '1';
    audio.boom();
  } else {
    cosmosHud.statusEl.textContent = '目的地を選んでワープしよう';
    hideCinema();
  }
}

/** 秒数を「X分Y秒」に整形。 */
function fmtMinSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

// ---------------------------------------------------------------------------
// 自動探索ツアー（展示モード）
// 決まった演目を順に上演する: ワープ3回 → 銀河衝突シアター → ワープ3回 →
// ブラックホールダイブ → 全景、の繰り返し。ワープ先は未知の銀河と
// カタログの見どころを織り交ぜる。誰かが操作したら一時停止し、
// しばらく触られなければ再開。シアター/ダイブ/太陽系のまま放置された
// ときも自動で探索に復帰する。
// ---------------------------------------------------------------------------
const TOUR_INTERVAL_MS = 30_000;
/** 操作後、これだけ触られなければ自動探索を再開 */
const IDLE_RESUME_MS = 60_000;
/** シアター/ダイブ/太陽系のまま放置されたら宇宙探索へ戻すまでの時間 */
const IDLE_RESET_MS = 180_000;
/** 自動ワープの到着位置は少し引きにして、天体の全体像を見せる */
const TOUR_PULLBACK = 1.7;

const TOUR_PROGRAM = [
  'warp',
  'warp',
  'warp',
  'theater',
  'warp',
  'warp',
  'warp',
  'dive',
  'overview',
] as const;
type TourStep = (typeof TOUR_PROGRAM)[number];
const TOUR_STEP_LABEL: Record<TourStep, string> = {
  warp: '次のワープ',
  theater: '銀河衝突シアター開演',
  dive: 'ブラックホールダイブ開始',
  overview: '全景への帰還',
};
/** 銀河衝突シアターの自動上演時間 */
const AUTO_THEATER_MS = 45_000;
/** ダイブが進まなかったときの保険（通常は完走を検知して終わる） */
const AUTO_DIVE_MAX_MS = 200_000;
/** 地平線突入（暗転）後、宇宙へ戻るまでの余韻 */
const AUTO_DIVE_AFTER_FINISH_MS = 8_000;

let autoTour = true;
let tourStep = 0;
let tourNextAt = 0;
let tourPickFlip = false;
/** 自動上演中の演目。操作が入ったら 'none' に戻してその人に任せる */
let autoShow: 'none' | 'theater' | 'dive' = 'none';
let autoShowStartAt = 0;
let autoShowEndAt = 0;
// 起動直後から自動探索が動けるよう、過去の時刻で初期化
let lastInteraction = performance.now() - IDLE_RESUME_MS;

// ---- 没入モード ----
// 操作が途切れたら文字情報（チャート・解説・天体名ラベル）をすべて消して、
// 宇宙だけを見せる。マウスを動かせばすぐ戻る。
const HUD_HIDE_MS = 15_000;
let lastHudActivity = -1e9;
let hudHover = false;
let hudShown = false;
app.classList.add('cosmos-ambient');

function setHudShown(on: boolean) {
  if (hudShown === on) return;
  hudShown = on;
  app.classList.toggle('cosmos-ambient', !on);
}

for (const ev of ['pointerdown', 'wheel', 'keydown'] as const) {
  window.addEventListener(
    ev,
    () => {
      lastInteraction = performance.now();
      lastHudActivity = lastInteraction;
    },
    { passive: true },
  );
}
window.addEventListener('pointermove', () => (lastHudActivity = performance.now()), {
  passive: true,
});

// ESC でシアター/ダイブからすぐ抜けられる
window.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || !cosmosActive) return;
  if (theaterOn) setTheaterMode(false);
  if (diveOn) setDiveMode(false);
});

function setAutoTour(on: boolean) {
  autoTour = on;
  autoShow = 'none';
  if (cosmosHud) {
    cosmosHud.autoBtn.textContent = `🛰 自動探索: ${on ? 'ON' : 'OFF'}`;
    cosmosHud.autoBtn.classList.toggle('active-theater', on);
  }
  if (on) {
    // ONにした本人の操作で一時停止しないよう、すぐ動ける状態にする
    lastInteraction = performance.now() - IDLE_RESUME_MS;
    tourNextAt = performance.now() + 3000;
  }
}

/** ワープ先を選ぶ。未知の銀河とカタログの見どころを交互に。 */
function tourPickBody(): CosmicBody | null {
  if (!cosmos) return null;
  tourPickFlip = !tourPickFlip;
  const discovered = new Set(cosmosVisited.map((v) => v.id));
  if (tourPickFlip) {
    const fresh = COSMOS.filter((b) => b.region !== 'solar' && !discovered.has(b.id));
    const pool = fresh.length ? fresh : COSMOS.filter((b) => b.region !== 'solar');
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }
  return cosmos.scanNearestUnknown(discovered);
}

/** メインループから毎フレーム呼ぶ。時刻 now はperformance.now()。 */
function updateAutoTour(now: number) {
  if (!autoTour || !cosmosActive || !cosmos || !cosmosHud) return;

  // 自動上演中の進行管理
  if (autoShow !== 'none') {
    // 上演中に操作されたら、以降はその人に任せる（放置されれば探索へ復帰）
    if (lastInteraction > autoShowStartAt) {
      autoShow = 'none';
      return;
    }
    if (autoShow === 'dive' && cosmos.dive?.finished) {
      autoShowEndAt = Math.min(autoShowEndAt, now + AUTO_DIVE_AFTER_FINISH_MS);
    }
    if (now >= autoShowEndAt) {
      const show = autoShow;
      autoShow = 'none';
      if (show === 'theater') setTheaterMode(false);
      else setDiveMode(false);
      tourNextAt = now + 4000;
    }
    return;
  }

  // 手動で開いたシアター/ダイブ中は自動探索を止める
  if (theaterOn || diveOn) return;
  if (cosmos.isWarping()) return;
  // 誰かが操作中はスキップ（アイドル復帰の3秒後に再開）
  if (now - lastInteraction < IDLE_RESUME_MS) {
    tourNextAt = now + 3000;
    return;
  }
  if (now < tourNextAt) return;

  const step = TOUR_PROGRAM[tourStep % TOUR_PROGRAM.length];
  tourStep = (tourStep + 1) % TOUR_PROGRAM.length;

  switch (step) {
    case 'warp': {
      const body = tourPickBody();
      if (body) {
        selectCosmosBody(body);
        warpToCosmosBody(body, TOUR_PULLBACK);
      }
      tourNextAt = now + TOUR_INTERVAL_MS;
      break;
    }
    case 'theater':
      autoShow = 'theater';
      autoShowStartAt = now;
      autoShowEndAt = now + AUTO_THEATER_MS;
      setTheaterMode(true);
      break;
    case 'dive':
      autoShow = 'dive';
      autoShowStartAt = now;
      autoShowEndAt = now + AUTO_DIVE_MAX_MS;
      setDiveMode(true);
      break;
    case 'overview':
      cosmosHud.highlight(null);
      cosmosHud.statusEl.textContent = '一度、銀河の全景へ戻ります…';
      showCinema('天の川銀河', '全景へワープ中…', '', 0);
      audio.warp();
      cosmos.warpToOverview(() => {
        if (cosmosHud) cosmosHud.statusEl.textContent = '天の川銀河と、その先の宇宙';
        showCinema('天の川銀河と、その先の宇宙', '2000億の星々と、まだ見ぬ無数の銀河', '', 12_000);
      });
      tourNextAt = now + TOUR_INTERVAL_MS;
      break;
  }
}

function enterCosmos(wideIntro = false) {
  ensureCosmos();
  if (!cosmos || !cosmosHud) return;
  cosmosActive = true;
  // Hide the solar app (canvas + labels + HUD) but keep it alive.
  scene.renderer.domElement.style.display = 'none';
  scene.labelRenderer.domElement.style.display = 'none';
  hud.root.style.display = 'none';
  enterCosmosBtn.style.display = 'none';
  cosmos.setActive(true);
  cosmosHud.setActive(true);
  // 没入モード（起動時・放置復帰）は引きの全景から、手動入場は太陽へ寄る演出から
  if (wideIntro) {
    cosmos.introOverview();
    showCinema(
      '大宇宙エクスプローラー',
      'Fable 5 が想像した宇宙をめぐる旅',
      'まもなく自動探索がはじまります',
      14_000,
    );
  } else cosmos.introFlyTo('sol');
  // 自動探索: 導入演出が落ち着いてから最初の演目へ
  tourStep = 0;
  autoShow = 'none';
  tourNextAt = performance.now() + 12_000;
}

function exitCosmos() {
  if (!cosmos || !cosmosHud) return;
  if (theaterOn) setTheaterMode(false);
  if (diveOn) setDiveMode(false);
  autoShow = 'none';
  hideCinema();
  cosmos.setDrift(false);
  setHudShown(true);
  cosmosActive = false;
  cosmos.setActive(false);
  cosmosHud.setActive(false);
  scene.renderer.domElement.style.display = 'block';
  scene.labelRenderer.domElement.style.display = 'block';
  hud.root.style.display = 'block';
  enterCosmosBtn.style.display = 'block';
  scene.onResizePublic();
}

enterCosmosBtn.addEventListener('click', () => enterCosmos());

// ---------------------------------------------------------------------------
// Help box: fade out after a while.
// ---------------------------------------------------------------------------
setTimeout(() => {
  hud.helpBox.classList.add('fade');
}, 9000);

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let lastT = performance.now();
let lastPilotHud = 0;
let lastCosmosNav = 0;
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - lastT) / 1000;
  lastT = now;

  // 展示モードの見張り: 放置されたら大宇宙探索へ戻す
  // （自動上演中のシアター/ダイブは対象外——専用の進行管理で終わる）
  if (autoTour && now - lastInteraction > IDLE_RESET_MS) {
    if (!cosmosActive) {
      enterCosmos(true);
    } else if ((theaterOn || diveOn) && autoShow === 'none') {
      setTheaterMode(false);
      setDiveMode(false);
      tourNextAt = now + 3000;
    }
  }

  // Cosmos mode has its own scene; the solar system is paused (kept alive).
  if (cosmosActive && cosmos) {
    // 没入モード: 操作が途切れたら文字を消し、マウスが動けば戻す
    setHudShown(hudHover || now - lastHudActivity < HUD_HIDE_MS);
    // 没入中はカメラがゆっくり周回して、放置中も画が生きる
    cosmos.setDrift(!hudShown);
    cosmos.render(Math.min(dt, 0.05));
    updateAutoTour(now);
    if (cosmosHud && now - lastCosmosNav > 200) {
      lastCosmosNav = now;
      if (diveOn && cosmos.dive) {
        const d = cosmos.dive;
        // ナレーション段階が進んだらカードを更新
        const idx = d.stageIndex();
        if (idx !== diveStageShown && idx >= 0) {
          diveStageShown = idx;
          cosmosHud.dvStageTitle.textContent = DIVE_STAGES[idx].title;
          cosmosHud.dvStageText.textContent = DIVE_STAGES[idx].text;
        }
        // ライブ計器
        const g = d.gamma();
        const tidal = d.tidalG();
        const tidalTxt =
          tidal < 0.0001 ? '感じない' : tidal < 0.01 ? `${tidal.toFixed(4)} G` : `${tidal.toFixed(2)} G`;
        cosmosHud.dvReadout.innerHTML = `
          <div class="info-row"><span>地平線までの距離</span><span>${d.xRs < 2 ? d.xRs.toFixed(3) : d.xRs.toFixed(1)} rs</span></div>
          <div class="info-row"><span>時間の遅れ</span><span>あなたの1秒 = 地球の ${g.toFixed(3)} 秒</span></div>
          <div class="info-row"><span>潮汐力（頭と足の差）</span><span>${tidalTxt}</span></div>
          <div class="info-row"><span>経過時間</span><span>あなた ${fmtMinSec(d.yourSec)} / 地球 ${fmtMinSec(d.earthSec)}</span></div>`;
        // 没入モードの字幕にもナレーションと計器を流す（無人運転でも伝わる）
        if (idx >= 0 && !d.finished) {
          showCinema(
            DIVE_STAGES[idx].title,
            `地平線まで ${d.xRs < 2 ? d.xRs.toFixed(2) : d.xRs.toFixed(0)} rs ・ あなたの1秒 = 地球の ${g.toFixed(2)} 秒`,
            '',
            0,
          );
        }
        // 地平線突入 → 暗転して最終カード
        if (d.finished && !diveFinalShown) {
          diveFinalShown = true;
          cosmosHud.dvFade.classList.add('on');
          const title = cosmosHud.dvFinal.querySelector('.dv-final-title');
          const text = cosmosHud.dvFinal.querySelector('.dv-final-text');
          if (title) title.textContent = DIVE_FINAL.title;
          if (text) text.textContent = DIVE_FINAL.text;
          setTimeout(() => {
            if (diveOn && cosmosHud) cosmosHud.dvFinal.style.display = 'block';
          }, 2200);
        }
      } else if (theaterOn && cosmos.theater) {
        // 億年カウンター＋銀河核の距離
        const oku = cosmos.theater.okuYears();
        cosmosHud.thTimeEl.textContent = `いまから 約${oku.toFixed(1)} 億年後`;
        const sep = cosmos.theater.coreSeparation();
        cosmosHud.thSepEl.textContent = cosmos.theater.merged
          ? '🌌 ふたつの銀河核が合体 — 新しい銀河「ミルコメダ」の誕生'
          : `銀河核の距離: ${(sep * 0.55).toFixed(0)} 万光年`;
        // 没入モードの字幕にも億年カウンターを流す
        showCinema(
          `いまから 約${oku.toFixed(1)} 億年後`,
          cosmos.theater.merged
            ? 'ふたつの銀河核が合体 — 新しい銀河「ミルコメダ」の誕生'
            : `銀河核の距離 ${(sep * 0.55).toFixed(0)} 万光年`,
          '天の川銀河 × アンドロメダ銀河 — 重力シミュレーションによる上演',
          0,
        );
      } else {
        const near = cosmos.cameraNearestInfo();
        if (near) {
          const label =
            near.dist < Math.max(near.body.scale * 1.6, 12)
              ? `${near.body.nameJa} の圏内`
              : `最寄り: ${near.body.nameJa}`;
          let tourTxt = '';
          if (autoTour) {
            if (now - lastInteraction < IDLE_RESUME_MS) {
              tourTxt = '　|　🛰 一時停止中（操作を検知）';
            } else if (cosmos.isWarping()) {
              tourTxt = '　|　🛰 ワープ中';
            } else {
              const secs = Math.max(0, Math.ceil((tourNextAt - now) / 1000));
              const next = TOUR_PROGRAM[tourStep % TOUR_PROGRAM.length];
              tourTxt = `　|　🛰 ${TOUR_STEP_LABEL[next]}まで ${secs}秒`;
            }
          }
          cosmosHud.navEl.textContent = `📍 ${label}　|　発見数 ${cosmosVisited.length} 天体${tourTxt}`;
        }
      }
    }
    return;
  }

  if (pilotMode && now - lastPilotHud > 150) {
    lastPilotHud = now;
    const t = scene.pilotTelemetry();
    const arrived = t.nearestAU < 0.03;
    hud.pilotPanel.innerHTML = `
      <div class="pilot-row"><span>最寄り: ${t.nearestJa}</span><span>${t.nearestAU.toFixed(3)} AU${arrived ? '（' + t.nearestJa + '圏内!）' : ''}</span></div>
      <div class="pilot-row"><span>太陽から</span><span>${t.rSunAU.toFixed(2)} AU</span></div>
      <div class="pilot-keys">W 加速 / S 減速 / A・D 旋回 / ↑・↓ 上下 / Shift ブースト<br>近くの天体ほどゆっくり、深宇宙では超高速で巡航します</div>
    `;
  }

  if (playing) {
    let jd = currentJD + speedDaysPerSec * dt;
    if (jd >= JD_MAX || jd <= JD_MIN) {
      jd = clampJD(jd);
      setPlaying(false);
    }
    setJD(jd);
    if (Math.floor(currentJD) % 5 === 0) setDateInput(hud.dateInput, currentJD);
  }
  scene.render(dt);
}

// initialise labels + first frame
setJD(currentJD, true);
hud.dateLabel.textContent = formatJDDate(currentJD);
animate();

// 起動直後から大宇宙エクスプローラーを表示（展示モードのデフォルト）。
// 文字情報のない没入モードで、引きの全景からはじまる。
// マウスを動かせば操作パネルが現れ、「☀ 太陽系へ帰還」でいつでも戻れる。
enterCosmos(true);
