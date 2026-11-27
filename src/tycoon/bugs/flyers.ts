// ============================================================================
// flyers.ts — 🦋🐉🌙 the three big winged fleet bugs: moth, dragonfly, butterfly (tycoon bugs, v0.68).
//
// These three don't use the standard "buzz" wing animation (bee / fly / ladybug / beetle do). Each has its own
// flapping, done in `extra` (animateCreature calls it every frame AFTER its own leg + wing math, so ours wins):
//   butterfly : BIG SLOW flaps. Wings are held straight up and closed over the back when landed (wingOpen = 0).
//   dragonfly : 4 wings. Fast shimmer, fore wings and hind wings out of phase. Held flat out when landed.
//   moth      : medium flaps. Wings swept back like a roof when landed.
// Every wing is registered as a Wing entry (so `m.wings` lists them), and its pivot sits at the wing ROOT:
// rotation.z flaps it up/down, rotation.y sweeps it back/forward.
// A flap phase just counts up with dt, started at a random offset so a flock never flaps in lock-step.
//
// Triangle counts (default build): moth ~1,500 · dragonfly ~1,700 · butterfly ~900
// ============================================================================
import * as THREE from 'three';
import { SIZE } from '../scale';
import {
  addBody, addLegs, addWing, cached, ell, finishBug, legChain, legPair, lathe, merge, mix, newBug, newRig,
  rowYaw, seat, smoothOutline, tripodPhase, tube, MATTE, SATIN, SHINY, type LegSpec,
} from './parts';
import { butterflyDraw, dragonDraw, leafOutline, makeWing, mothDraw } from './wings';
import { rng } from '../kit';
import type { BArgs, Bug } from './types';

const lerp = THREE.MathUtils.lerp;

/** Six slender legs in a tripod gait (same recipe as the small bugs). */
function legs6(key: string, color: number, rows: number[], x: number, y: number, pts: Array<[number, number]>, rad: number[], spread = 0.55) {
  const pair = legPair(key, () => legChain(color, pts.map(([px, py]) => [px, py, 0] as const), rad));
  const specs: LegSpec[] = [];
  rows.forEach((z, row) => {
    for (const side of [-1, 1] as const) {
      specs.push({ at: [side * x, y, z], side, yaw: rowYaw(row, rows.length, side, spread), phase: tripodPhase(row, side), geo: side === 1 ? pair.R : pair.L });
    }
  });
  return specs;
}

/** A feathery antenna: a thin stalk with little side barbs (the moth's comb antennae). */
function featherAntenna(color: number, s: 1 | -1, a: [number, number, number], b: [number, number, number], barb: number) {
  const parts = [tube(color, [s * a[0], a[1], a[2]], [s * b[0], b[1], b[2]], barb * 0.2, barb * 0.1, 4)];
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const p: [number, number, number] = [s * lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    const len = barb * (1 - t * 0.5);
    parts.push(tube(color, p, [p[0] + len * 0.8, p[1] + len * 0.2, p[2] + len * 0.5], barb * 0.1, barb * 0.04, 3, true));
    parts.push(tube(color, p, [p[0] - len * 0.8, p[1] + len * 0.2, p[2] + len * 0.5], barb * 0.1, barb * 0.04, 3, true));
  }
  return parts;
}

