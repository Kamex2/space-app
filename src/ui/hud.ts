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
  // right: view / scale / info
  scaleBtn: HTMLButtonElement;
  sizeBtn: HTMLButtonElement;
  smallBodiesBtn: HTMLButtonElement;
  backToSunBtn: HTMLButtonElement;
  enterCosmosBtn: HTMLButtonElement;
  view3dBtn: HTMLButtonElement;
  view2dBtn: HTMLButtonElement;
  view4dBtn: HTMLButtonElement;
  galacticBtn: HTMLButtonElement;
  stCaption: HTMLElement;
  infoPanel: HTMLElement;
  // left: live "now" panel
  nowPanel: HTMLElement;
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

  // ---- Right panel: view / scale / info ----------------------------------
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

  const enterCosmosBtn = el('button', 'btn wide enter-cosmos', '🌌 大宇宙へ出発') as HTMLButtonElement;
  enterCosmosBtn.title = '太陽系をこえて銀河・星雲・多元宇宙を探索する';
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
    enterCosmosBtn,
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

  // ---- Live "now" panel ----------------------------------------------------
  const nowWrap = el('div', 'hud-panel hud-now');
  nowWrap.append(el('div', 'panel-title', 'いま、地球は'));
  const nowPanel = el('div', 'now-panel');
  nowWrap.append(nowPanel);
  root.appendChild(nowWrap);

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
    scaleBtn,
    sizeBtn,
    smallBodiesBtn,
    backToSunBtn,
    enterCosmosBtn,
    view3dBtn,
    view2dBtn,
    view4dBtn,
    galacticBtn,
    stCaption,
    infoPanel,
    nowPanel,
    pilotBtn,
    pilotPanel,
    helpBox,
  };
}

/** Utility to update a date input from a JD. */
export function setDateInput(input: HTMLInputElement, jd: number): void {
  input.value = formatJDInput(jd);
}
