import {
  COSMOS,
  REGION_JA,
  KIND_JA,
  distanceLabel,
  type CosmicBody,
  type CosmicRegion,
} from './cosmosData';

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

export interface CosmosHud {
  root: HTMLElement;
  listPanel: HTMLElement;
  infoPanel: HTMLElement;
  statusEl: HTMLElement;
  navEl: HTMLElement;
  logPanel: HTMLElement;
  // 没入モード用のシネマ字幕（下部中央・HUDが消えているときだけ見える）
  cinemaEl: HTMLElement;
  cinemaTitle: HTMLElement;
  cinemaSub: HTMLElement;
  cinemaTag: HTMLElement;
  // サウンド
  soundBtn: HTMLButtonElement;
  // 銀河衝突シアター
  theaterBtn: HTMLButtonElement;
  theaterPanel: HTMLElement;
  thTimeEl: HTMLElement;
  thSepEl: HTMLElement;
  thPlayBtn: HTMLButtonElement;
  thResetBtn: HTMLButtonElement;
  thSpeedSlider: HTMLInputElement;
  thCloseBtn: HTMLButtonElement;
  // 自動探索ツアー（展示モード）
  autoBtn: HTMLButtonElement;
  // ブラックホール・ダイブ
  diveBtn: HTMLButtonElement;
  divePanel: HTMLElement;
  dvStageTitle: HTMLElement;
  dvStageText: HTMLElement;
  dvReadout: HTMLElement;
  dvPlayBtn: HTMLButtonElement;
  dvSpeedSlider: HTMLInputElement;
  dvExitBtn: HTMLButtonElement;
  dvFade: HTMLElement;
  dvFinal: HTMLElement;
  dvRetryBtn: HTMLButtonElement;
  dvLeaveBtn: HTMLButtonElement;
  setActive: (on: boolean) => void;
  /** シアター上演中の HUD 切替（チャート等を隠す） */
  setTheaterMode: (on: boolean) => void;
  /** ダイブ中の HUD 切替 */
  setDiveMode: (on: boolean) => void;
  /** 目的地リストの選択ハイライトを更新 */
  highlight: (id: string | null) => void;
}

const REGION_ORDER: CosmicRegion[] = ['solar', 'milkyway', 'localgroup', 'deepfield', 'multiverse'];

export interface CosmosHudCallbacks {
  onSelect: (body: CosmicBody) => void;
  onWarp: (body: CosmicBody) => void;
  onReturnHome: () => void;
  onScan: () => void;
  onTheater: () => void;
  onDive: () => void;
  onAutoToggle: () => void;
  onSoundToggle: () => void;
}

