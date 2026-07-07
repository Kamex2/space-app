import { PLANET_NAME_JA, PLANET_ORDER, type PlanetKey } from '../data/planetElements';
import { formatJDInput } from './format';

/** Small helper to create an element with class + text. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface HudElements {
  root: HTMLElement;
  // top: date + time controls
  dateLabel: HTMLElement;
  dateInput: HTMLInputElement;
  playBtn: HTMLButtonElement;
  todayBtn: HTMLButtonElement;
  liveBtn: HTMLButtonElement;
  speedSlider: HTMLInputElement;
  speedLabel: HTMLElement;
  // right: mode / scale / info
  modeBtn: HTMLButtonElement;
  scaleBtn: HTMLButtonElement;
  sizeBtn: HTMLButtonElement;
  smallBodiesBtn: HTMLButtonElement;
  backToSunBtn: HTMLButtonElement;
  view3dBtn: HTMLButtonElement;
  view2dBtn: HTMLButtonElement;
  view4dBtn: HTMLButtonElement;
  galacticBtn: HTMLButtonElement;
  stCaption: HTMLElement;
  infoPanel: HTMLElement;
  // left: live "now" panel
  nowPanel: HTMLElement;
  // bottom: design panel with tabs
  swingbyPanel: HTMLElement;
  tabManualBtn: HTMLButtonElement;
  tabPorkchopBtn: HTMLButtonElement;
  manualPane: HTMLElement;
  porkchopPane: HTMLElement;
  vInfSlider: HTMLInputElement;
  vInfLabel: HTMLElement;
  inPlaneSlider: HTMLInputElement;
  inPlaneLabel: HTMLElement;
  outPlaneSlider: HTMLInputElement;
  outPlaneLabel: HTMLElement;
  launchBtn: HTMLButtonElement;
  // porkchop
  pcTargetSelect: HTMLSelectElement;
  pcStatus: HTMLElement;
  pcCanvas: HTMLCanvasElement;
  pcReadout: HTMLElement;
  pcLaunchBtn: HTMLButtonElement;
  // shared flyby readout
  flybyList: HTMLElement;
  // right column extras
  recordsPanel: HTMLElement;
  craftPanel: HTMLElement;
  // pilot mode
  pilotBtn: HTMLButtonElement;
  pilotPanel: HTMLElement;
  helpBox: HTMLElement;
}

/** Build the entire HUD and return references to the interactive parts. */
export function buildHud(
  container: HTMLElement,
  jdMinInput: string,
  jdMaxInput: string,
  initialDateInput: string,
): HudElements {
  const root = el('div', 'hud');
  container.appendChild(root);

  // ---- Top bar: date + time controls -------------------------------------
  const top = el('div', 'hud-panel hud-top');
  const dateLabel = el('div', 'date-label', '----年--月--日');
  const timeRow = el('div', 'row');

  const dateInput = el('input') as HTMLInputElement;
  dateInput.type = 'date';
  dateInput.min = jdMinInput;
  dateInput.max = jdMaxInput;
  dateInput.value = initialDateInput;

  const playBtn = el('button', 'btn', '▶ 再生') as HTMLButtonElement;
  const todayBtn = el('button', 'btn', '今日') as HTMLButtonElement;
  const liveBtn = el('button', 'btn live', 'ライブ') as HTMLButtonElement;
  liveBtn.title = '現在時刻に同期して1秒=1秒で進めます';

  const speedRow = el('div', 'row');
  const speedLabel = el('div', 'speed-label', '速度: 10日/秒');
  const speedSlider = el('input') as HTMLInputElement;
  speedSlider.type = 'range';
  speedSlider.min = '-365';
  speedSlider.max = '365';
  speedSlider.step = '1';
  speedSlider.value = '10';

  timeRow.append(dateInput, playBtn, todayBtn, liveBtn);
  speedRow.append(speedLabel, speedSlider);
  top.append(dateLabel, timeRow, speedRow);
  root.appendChild(top);

  // ---- Right panel: view / mode / scale / info ----------------------------
  const right = el('div', 'hud-panel hud-right');

  const viewRow = el('div', 'tab-row');
  const view2dBtn = el('button', 'tab', '2D') as HTMLButtonElement;
  const view3dBtn = el('button', 'tab active', '3D') as HTMLButtonElement;
  const view4dBtn = el('button', 'tab', '4D時空') as HTMLButtonElement;
  viewRow.append(view2dBtn, view3dBtn, view4dBtn);

  const galacticBtn = el('button', 'btn wide', '銀河モード: OFF') as HTMLButtonElement;
  galacticBtn.style.display = 'none';
  const stCaption = el(
    'div',
    'st-caption',
    '縦軸=時間（±3年）。惑星の軌道は時空の螺旋になります。銀河モードでは銀河系内を移動する太陽系の軌跡を表示（速度は1/6に縮小表示）。',
  );
  stCaption.style.display = 'none';

  const modeBtn = el('button', 'btn wide', '設計モードへ切替') as HTMLButtonElement;
  const pilotBtn = el('button', 'btn wide launch', '🚀 宇宙船モード') as HTMLButtonElement;
  const scaleBtn = el('button', 'btn wide', 'スケール: 圧縮') as HTMLButtonElement;
  const sizeBtn = el('button', 'btn wide', '惑星サイズ: 誇張') as HTMLButtonElement;
  const smallBodiesBtn = el('button', 'btn wide', '彗星・小惑星: 表示') as HTMLButtonElement;
  const backToSunBtn = el('button', 'btn wide', '太陽に戻る') as HTMLButtonElement;

  const infoTitle = el('div', 'panel-title', '惑星情報');
  const infoPanel = el('div', 'info-panel', '惑星をクリックすると情報を表示します。');

  right.append(
    viewRow,
    galacticBtn,
    stCaption,
    modeBtn,
    pilotBtn,
    scaleBtn,
    sizeBtn,
    smallBodiesBtn,
    backToSunBtn,
    infoTitle,
    infoPanel,
  );
  root.appendChild(right);

  // ---- Pilot HUD (bottom centre, only in pilot mode) -----------------------
  const pilotPanel = el('div', 'hud-panel hud-pilot');
  pilotPanel.style.display = 'none';
  root.appendChild(pilotPanel);

  // ---- Records + craft telemetry ------------------------------------------
  const recordsWrap = el('div', 'hud-panel hud-records');
  recordsWrap.append(el('div', 'panel-title', '最接近距離の記録'));
  const recordsPanel = el('div', 'records-panel', '（設計モードで探査機を飛ばすと記録されます）');
  recordsWrap.append(recordsPanel);
  const craftPanel = el('div', 'craft-panel');
  craftPanel.style.display = 'none';
  recordsWrap.append(craftPanel);
  root.appendChild(recordsWrap);

  // ---- Live "now" panel ----------------------------------------------------
  const nowWrap = el('div', 'hud-panel hud-now');
  nowWrap.append(el('div', 'panel-title', 'いま、地球は'));
  const nowPanel = el('div', 'now-panel');
  nowWrap.append(nowPanel);
  root.appendChild(nowWrap);

  // ---- Bottom panel: design (tabs: manual / porkchop) ---------------------
  const bottom = el('div', 'hud-panel hud-bottom');
  bottom.append(el('div', 'panel-title', '軌道設計（地球出発）'));

  const tabRow = el('div', 'tab-row');
  const tabManualBtn = el('button', 'tab active', '手動設計') as HTMLButtonElement;
  const tabPorkchopBtn = el('button', 'tab', 'ポークチョップ') as HTMLButtonElement;
  tabRow.append(tabManualBtn, tabPorkchopBtn);
  bottom.append(tabRow);

  // -- manual pane
  const manualPane = el('div', 'pane');
  const mkSlider = (
    labelText: string,
    min: number,
    max: number,
    step: number,
    value: number,
  ) => {
    const wrap = el('div', 'slider-wrap');
    const lab = el('div', 'slider-label', labelText);
    const s = el('input') as HTMLInputElement;
    s.type = 'range';
    s.min = String(min);
    s.max = String(max);
    s.step = String(step);
    s.value = String(value);
    wrap.append(lab, s);
    return { wrap, lab, s };
  };

  const vInf = mkSlider('出発余剰速度 v∞: 6.0 km/s', 0.5, 16, 0.1, 6.0);
  const inP = mkSlider('面内角度: 0°', -180, 180, 1, 0);
  const outP = mkSlider('面外角度: 0°', -45, 45, 1, 0);
  const launchBtn = el('button', 'btn wide launch', '発射') as HTMLButtonElement;
  manualPane.append(vInf.wrap, inP.wrap, outP.wrap, launchBtn);

  // -- porkchop pane
  const porkchopPane = el('div', 'pane');
  porkchopPane.style.display = 'none';

  const targetRow = el('div', 'row');
  targetRow.append(el('span', 'slider-label', '目標:'));
  const pcTargetSelect = el('select') as HTMLSelectElement;
  for (const key of PLANET_ORDER) {
    if (key === 'earth') continue;
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = PLANET_NAME_JA[key];
    if (key === 'mars') opt.selected = true;
    pcTargetSelect.appendChild(opt);
  }
  const pcStatus = el('span', 'pc-status', '');
  targetRow.append(pcTargetSelect, pcStatus);

  const pcCanvas = document.createElement('canvas');
  pcCanvas.className = 'pc-canvas';
  pcCanvas.width = 360;
  pcCanvas.height = 235;

  const pcReadout = el(
    'div',
    'pc-readout',
    'ヒートマップをクリックすると転送軌道をプレビューします（横軸: 出発日 / 縦軸: 飛行日数、色: 出発v∞）',
  );
  const pcLaunchBtn = el('button', 'btn wide launch', 'この軌道で発射') as HTMLButtonElement;
  pcLaunchBtn.disabled = true;

  porkchopPane.append(targetRow, pcCanvas, pcReadout, pcLaunchBtn);

  const flybyList = el('div', 'flyby-list', 'スライダーを動かすと予測軌道が更新されます。');
  bottom.append(manualPane, porkchopPane, flybyList);
  root.appendChild(bottom);
  bottom.style.display = 'none'; // hidden until design mode

  // ---- Help box (first-time hints) ---------------------------------------
  const helpBox = el('div', 'help-box');
  helpBox.innerHTML =
    'ドラッグで回転 / ホイールでズーム / 惑星クリックでフォーカス<br>スペースで再生・一時停止 / ダブルクリックでフォーカス解除';
  root.appendChild(helpBox);

  return {
    root,
    dateLabel,
    dateInput,
    playBtn,
    todayBtn,
    liveBtn,
    speedSlider,
    speedLabel,
    modeBtn,
    scaleBtn,
    sizeBtn,
    smallBodiesBtn,
    backToSunBtn,
    view3dBtn,
    view2dBtn,
    view4dBtn,
    galacticBtn,
    stCaption,
    infoPanel,
    nowPanel,
    swingbyPanel: bottom,
    tabManualBtn,
    tabPorkchopBtn,
    manualPane,
    porkchopPane,
    vInfSlider: vInf.s,
    vInfLabel: vInf.lab,
    inPlaneSlider: inP.s,
    inPlaneLabel: inP.lab,
    outPlaneSlider: outP.s,
    outPlaneLabel: outP.lab,
    launchBtn,
    pcTargetSelect,
    pcStatus,
    pcCanvas,
    pcReadout,
    pcLaunchBtn,
    flybyList,
    recordsPanel,
    craftPanel,
    pilotBtn,
    pilotPanel,
    helpBox,
  };
}

/** Render the min-approach records table. */
export function renderRecords(
  panel: HTMLElement,
  minApproach: Partial<Record<PlanetKey, number>>,
): void {
  const outer: PlanetKey[] = ['mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const rows = outer
    .filter((p) => minApproach[p] !== undefined)
    .map((p) => {
      const d = minApproach[p] as number;
      return `<div class="record-row"><span>${PLANET_NAME_JA[p]}</span><span>${d.toFixed(
        3,
      )} AU まで接近!</span></div>`;
    });
  panel.innerHTML = rows.length
    ? rows.join('')
    : '（まだ外惑星への接近記録はありません）';
}

/** Utility to update a date input from a JD. */
export function setDateInput(input: HTMLInputElement, jd: number): void {
  input.value = formatJDInput(jd);
}

export { PLANET_ORDER };
