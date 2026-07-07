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
import {
  computeSwingby,
  computeFromState,
  sampleTrajectoryAtJD,
  sampleStateAtJD,
  type SwingbyResult,
} from './sim/swingby';
import { len, sub } from './sim/vec';
import {
  computePorkchop,
  solveTransfer,
  PORKCHOP_TARGETS,
  type PorkchopGrid,
  type TransferSolution,
} from './sim/porkchop';
import { drawPorkchop, pixelToCell } from './ui/porkchopPanel';
import { NEO_APPROACHES, SMALL_BODIES, AU_PER_LD } from './data/smallBodies';
import { FIREBALLS, fireballPlaceJa } from './data/fireballs';
import { PLANET_INFO } from './data/planetInfo';
import { buildHud, renderRecords, setDateInput } from './ui/hud';
import { formatJDDate, formatJDInput, formatJDSlash } from './ui/format';

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
type Mode = 'normal' | 'design';
type DesignTab = 'manual' | 'porkchop';

const app = document.querySelector<HTMLDivElement>('#app')!;
const sceneContainer = document.createElement('div');
sceneContainer.className = 'scene-container';
app.appendChild(sceneContainer);

// 起動時は今日（ライブ）の日付から始める。
let currentJD = clampJD(dateToJulian(new Date()));

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
let mode: Mode = 'normal';
let designTab: DesignTab = 'manual';
let focusedPlanet: PlanetKey | null = null;

// Flight state
let committed: SwingbyResult | null = null;
let committedStartJD = 0;
let bestRecords: Partial<Record<PlanetKey, number>> = {};

