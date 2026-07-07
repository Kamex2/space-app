import type { PlanetKey } from '../data/planetElements';
import type { PropagationResult } from '../sim/propagate';
import { specificEnergy } from '../sim/propagate';

/**
 * Mission badges — small challenges evaluated against each committed flight.
 * Achievements persist in localStorage so the collection survives reloads.
 */

export interface Mission {
  id: string;
  name: string;
  desc: string;
  check: (flight: PropagationResult) => boolean;
}

const flybyPlanets = (f: PropagationResult): Set<PlanetKey> =>
  new Set(f.flybys.map((e) => e.planet));

export const MISSIONS: Mission[] = [
  {
    id: 'first-flyby',
    name: 'はじめてのフライバイ',
    desc: 'いずれかの惑星に 0.05 AU 以内まで接近する',
    check: (f) => f.flybys.length > 0,
  },
  {
    id: 'mars-precision',
    name: '火星ピンポイント',
    desc: '火星に 0.005 AU（約75万km）以内まで接近する',
    check: (f) => (f.minApproach.mars ?? Infinity) < 0.005,
  },
  {
    id: 'venus-slingshot',
    name: '金星スリングショット',
    desc: '金星スイングバイで加速する（Δv > 0）',
    check: (f) => f.flybys.some((e) => e.planet === 'venus' && e.deltaV > 0),
  },
  {
    id: 'jupiter-reach',
    name: '木星への旅',
    desc: '木星に 0.05 AU 以内まで接近する',
    check: (f) => (f.minApproach.jupiter ?? Infinity) < 0.05,
  },
  {
    id: 'voyager-class',
    name: 'ボイジャー級',
    desc: '1回の飛行で2惑星以上をフライバイする',
    check: (f) => flybyPlanets(f).size >= 2,
  },
  {
    id: 'grand-tour',
    name: 'グランドツアー',
    desc: '1回の飛行で木星と土星の両方をフライバイする',
    check: (f) => {
      const p = flybyPlanets(f);
      return p.has('jupiter') && p.has('saturn');
    },
  },
  {
    id: 'interstellar',
    name: '恒星間空間へ',
    desc: '太陽系の脱出速度に到達して飛行を終える',
    check: (f) => {
      const last = f.samples[f.samples.length - 1];
      return last !== undefined && specificEnergy(last) > 0;
    },
  },
];

const STORAGE_KEY = 'sse-missions-v1';

export function loadAchieved(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveAchieved(achieved: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...achieved]));
  } catch {
    // localStorage unavailable (private mode etc.) — badges just won't persist
  }
}

/**
 * Evaluate a flight against all missions. Mutates + persists `achieved`,
 * returns the missions newly achieved by this flight.
 */
export function evaluateFlight(
  flight: PropagationResult,
  achieved: Set<string>,
): Mission[] {
  const fresh: Mission[] = [];
  for (const m of MISSIONS) {
    if (!achieved.has(m.id) && m.check(flight)) {
      achieved.add(m.id);
      fresh.push(m);
    }
  }
  if (fresh.length > 0) saveAchieved(achieved);
  return fresh;
}