// ===========================================================================
// 🌙 MOTH — night flights. Soft brown fuzzy body, big dark eyes, feathery antennae, brown wings with wavy bands + an eyespot.
// ===========================================================================
export function moth(a: BArgs): Bug {
  const L = SIZE.moth;
  const m = newBug('moth', 0.4 * L, L, a.scale);
  const rig = newRig(0.3);
  const fur = a.color ?? 0xa88a66;
  const abR = (z: number) => 0.14 * L * Math.sin(Math.PI * Math.min(1, Math.max(0.05, (z / L + 0.5) / 0.52)) ** 0.8);
  const S = 0.5 * SIZE.mothWingspan - 0.06 * L, C = 0.72 * L;
  const g = cached(`moth|${fur}`, () => {
    const prof: Array<[number, number]> = [[0, -0.5 * L]];
    for (let i = 1; i <= 14; i++) {
      const z = (-0.5 + (0.52 * i) / 14) * L;
      prof.push([abR(z), z]);
    }
    prof.push([0, 0.02 * L]);
    const body = merge([
      lathe((_x, y) => mix(fur, 0xf0e2c8, Math.max(0, 0.28 - y / L) * 1.6), prof, [0, 0.26 * L, 0], { segs: 10 }),
      ell(mix(fur, 0x4a3520, 0.35), [0, 0.28 * L, 0.15 * L], [0.16 * L, 0.15 * L, 0.17 * L], { w: 12, h: 8 }),
      ell(fur, [0, 0.28 * L, 0.36 * L], [0.1 * L, 0.09 * L, 0.08 * L], { w: 9, h: 6 }),
      ...[-1, 1].flatMap((s) => [
        ell(0x1b1410, [s * 0.075 * L, 0.3 * L, 0.39 * L], [0.04 * L, 0.055 * L, 0.04 * L], { w: 7, h: 5 }),
        ...featherAntenna(0xe0c9a0, s as 1 | -1, [0.04 * L, 0.35 * L, 0.42 * L], [0.17 * L, 0.5 * L, 0.6 * L], 0.07 * L),
      ]),
    ]);
    const wing = makeWing(`moth-wing|${fur}`,
      smoothOutline([[0, 0.3 * C], [0.4 * S, 0.5 * C], [0.85 * S, 0.42 * C], [S, 0.1 * C], [0.88 * S, -0.35 * C], [0.6 * S, -0.55 * C], [0.3 * S, -0.5 * C], [0.02 * S, -0.3 * C]], 30),
      mothDraw('#' + fur.toString(16).padStart(6, '0'), '#5b4228', '#e9dcc3'), false);
    return { body, wing };
  });
  addBody(m, g.body, MATTE);
  const wings: THREE.Object3D[] = [];
  for (const side of [1, -1] as const) wings.push(addWing(m, g.wing.R, g.wing.L, g.wing.mat, [side * 0.07 * L, 0.38 * L, 0.14 * L], side, false));
  addLegs(m, rig, MATTE, legs6('moth', 0x6e5538, [0.22 * L, 0.12 * L, 0.02 * L], 0.07 * L, 0.14 * L,
    [[0, 0], [0.08 * L, 0.04 * L], [0.18 * L, -0.14 * L]], [0.02 * L, 0.016 * L, 0.01 * L]));
  for (const z of [0.14, -0.02, -0.18, -0.33]) seat(m, 0, 0.26 * L + abR(z * L) + (z > 0 ? 0.03 * L : 0), z * L);
  const r = rng(Math.floor(a.seed * 977) + 5);
  let ph = r.range(0, 6.28);
  finishBug(m, rig, [(dt) => {
    const wo = m.wingOpen;
    ph += dt * (30 + 6 * wo);
    const flap = 0.2 + 0.68 * Math.sin(ph);
    const roll = lerp(-0.32, flap, wo);        // folded: drooped like a roof
    const sweep = lerp(1.05, 0.38, wo);        // folded: swept back over the body
    wings.forEach((w, i) => {
      const side = i === 0 ? 1 : -1;
      w.rotation.set(0, side * sweep, side * roll);
    });
  }]);
  return m;
}