/** 大宇宙モードの HUD を組み立てる。 */
export function buildCosmosHud(container: HTMLElement, cb: CosmosHudCallbacks): CosmosHud {
  const root = el('div', 'cosmos-hud');
  root.style.display = 'none';
  container.appendChild(root);

  // ---- タイトル & 帰還 ----
  const top = el('div', 'hud-panel cosmos-top');
  const title = el('div', 'cosmos-title', '🌌 大宇宙エクスプローラー');
  const subtitle = el('div', 'cosmos-subtitle', 'Fable 5 が想像した宇宙');
  const btnRow = el('div', 'cosmos-btn-row');
  const returnBtn = el('button', 'btn', '☀ 太陽系へ帰還') as HTMLButtonElement;
  returnBtn.addEventListener('click', () => cb.onReturnHome());
  const scanBtn = el('button', 'btn', '🔭 未知の銀河をスキャン') as HTMLButtonElement;
  scanBtn.title = 'まだ見ぬ深宇宙の銀河を探し出してワープする';
  scanBtn.addEventListener('click', () => cb.onScan());
  const theaterBtn = el('button', 'btn', '💫 銀河衝突') as HTMLButtonElement;
  theaterBtn.title = '天の川銀河とアンドロメダ銀河、45億年後の衝突を上演する';
  theaterBtn.addEventListener('click', () => cb.onTheater());
  const diveBtn = el('button', 'btn', '🕳 ブラックホールダイブ') as HTMLButtonElement;
  diveBtn.title = 'いて座A*——超大質量ブラックホールへ降下する';
  diveBtn.addEventListener('click', () => cb.onDive());
  btnRow.append(returnBtn, scanBtn, theaterBtn, diveBtn);
  const row2 = el('div', 'cosmos-btn-row');
  const autoBtn = el('button', 'btn auto-tour active-theater', '🛰 自動探索: ON') as HTMLButtonElement;
  autoBtn.title = '30秒ごとに未知の銀河へ自動でワープします（操作すると一時停止）';
  autoBtn.addEventListener('click', () => cb.onAutoToggle());
  const soundBtn = el('button', 'btn', '🔇 サウンド: OFF') as HTMLButtonElement;
  soundBtn.title = '宇宙アンビエントとワープ音を鳴らします（すべてその場で合成）';
  soundBtn.addEventListener('click', () => cb.onSoundToggle());
  row2.append(autoBtn, soundBtn);
  const statusEl = el('div', 'cosmos-status', '目的地を選んでワープしよう');
  const navEl = el('div', 'cosmos-nav', '');
  top.append(title, subtitle, btnRow, row2, statusEl, navEl);
  root.appendChild(top);

  // ---- 目的地カタログ（左） ----
  const listWrap = el('div', 'hud-panel cosmos-list');
  listWrap.append(el('div', 'panel-title', '航行チャート'));
  const listPanel = el('div', 'cosmos-list-body');
  listWrap.appendChild(listPanel);
  root.appendChild(listWrap);

  const itemById = new Map<string, HTMLElement>();

  for (const region of REGION_ORDER) {
    const bodies = COSMOS.filter((b) => b.region === region);
    if (!bodies.length) continue;
    listPanel.append(el('div', 'cosmos-region', REGION_JA[region]));
    for (const body of bodies) {
      const item = el('button', 'cosmos-item' + (body.fictional ? ' fictional' : ''));
      item.innerHTML = `
        <span class="ci-name">${body.fictional ? '✦ ' : ''}${body.nameJa}</span>
        <span class="ci-meta">${KIND_JA[body.kind]}・${distanceLabel(body.distanceLy)}</span>
        <span class="ci-tag">${body.tag}</span>`;
      item.addEventListener('click', () => cb.onSelect(body));
      itemById.set(body.id, item);
      listPanel.appendChild(item);
    }
  }

  // ---- 解説パネル（右） ----
  const infoWrap = el('div', 'hud-panel cosmos-info');
  const infoPanel = el('div', 'cosmos-info-body');
  infoPanel.innerHTML =
    '<div class="cosmos-info-hint">左のチャートから天体を選ぶと、ここに解説が出ます。<br>「ワープ」で目的地まで飛び、天体をクリックしても選べます。</div>';
  infoWrap.appendChild(infoPanel);
  root.appendChild(infoWrap);

  // ---- 航行記録（右下） ----
  const logWrap = el('div', 'hud-panel cosmos-log');
  logWrap.append(el('div', 'panel-title', '航行記録'));
  const logPanel = el('div', 'cosmos-log-body', 'まだどこにも降り立っていません。');
  logWrap.appendChild(logPanel);
  root.appendChild(logWrap);

  // ---- 操作ヒント ----
  const help = el('div', 'cosmos-help');
  help.innerHTML =
    'ドラッグで視点回転 / ホイールでズーム / W A S D + Q E で自由航行（Shiftで加速）<br>天体クリックで選択・「ワープ」でひとっ飛び<br>しばらく操作しないと表示が消え、宇宙だけの眺めに戻ります';
  root.appendChild(help);

  // ---- 銀河衝突シアター 操作パネル（下部中央・上演中のみ） ----
  const theaterPanel = el('div', 'hud-panel cosmos-theater');
  theaterPanel.style.display = 'none';
  theaterPanel.append(el('div', 'panel-title', '💫 銀河衝突シアター — 天の川 × アンドロメダ'));
  const thDesc = el(
    'div',
    'th-desc',
    'ふたつの銀河は、いまから約45億年後に衝突をはじめると考えられています。数千の星を重力計算で動かして、その未来を早送りで上演します。すれ違いざまに伸びる「潮汐の尾」に注目。',
  );
  const thTimeEl = el('div', 'th-time', 'いまから 0 億年後');
  const thSepEl = el('div', 'th-sep', '');
  const thRow = el('div', 'row');
  const thPlayBtn = el('button', 'btn', '⏸ 一時停止') as HTMLButtonElement;
  const thResetBtn = el('button', 'btn', '⏮ 最初から') as HTMLButtonElement;
  const thCloseBtn = el('button', 'btn', '✕ 閉じる') as HTMLButtonElement;
  thRow.append(thPlayBtn, thResetBtn, thCloseBtn);
  const thSpeedWrap = el('div', 'slider-wrap');
  const thSpeedLabel = el('div', 'slider-label', '再生スピード');
  const thSpeedSlider = el('input') as HTMLInputElement;
  thSpeedSlider.type = 'range';
  thSpeedSlider.min = '0.2';
  thSpeedSlider.max = '5';
  thSpeedSlider.step = '0.1';
  thSpeedSlider.value = '1';
  thSpeedWrap.append(thSpeedLabel, thSpeedSlider);
  theaterPanel.append(thDesc, thTimeEl, thSepEl, thRow, thSpeedWrap);
  root.appendChild(theaterPanel);

  // ---- ブラックホール・ダイブ パネル（下部中央・降下中のみ） --------------
  const divePanel = el('div', 'hud-panel cosmos-dive');
  divePanel.style.display = 'none';
  divePanel.append(el('div', 'panel-title', '🕳 ブラックホールダイブ — いて座A*'));
  const dvStageTitle = el('div', 'dv-stage-title', '');
  const dvStageText = el('div', 'dv-stage-text', '');
  const dvReadout = el('div', 'dv-readout', '');
  const dvRow = el('div', 'row');
  const dvPlayBtn = el('button', 'btn', '⏸ 一時停止') as HTMLButtonElement;
  const dvExitBtn = el('button', 'btn', '⏏ 脱出する') as HTMLButtonElement;
  dvRow.append(dvPlayBtn, dvExitBtn);
  const dvSpeedWrap = el('div', 'slider-wrap');
  const dvSpeedLabel = el('div', 'slider-label', '降下スピード');
  const dvSpeedSlider = el('input') as HTMLInputElement;
  dvSpeedSlider.type = 'range';
  dvSpeedSlider.min = '0.5';
  dvSpeedSlider.max = '4';
  dvSpeedSlider.step = '0.1';
  dvSpeedSlider.value = '1';
  dvSpeedWrap.append(dvSpeedLabel, dvSpeedSlider);
  divePanel.append(dvStageTitle, dvStageText, dvReadout, dvRow, dvSpeedWrap);
  root.appendChild(divePanel);

  // ---- シネマ字幕（没入モード時だけ現れる、プラネタリウムの字幕） --------
  const cinemaEl = el('div', 'cosmos-cinema');
  const cinemaTitle = el('div', 'cinema-title', '');
  const cinemaSub = el('div', 'cinema-sub', '');
  const cinemaTag = el('div', 'cinema-tag', '');
  const cinemaHint = el('div', 'cinema-hint', 'マウスやキーボードにふれると、あなたが操縦できます');
  cinemaEl.append(cinemaTitle, cinemaSub, cinemaTag, cinemaHint);
  root.appendChild(cinemaEl);

  // 暗転オーバーレイ（地平線突入時にフェード）
  const dvFade = el('div', 'dive-fade');
  root.appendChild(dvFade);

  // 突入後の最終カード
  const dvFinal = el('div', 'hud-panel dive-final');
  dvFinal.style.display = 'none';
  const dvFinalTitle = el('div', 'dv-final-title', '');
  const dvFinalText = el('div', 'dv-final-text', '');
  dvFinalTitle.className = 'dv-final-title';
  dvFinalText.className = 'dv-final-text';
  const dvFinalRow = el('div', 'row');
  const dvRetryBtn = el('button', 'btn', '⏮ もう一度落ちる') as HTMLButtonElement;
  const dvLeaveBtn = el('button', 'btn launch', '⏏ 宇宙へ帰る') as HTMLButtonElement;
  dvFinalRow.append(dvRetryBtn, dvLeaveBtn);
  dvFinal.append(dvFinalTitle, dvFinalText, dvFinalRow);
  root.appendChild(dvFinal);

  return {
    root,
    listPanel,
    infoPanel,
    statusEl,
    navEl,
    logPanel,
    cinemaEl,
    cinemaTitle,
    cinemaSub,
    cinemaTag,
    soundBtn,
    theaterBtn,
    theaterPanel,
    thTimeEl,
    thSepEl,
    thPlayBtn,
    thResetBtn,
    thSpeedSlider,
    thCloseBtn,
    autoBtn,
    diveBtn,
    divePanel,
    dvStageTitle,
    dvStageText,
    dvReadout,
    dvPlayBtn,
    dvSpeedSlider,
    dvExitBtn,
    dvFade,
    dvFinal,
    dvRetryBtn,
    dvLeaveBtn,
    setActive: (on: boolean) => {
      root.style.display = on ? 'block' : 'none';
    },
    setTheaterMode: (on: boolean) => {
      theaterPanel.style.display = on ? 'block' : 'none';
      listWrap.style.display = on ? 'none' : 'block';
      infoWrap.style.display = on ? 'none' : 'block';
      logWrap.style.display = on ? 'none' : 'block';
      help.style.display = on ? 'none' : 'block';
      theaterBtn.classList.toggle('active-theater', on);
    },
    setDiveMode: (on: boolean) => {
      divePanel.style.display = on ? 'block' : 'none';
      listWrap.style.display = on ? 'none' : 'block';
      infoWrap.style.display = on ? 'none' : 'block';
      logWrap.style.display = on ? 'none' : 'block';
      help.style.display = on ? 'none' : 'block';
      diveBtn.classList.toggle('active-theater', on);
      if (!on) {
        dvFade.classList.remove('on');
        dvFinal.style.display = 'none';
      }
    },
    highlight: (id: string | null) => {
      for (const [bid, elm] of itemById) {
        const sel = bid === id;
        elm.classList.toggle('selected', sel);
        // 自動探索やクリック選択でチャートの見えない位置が選ばれても追える
        if (sel) elm.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
  };
}

/** 解説パネルの中身を描画する。 */
export function renderCosmosInfo(
  panel: HTMLElement,
  body: CosmicBody,
  onWarp: () => void,
  onDive?: () => void,
): void {
  const realTag = body.fictional
    ? '<span class="cosmos-badge fictional">Fable 5 の空想</span>'
    : '<span class="cosmos-badge real">実在の天体</span>';
  // いて座A*にはダイブ入口を出す
  const diveBtn =
    body.id === 'sgr-a' && onDive
      ? '<button class="btn wide cosmos-dive-btn">🕳 ブラックホールに飛び込む</button>'
      : '';
  panel.innerHTML = `
    <div class="cosmos-info-name">${body.fictional ? '✦ ' : ''}${body.nameJa}</div>
    <div class="cosmos-info-sub">${body.nameSub}</div>
    ${realTag}
    <div class="cosmos-info-rows">
      <div class="info-row"><span>種別</span><span>${KIND_JA[body.kind]}</span></div>
      <div class="info-row"><span>太陽からの距離</span><span>${distanceLabel(body.distanceLy)}</span></div>
    </div>
    <div class="cosmos-lore">${body.lore}</div>
    <button class="btn wide launch cosmos-warp-btn">🚀 ここへワープ</button>
    ${diveBtn}
  `;
  const btn = panel.querySelector<HTMLButtonElement>('.cosmos-warp-btn');
  if (btn) btn.addEventListener('click', onWarp);
  const dv = panel.querySelector<HTMLButtonElement>('.cosmos-dive-btn');
  if (dv && onDive) dv.addEventListener('click', onDive);
}

/** 航行記録に到達した天体を追記する。 */
export function renderCosmosLog(panel: HTMLElement, visited: CosmicBody[]): void {
  if (!visited.length) {
    panel.textContent = 'まだどこにも降り立っていません。';
    return;
  }
  panel.innerHTML = visited
    .slice()
    .reverse()
    .map(
      (b) =>
        `<div class="cosmos-log-row">${b.fictional ? '✦ ' : '● '}${b.nameJa}<span class="cosmos-log-dist">${distanceLabel(
          b.distanceLy,
        )}</span></div>`,
    )
    .join('');
}