// Porkchop state
let pcGrid: PorkchopGrid | null = null;
let pcSelected: { iLaunch: number; iTof: number } | null = null;
let pcHover: { iLaunch: number; iTof: number } | null = null;
let pendingTransfer: { sol: TransferSolution; result: SwingbyResult } | null = null;

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
  // move committed spacecraft along its path
  if (committed) {
    const p = sampleTrajectoryAtJD(committed.raw, currentJD);
    if (p && currentJD >= committedStartJD) {
      scene.setCraftPosition(p);
    }
    updateCraftTelemetry();
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

/** Live spacecraft telemetry (speed, distances, light-time). */
function updateCraftTelemetry() {
  if (!committed || currentJD < committedStartJD) {
    hud.craftPanel.style.display = 'none';
    return;
  }
  const st = sampleStateAtJD(committed.raw, currentJD);
  if (!st) return;
  const speed = len(st.vel) / KMS_TO_AU_PER_DAY;
  const rSun = len(st.pos);
  const earth = planetStateAtJD('earth', currentJD);
  const dEarth = len(sub(st.pos, earth.pos));
  const lightMin = (dEarth * AU_IN_KM) / 299792.458 / 60;
  hud.craftPanel.style.display = 'block';
  hud.craftPanel.innerHTML = `
    <div class="panel-title">探査機テレメトリ</div>
    <div class="info-row"><span>日心速度</span><span>${speed.toFixed(2)} km/s</span></div>
    <div class="info-row"><span>太陽からの距離</span><span>${rSun.toFixed(3)} AU</span></div>
    <div class="info-row"><span>地球からの距離</span><span>${dEarth.toFixed(3)} AU</span></div>
    <div class="info-row"><span>通信遅延（片道）</span><span>${lightMin.toFixed(1)} 分</span></div>
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
    if (mode === 'design' && designTab === 'manual') scheduleSwingbyPreview();
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
// Mode / scale / size toggles
// ---------------------------------------------------------------------------
hud.modeBtn.addEventListener('click', () => {
  mode = mode === 'normal' ? 'design' : 'normal';
  if (mode === 'design' && pilotMode) setPilotMode(false);
  if (mode === 'design') {
    hud.modeBtn.textContent = '通常モードへ切替';
    hud.swingbyPanel.style.display = 'block';
    if (designTab === 'manual') scheduleSwingbyPreview();
    else ensurePorkchop();
  } else {
    hud.modeBtn.textContent = '設計モードへ切替';
    hud.swingbyPanel.style.display = 'none';
    scene.hideTrajectoryPreview();
    scene.clearFlybyMarkers();
    scene.setArrivalMarker(null);
  }
});

hud.scaleBtn.addEventListener('click', () => {
  const next = scene.scaleMode === 'compressed' ? 'real' : 'compressed';
  scene.setScaleMode(next);
  hud.scaleBtn.textContent = `スケール: ${next === 'compressed' ? '圧縮' : '実スケール'}`;
  if (committed) rebuildCommittedTrail();
  if (mode === 'design') {
    if (designTab === 'manual') scheduleSwingbyPreview();
    else refreshTransferVisuals();
  }
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
// Design tabs
// ---------------------------------------------------------------------------
function setDesignTab(tab: DesignTab) {
  designTab = tab;
  hud.tabManualBtn.classList.toggle('active', tab === 'manual');
  hud.tabPorkchopBtn.classList.toggle('active', tab === 'porkchop');
  hud.manualPane.style.display = tab === 'manual' ? 'block' : 'none';
  hud.porkchopPane.style.display = tab === 'porkchop' ? 'block' : 'none';
  scene.setArrivalMarker(null);
  if (tab === 'manual') {
    hud.flybyList.innerHTML = 'スライダーを動かすと予測軌道が更新されます。';
    scheduleSwingbyPreview();
  } else {
    hud.flybyList.innerHTML =
      'ヒートマップの谷（青い領域）が低コストの打ち上げウィンドウです。';
    scene.hideTrajectoryPreview();
    scene.clearFlybyMarkers();
    ensurePorkchop();
  }
}
hud.tabManualBtn.addEventListener('click', () => setDesignTab('manual'));
hud.tabPorkchopBtn.addEventListener('click', () => setDesignTab('porkchop'));

// ---------------------------------------------------------------------------
// Manual swingby design preview (debounced)
// ---------------------------------------------------------------------------
let previewTimer: number | null = null;
function scheduleSwingbyPreview() {
  if (previewTimer !== null) clearTimeout(previewTimer);
  previewTimer = window.setTimeout(runSwingbyPreview, 60);
}

function currentSwingbyParams() {
  return {
    startJD: currentJD,
    vInf: Number(hud.vInfSlider.value),
    inPlaneDeg: Number(hud.inPlaneSlider.value),
    outPlaneDeg: Number(hud.outPlaneSlider.value),
    years: 15,
  };
}

function renderFlybyList(result: SwingbyResult, header = '') {
  const rows = result.flybys.map((f) => {
    const sign = f.deltaV >= 0 ? '+' : '';
    return `<div class="flyby-row">${PLANET_NAME_JA[f.planet]}スイングバイ ${formatJDSlash(
      f.jd,
    )}<br>通過距離 ${f.distance.toFixed(4)} AU / Δv ${sign}${f.deltaV.toFixed(
      3,
    )} km/s (日心速度)</div>`;
  });
  const body =
    rows.length > 0
      ? rows.join('')
      : '（0.05 AU以内のフライバイは検出されていません）';
  hud.flybyList.innerHTML = header + body;
}

function runSwingbyPreview() {
  if (mode !== 'design' || designTab !== 'manual') return;
  const params = currentSwingbyParams();
  const result = computeSwingby(params);
  scene.setTrajectoryPreview(result.positions);

  const markerPositions = result.flybys.map((f) => {
    const p = sampleTrajectoryAtJD(result.raw, f.jd);
    return p ?? { x: 0, y: 0, z: 0 };
  });
  scene.setFlybyMarkers(markerPositions);
  renderFlybyList(result);
  renderRecords(hud.recordsPanel, mergeRecords(bestRecords, result.minApproach));
}

hud.vInfSlider.addEventListener('input', () => {
  hud.vInfLabel.textContent = `出発余剰速度 v∞: ${Number(hud.vInfSlider.value).toFixed(1)} km/s`;
  scheduleSwingbyPreview();
});
hud.inPlaneSlider.addEventListener('input', () => {
  hud.inPlaneLabel.textContent = `面内角度: ${hud.inPlaneSlider.value}°`;
  scheduleSwingbyPreview();
});
hud.outPlaneSlider.addEventListener('input', () => {
  hud.outPlaneLabel.textContent = `面外角度: ${hud.outPlaneSlider.value}°`;
  scheduleSwingbyPreview();
});

function mergeRecords(
  a: Partial<Record<PlanetKey, number>>,
  b: Partial<Record<PlanetKey, number>>,
): Partial<Record<PlanetKey, number>> {
  const out: Partial<Record<PlanetKey, number>> = { ...a };
  for (const k of Object.keys(b) as PlanetKey[]) {
    const v = b[k]!;
    if (out[k] === undefined || v < out[k]!) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Porkchop plot
// ---------------------------------------------------------------------------
function ensurePorkchop() {
  const target = hud.pcTargetSelect.value as PlanetKey;
  // Recompute when missing, target changed, or window start drifted > 30 days.
  if (
    pcGrid &&
    pcGrid.config.target === target &&
    Math.abs(pcGrid.config.launchStartJD - currentJD) < 30
  ) {
    redrawPorkchop();
    return;
  }
  const cfgBase = PORKCHOP_TARGETS[target];
  if (!cfgBase) return;
  hud.pcStatus.textContent = '計算中…';
  pcSelected = null;
  pendingTransfer = null;
  hud.pcLaunchBtn.disabled = true;
  // Let the status text paint before the synchronous sweep.
  setTimeout(() => {
    const launchStartJD = currentJD;
    const span = Math.max(120, Math.min(cfgBase.span, JD_MAX - launchStartJD));
    pcGrid = computePorkchop({
      target,
      launchStartJD,
      launchSpanDays: span,
      nLaunch: 90,
      tofMinDays: cfgBase.tofMin,
      tofMaxDays: cfgBase.tofMax,
      nTof: 70,
    });
    if (pcGrid.best) {
      hud.pcStatus.textContent = `最良: v∞ ${pcGrid.best.vinfDep.toFixed(2)} km/s（○印）`;
    } else {
      hud.pcStatus.textContent = 'この窓では解が見つかりません';
    }
    redrawPorkchop();
  }, 15);
}

function redrawPorkchop() {
  if (!pcGrid) return;
  drawPorkchop(hud.pcCanvas, pcGrid, { selected: pcSelected, hover: pcHover });
}

hud.pcTargetSelect.addEventListener('change', () => {
  pcGrid = null;
  ensurePorkchop();
});

hud.pcCanvas.addEventListener('mousemove', (ev) => {
  if (!pcGrid) return;
  const rect = hud.pcCanvas.getBoundingClientRect();
  const px = ((ev.clientX - rect.left) / rect.width) * hud.pcCanvas.width;
  const py = ((ev.clientY - rect.top) / rect.height) * hud.pcCanvas.height;
  const cell = pixelToCell(hud.pcCanvas, pcGrid, px, py);
  pcHover = cell ? { iLaunch: cell.iLaunch, iTof: cell.iTof } : null;
  redrawPorkchop();
  if (cell) {
    const idx = cell.iTof * pcGrid.config.nLaunch + cell.iLaunch;
    const dep = pcGrid.vinfDep[idx];
    const arr = pcGrid.vinfArr[idx];
    if (!Number.isNaN(dep)) {
      hud.pcReadout.textContent = `出発 ${formatJDSlash(cell.launchJD)} / 飛行 ${Math.round(
        cell.tofDays,
      )}日 → 出発v∞ ${dep.toFixed(2)} km/s・到着v∞ ${arr.toFixed(2)} km/s（クリックでプレビュー）`;
    }
  }
});
hud.pcCanvas.addEventListener('mouseleave', () => {
  pcHover = null;
  redrawPorkchop();
});

hud.pcCanvas.addEventListener('click', (ev) => {
  if (!pcGrid) return;
  const rect = hud.pcCanvas.getBoundingClientRect();
  const px = ((ev.clientX - rect.left) / rect.width) * hud.pcCanvas.width;
  const py = ((ev.clientY - rect.top) / rect.height) * hud.pcCanvas.height;
  const cell = pixelToCell(hud.pcCanvas, pcGrid, px, py);
  if (!cell) return;
  const target = pcGrid.config.target;
  const sol = solveTransfer(target, cell.launchJD, cell.tofDays);
  if (!sol) {
    hud.pcReadout.textContent = 'この組み合わせでは転送軌道が解けません。';
    return;
  }
  pcSelected = { iLaunch: cell.iLaunch, iTof: cell.iTof };
  // Propagate under full N-body gravity: transfer + a few years beyond arrival.
  const years = Math.min(15, cell.tofDays / 365.25 + 4);
  const result = computeFromState(sol.launchJD, sol.initial, years);
  pendingTransfer = { sol, result };
  hud.pcLaunchBtn.disabled = false;

  // Jump the clock to the departure epoch so the geometry matches the preview.
  setJD(sol.launchJD, true);
  setDateInput(hud.dateInput, sol.launchJD);
  refreshTransferVisuals();

  const header = `<div class="flyby-row transfer-summary">${PLANET_NAME_JA[target]}転送: 出発 ${formatJDSlash(
    sol.launchJD,
  )} → 到着 ${formatJDSlash(sol.arrivalJD)}（${Math.round(sol.tofDays)}日）<br>出発v∞ ${sol.vinfDep.toFixed(
    2,
  )} km/s / C3 ${sol.c3.toFixed(1)} km²/s² / 到着v∞ ${sol.vinfArr.toFixed(2)} km/s</div>`;
  renderFlybyList(result, header);
  redrawPorkchop();
});

/** Re-apply preview visuals (after scale change or new selection). */
function refreshTransferVisuals() {
  if (!pendingTransfer) return;
  scene.setTrajectoryPreview(pendingTransfer.result.positions);
  const markerPositions = pendingTransfer.result.flybys.map((f) => {
    const p = sampleTrajectoryAtJD(pendingTransfer!.result.raw, f.jd);
    return p ?? { x: 0, y: 0, z: 0 };
  });
  scene.setFlybyMarkers(markerPositions);
  scene.setArrivalMarker(pendingTransfer.sol.arrivalPos);
}

// ---------------------------------------------------------------------------
// Launch (commit) — shared plumbing
// ---------------------------------------------------------------------------
function commitFlight(result: SwingbyResult, startJD: number) {
  committed = result;
  committedStartJD = startJD;
  bestRecords = mergeRecords(bestRecords, committed.minApproach);
  renderRecords(hud.recordsPanel, bestRecords);
  scene.resetCraftTrail();
  scene.showCraft(true);
  const p = sampleTrajectoryAtJD(committed.raw, currentJD);
  if (p) scene.setCraftPosition(p);
  updateCraftTelemetry();
  // Start playing forward so the flight animates.
  setPlaying(true);
  if (speedDaysPerSec <= 0) {
    speedDaysPerSec = 10;
    hud.speedSlider.value = '10';
    hud.speedLabel.textContent = '速度: 10日/秒';
  }
}

hud.launchBtn.addEventListener('click', () => {
  const params = currentSwingbyParams();
  commitFlight(computeSwingby(params), params.startJD);
});

hud.pcLaunchBtn.addEventListener('click', () => {
  if (!pendingTransfer) return;
  setJD(pendingTransfer.sol.launchJD, true);
  setDateInput(hud.dateInput, pendingTransfer.sol.launchJD);
  commitFlight(pendingTransfer.result, pendingTransfer.sol.launchJD);
});

function rebuildCommittedTrail() {
  if (!committed) return;
  scene.resetCraftTrail();
  // Re-plot trail up to current time under the new scale.
  for (const s of committed.raw.samples) {
    if (s.jd > currentJD) break;
    scene.setCraftPosition(s.pos);
  }
}

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
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - lastT) / 1000;
  lastT = now;

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
// URLを開いたら今日の日付から自動で再生を開始する。
setPlaying(true);
animate();