// ===========================================================================
// 🐉 DRAGONFLY — fast jet. Huge teal eyes, striped green thorax, long segmented teal/blue abdomen, 4 long veined wings.
// ===========================================================================
export function dragonfly(a: BArgs): Bug {
  const L = SIZE.dragonfly;
  const m = newBug('dragonfly', 0.22 * L, L, a.scale);
  const rig = newRig(0.3);
  const teal = a.color ?? 0x25b3c9;
  const S = 0.5 * SIZE.dragonflyWingspan - 0.07 * L;
  const abR = (z: number) => { // abdomen radius at z (thick at the waist, thin, then a small club at the tail)
    const t = (z / L + 0.47) / 0.72; // 0 tail .. 1 waist
    return L * (0.016 + 0.012 * t ** 2 + 0.01 * Math.exp(-((t - 0.04) ** 2) / 0.01));
  };
  const g = cached(`dragonfly|${teal}`, () => {
    const prof: Array<[number, number]> = [[0, -0.47 * L]];
    const n = 30;
    for (let i = 0; i <= n; i++) {
      const z = (-0.46 + (0.7 * i) / n) * L;
      const seg = 0.5 * (1 + Math.cos(2 * Math.PI * 9 * ((z / L + 0.47) / 0.72)));
      prof.push([abR(z) * (1 - 0.12 * seg ** 2), z]);
    }
    prof.push([0, 0.25 * L]);
    const bands = (_x: number, _y: number, z: number) => {
      const k = Math.floor(((z / L + 0.47) / 0.72) * 9);
      return k % 2 === 0 ? teal : mix(teal, 0x0e2a4a, 0.62);
    };
    const body = merge([
      lathe(bands, prof, [0, 0.145 * L, 0], { segs: 8 }),
      ell((x) => (Math.abs(x) > 0.018 * L && Math.abs(x) < 0.03 * L ? 0x2a4a1a : 0x7fcf45), [0, 0.15 * L, 0.33 * L], [0.062 * L, 0.066 * L, 0.088 * L], { w: 12, h: 8 }),
      ell(0x2e8fa8, [0, 0.14 * L, 0.44 * L], [0.04 * L, 0.036 * L, 0.03 * L], { w: 8, h: 5 }),
      ...[-1, 1].flatMap((s) => [
        ell(mix(teal, 0x1a5fb0, 0.35), [s * 0.04 * L, 0.16 * L, 0.455 * L], [0.04 * L, 0.04 * L, 0.036 * L], { w: 10, h: 7 }), // HUGE eyes
        ell(0xffffff, [s * 0.052 * L, 0.18 * L, 0.475 * L], [0.011 * L, 0.011 * L, 0.01 * L], { w: 5, h: 4 }),
        tube(0x1a2a3a, [s * 0.008 * L, 0.145 * L, -0.46 * L], [s * 0.022 * L, 0.145 * L, -0.5 * L], 0.008 * L, 0.003 * L, 3),
      ]),
    ]);
    const fore = makeWing('dragon-fore', leafOutline(S, 0.1 * L, 0.7), dragonDraw('rgba(200,230,240,0.34)'), true);
    const hind = makeWing('dragon-hind', leafOutline(S * 0.97, 0.13 * L, 0.55), dragonDraw('rgba(200,230,240,0.34)'), true);
    return { body, fore, hind };
  });
  addBody(m, g.body, SHINY);
  const fw: THREE.Object3D[] = [], hw: THREE.Object3D[] = [];
  for (const side of [1, -1] as const) {
    fw.push(addWing(m, g.fore.R, g.fore.L, g.fore.mat, [side * 0.05 * L, 0.21 * L, 0.34 * L], side, false));
    hw.push(addWing(m, g.hind.R, g.hind.L, g.hind.mat, [side * 0.05 * L, 0.21 * L, 0.28 * L], side, false));
  }
  addLegs(m, rig, SATIN, legs6('dragonfly', 0x1d2a2a, [0.4 * L, 0.34 * L, 0.28 * L], 0.035 * L, 0.1 * L,
    [[0, 0], [0.04 * L, 0.025 * L], [0.09 * L, -0.1 * L]], [0.012 * L, 0.01 * L, 0.006 * L], 0.35));
  for (const z of [0.14, 0.0, -0.14, -0.28]) seat(m, 0, 0.145 * L + abR(z * L) * 0.95, z * L);
  let ph = rng(Math.floor(a.seed * 733) + 9).range(0, 6.28);
  finishBug(m, rig, [(dt) => {
    const wo = m.wingOpen;
    ph += dt * (50 + 10 * wo);
    // landed: held flat and a touch forward; flying: fast shimmer, fore and hind wings out of phase
    const set = (list: THREE.Object3D[], p: number, sweep: number) => list.forEach((w, i) => {
      const side = i === 0 ? 1 : -1;
      w.rotation.set(0, side * sweep, side * lerp(-0.07, 0.12 + 0.5 * Math.sin(p), wo));
    });
    set(fw, ph, lerp(-0.12, -0.05, wo));
    set(hw, ph + Math.PI, lerp(0.14, 0.12, wo));
  }]);
  return m;
}

