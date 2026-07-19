// ---------------------------------------------------------------------------
// プロシージャル・サウンド — 外部アセットなし、Web Audio APIだけで合成する。
// 宇宙アンビエント（低いドローン＋星のきらめき）、ワープ音、到着音、
// 発見チャイム、上演開始の低い唸りを生成する。
// ブラウザの自動再生制限があるため、必ずユーザー操作（ボタン）から有効化する。
// ---------------------------------------------------------------------------

export class CosmosAudio {
  enabled = false;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padBuilt = false;
  private noiseBuffer: AudioBuffer | null = null;

  /** ON/OFF を切り替える。ユーザー操作のハンドラ内から呼ぶこと。 */
  toggle(): boolean {
    this.enabled = !this.enabled;
    const ctx = this.ensureCtx();
    const master = this.master!;
    const t = ctx.currentTime;
    if (this.enabled) {
      void ctx.resume();
      this.buildPad();
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.linearRampToValueAtTime(0.6, t + 1.8);
    } else {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + 0.6);
      window.setTimeout(() => {
        if (!this.enabled) void this.ctx?.suspend();
      }, 700);
    }
    return this.enabled;
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.0001;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private getNoise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  /** 宇宙アンビエント: 完全5度で重ねた低音ドローン＋ろ過ノイズのきらめき。 */
  private buildPad() {
    if (this.padBuilt || !this.ctx || !this.master) return;
    this.padBuilt = true;
    const ctx = this.ctx;
    const pad = ctx.createGain();
    pad.gain.value = 0.3;
    pad.connect(this.master);

    const osc = (freq: number, level: number, type: OscillatorType) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g);
      g.connect(pad);
      o.start();
    };
    osc(55, 0.5, 'sine');
    osc(82.4 + 0.6, 0.18, 'sine'); // 完全5度＋わずかなうなり
    osc(110.5, 0.1, 'triangle');

    // 音量を約20秒周期でゆっくり揺らす
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain);
    lfoGain.connect(pad.gain);
    lfo.start();

    // 星のきらめき（バンドパスを通した淡いノイズ）
    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoise(ctx);
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.4;
    const ng = ctx.createGain();
    ng.gain.value = 0.03;
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(pad);
    noise.start();
  }

  /** ワープ: ノイズのバンドパス・スイープ＋上昇グライド。 */
  warp(dur = 2.4) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(150, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.45);
    bp.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.1);

    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(60, t);
    o.frequency.exponentialRampToValueAtTime(340, t + dur * 0.5);
    o.frequency.exponentialRampToValueAtTime(90, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.4);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp);
    lp.connect(og);
    og.connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  /** 到着: やわらかな2音のピング（C5→G5）。 */
  arrive() {
    const ctx = this.ready();
    if (!ctx) return;
    this.ping(ctx, 523.25, 0.09, 0);
    this.ping(ctx, 784.0, 0.06, 0.12);
  }

  /** 未知の銀河を発見: 倍音を重ねたベルの響き。 */
  discover() {
    const ctx = this.ready();
    if (!ctx) return;
    this.ping(ctx, 660, 0.11, 0, 1.6);
    this.ping(ctx, 990, 0.07, 0.05, 1.3);
    this.ping(ctx, 1485, 0.04, 0.1, 0.9);
  }

  /** シアター/ダイブ開演: 深く低い唸り。 */
  boom() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(38, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 2.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(g);
    g.connect(this.master!);
    o.start(t);
    o.stop(t + 3.3);
  }

  private ping(ctx: AudioContext, freq: number, level: number, delay: number, decay = 0.9) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(this.master!);
    o.start(t);
    o.stop(t + decay + 0.1);
  }
}
