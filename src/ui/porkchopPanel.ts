import type { PorkchopGrid } from '../sim/porkchop';
import { formatJDSlash } from './format';

/**
 * Porkchop-plot canvas rendering + pixel↔(launch date, TOF) mapping.
 * Colour encodes the departure v∞ [km/s] (blue = cheap, red = expensive).
 */

const MARGIN = { left: 44, right: 10, top: 8, bottom: 30 };

export interface PlotLayout {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export function plotLayout(canvas: HTMLCanvasElement): PlotLayout {
  return {
    x0: MARGIN.left,
    y0: MARGIN.top,
    w: canvas.width - MARGIN.left - MARGIN.right,
    h: canvas.height - MARGIN.top - MARGIN.bottom,
  };
}

/** Blue→teal→yellow→red colour scale, t in [0,1]. */
function heatColor(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [24, 48, 130]],
    [0.25, [28, 116, 180]],
    [0.5, [60, 175, 130]],
    [0.75, [235, 195, 70]],
    [1.0, [200, 55, 40]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const u = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * u),
        Math.round(c0[1] + (c1[1] - c0[1]) * u),
        Math.round(c0[2] + (c1[2] - c0[2]) * u),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/** Map canvas pixel to grid cell; null when outside the plot area. */
export function pixelToCell(
  canvas: HTMLCanvasElement,
  grid: PorkchopGrid,
  px: number,
  py: number,
): { iLaunch: number; iTof: number; launchJD: number; tofDays: number } | null {
  const L = plotLayout(canvas);
  if (px < L.x0 || px > L.x0 + L.w || py < L.y0 || py > L.y0 + L.h) return null;
  const fx = (px - L.x0) / L.w;
  const fy = 1 - (py - L.y0) / L.h; // TOF grows upward
  const cfg = grid.config;
  const iLaunch = Math.min(cfg.nLaunch - 1, Math.max(0, Math.round(fx * (cfg.nLaunch - 1))));
  const iTof = Math.min(cfg.nTof - 1, Math.max(0, Math.round(fy * (cfg.nTof - 1))));
  return {
    iLaunch,
    iTof,
    launchJD: cfg.launchStartJD + (cfg.launchSpanDays * iLaunch) / (cfg.nLaunch - 1),
    tofDays:
      cfg.tofMinDays + ((cfg.tofMaxDays - cfg.tofMinDays) * iTof) / (cfg.nTof - 1),
  };
}

/** Grid cell centre in canvas pixels. */
export function cellToPixel(
  canvas: HTMLCanvasElement,
  grid: PorkchopGrid,
  iLaunch: number,
  iTof: number,
): { x: number; y: number } {
  const L = plotLayout(canvas);
  const cfg = grid.config;
  return {
    x: L.x0 + (L.w * iLaunch) / (cfg.nLaunch - 1),
    y: L.y0 + L.h * (1 - iTof / (cfg.nTof - 1)),
  };
}

export interface DrawOptions {
  /** highlighted (selected) cell */
  selected?: { iLaunch: number; iTof: number } | null;
  /** hover crosshair cell */
  hover?: { iLaunch: number; iTof: number } | null;
}

export function drawPorkchop(
  canvas: HTMLCanvasElement,
  grid: PorkchopGrid,
  opts: DrawOptions = {},
): void {
  const ctx = canvas.getContext('2d')!;
  const L = plotLayout(canvas);
  const cfg = grid.config;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8, 12, 26, 0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Colour range: clamp to [best, best*4] so the valley structure is visible.
  const vBest = grid.best ? grid.best.vinfDep : 3;
  const vMin = vBest;
  const vMax = Math.max(vBest * 4, vBest + 6);

  const img = ctx.createImageData(cfg.nLaunch, cfg.nTof);
  for (let j = 0; j < cfg.nTof; j++) {
    for (let i = 0; i < cfg.nLaunch; i++) {
      const v = grid.vinfDep[j * cfg.nLaunch + i];
      // image rows top→bottom = high TOF → low TOF
      const idx = ((cfg.nTof - 1 - j) * cfg.nLaunch + i) * 4;
      if (Number.isNaN(v)) {
        img.data[idx] = 10;
        img.data[idx + 1] = 12;
        img.data[idx + 2] = 22;
        img.data[idx + 3] = 255;
        continue;
      }
      const t = Math.min(1, Math.max(0, (v - vMin) / (vMax - vMin)));
      const [r, g, b] = heatColor(t);
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
  // scale the small grid image up into the plot area
  const off = document.createElement('canvas');
  off.width = cfg.nLaunch;
  off.height = cfg.nTof;
  off.getContext('2d')!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, L.x0, L.y0, L.w, L.h);

  // Frame
  ctx.strokeStyle = 'rgba(150, 170, 210, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(L.x0 + 0.5, L.y0 + 0.5, L.w - 1, L.h - 1);

  // Axis labels
  ctx.fillStyle = 'rgba(190, 205, 235, 0.85)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  const nx = 4;
  for (let k = 0; k <= nx; k++) {
    const jd = cfg.launchStartJD + (cfg.launchSpanDays * k) / nx;
    const x = L.x0 + (L.w * k) / nx;
    ctx.fillText(formatJDSlash(jd).slice(0, 7), x, L.y0 + L.h + 13);
    ctx.strokeStyle = 'rgba(150,170,210,0.18)';
    ctx.beginPath();
    ctx.moveTo(x, L.y0);
    ctx.lineTo(x, L.y0 + L.h);
    ctx.stroke();
  }
  ctx.textAlign = 'right';
  const ny = 4;
  for (let k = 0; k <= ny; k++) {
    const tof = cfg.tofMinDays + ((cfg.tofMaxDays - cfg.tofMinDays) * k) / ny;
    const y = L.y0 + L.h * (1 - k / ny);
    ctx.fillText(`${Math.round(tof)}日`, L.x0 - 5, y + 3);
  }
  ctx.textAlign = 'center';
  ctx.fillText('出発日', L.x0 + L.w / 2, canvas.height - 4);

  // Best-point marker (white circle)
  if (grid.best) {
    const p = cellToPixel(canvas, grid, grid.best.iLaunch, grid.best.iTof);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Hover crosshair
  if (opts.hover) {
    const p = cellToPixel(canvas, grid, opts.hover.iLaunch, opts.hover.iTof);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L.x0, p.y);
    ctx.lineTo(L.x0 + L.w, p.y);
    ctx.moveTo(p.x, L.y0);
    ctx.lineTo(p.x, L.y0 + L.h);
    ctx.stroke();
  }

  // Selected cell marker
  if (opts.selected) {
    const p = cellToPixel(canvas, grid, opts.selected.iLaunch, opts.selected.iTof);
    ctx.strokeStyle = '#66ffcc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#66ffcc';
    ctx.fill();
  }
}