// ===========================================================================
// 🦋 BUTTERFLY — scenic airliner. Slim dark body, club antennae, 2 huge patterned wings (each is fore + hind wing in one):
// gulf fritillary orange/black (seed 0), monarch, blue, or swallowtail yellow, picked by seed. Landed: wings straight up and
// closed over the back. Flying: big, slow, floppy flaps.
// ===========================================================================
export const BF_BASE = ['#f08a24', '#e8731c', '#3b8be0', '#f5d63a'];
export function butterfly(a: BArgs): Bug {
  const L = SIZE.butterfly;
  const m = newBug('butterfly', 0.3 * L, L, a.scale);
  const rig = newRig(0.3);
  const variant = Math.abs(Math.floor(a.seed)) % 4;
  const base = a.color !== undefined ? '#' + a.color.toString(16).padStart(6, '0') : BF_BASE[variant];
  const S = 0.5 * SIZE.butterflyWingspan - 0.5;
  const g = cached(`butterfly|${variant}|${base}`, () => {
    const dark = 0x2a1c14;
    const prof: Array<[number, number]> = [[0, -0.5 * L]];
    for (let i = 1; i <= 10; i++) {
      const z = (-0.5 + (0.52 * i) / 10) * L;
      prof.push([0.055 * L * Math.sin(Math.PI * (0.1 + 0.8 * (i / 10)) ** 0.9), z]);
    }
    prof.push([0, 0.04 * L]);
    const body = merge([
      lathe(dark, prof, [0, 0.14 * L, 0], { segs: 8 }),
      ell(dark, [0, 0.15 * L, 0.14 * L], [0.075 * L, 0.08 * L, 0.12 * L], { w: 10, h: 7 }),
      ell(dark, [0, 0.15 * L, 0.34 * L], [0.07 * L, 0.07 * L, 0.065 * L], { w: 9, h: 6 }),
      ...[-1, 1].flatMap((s) => [
        ell(0x0a0a0a, [s * 0.05 * L, 0.17 * L, 0.37 * L], [0.03 * L, 0.04 * L, 0.03 * L], { w: 6, h: 4 }),
        ell(0xffffff, [s * 0.056 * L, 0.19 * L, 0.39 * L], [0.01 * L, 0.01 * L, 0.008 * L], { w: 5, h: 3 }),
        tube(dark, [s * 0.03 * L, 0.2 * L, 0.39 * L], [s * 0.16 * L, 0.34 * L, 0.62 * L], 0.011 * L, 0.008 * L, 4),
        ell(dark, [s * 0.165 * L, 0.35 * L, 0.64 * L], [0.025 * L, 0.025 * L, 0.03 * L], { w: 6, h: 4 }), // club tip
      ]),
    ]);
    const wing = makeWing(`butterfly|${variant}|${base}`,
      smoothOutline([[0, 0], [0.12 * S, 0.28 * S], [0.55 * S, 0.42 * S], [0.95 * S, 0.36 * S], [S, 0.12 * S], [0.84 * S, -0.1 * S], [0.8 * S, -0.3 * S], [0.55 * S, -0.48 * S], [0.25 * S, -0.42 * S], [0.05 * S, -0.18 * S]], 36),
      butterflyDraw(variant, base), false);
    return { body, wing };
  });
  addBody(m, g.body, SATIN);
  const wings: THREE.Object3D[] = [];
  for (const side of [1, -1] as const) wings.push(addWing(m, g.wing.R, g.wing.L, g.wing.mat, [side * 0.04 * L, 0.2 * L, 0.1 * L], side, false));
  addLegs(m, rig, SATIN, legs6('butterfly', 0x2a1c14, [0.2 * L, 0.12 * L, 0.04 * L], 0.04 * L, 0.1 * L,
    [[0, 0], [0.06 * L, 0.03 * L], [0.14 * L, -0.1 * L]], [0.012 * L, 0.01 * L, 0.006 * L], 0.45));
  for (const z of [0.2, 0.06, -0.08]) for (const x of [-0.05, 0.05]) seat(m, x * L, 0.2 * L, z * L);
  let ph = rng(Math.floor(a.seed * 811) + 3).range(0, 6.28);
  finishBug(m, rig, [(dt) => {
    const wo = m.wingOpen;
    ph += dt * 9;
    const flap = 0.15 + 0.85 * Math.sin(ph);          // from about -40° (down) to +60° (up)
    const roll = lerp(1.38, flap, wo);                // landed: nearly vertical, closed
    const sweep = lerp(0.1, 0.08 + 0.22 * Math.cos(ph), wo);
    wings.forEach((w, i) => {
      const side = i === 0 ? 1 : -1;
      w.rotation.set(0, side * sweep, side * roll);
    });
  }]);
  return m;
}
