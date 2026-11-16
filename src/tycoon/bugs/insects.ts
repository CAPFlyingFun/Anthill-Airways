// ============================================================================
// insects.ts — 🐞🐝🪲 the small six-legged bugs: ladybug, bee, beetle, housefly, aphid, pillbug (tycoon bugs, v0.68).
//
// Each builder follows the recipe in parts.ts: body = a few painted solid shapes merged into ONE mesh (built once,
// shared by every bug of that kind), legs = pivots that animateCreature() swings in a tripod gait, wings = thin
// painted shapes the standard buzz opens + flaps. Sizes come from SIZE in ../scale.ts (1 unit = 2 mm).
//
// Look: ONE clean, rounded, saturated, toy-like style (the app icon): glossy shells, simple colours, big readable
// features (eyes, spots, stripes), nothing photoreal.
//
// Triangle counts (default build): ladybug ~1,380 · bee ~1,200 · beetle ~1,900 · housefly ~800 · aphid ~480 · pillbug ~1,100
// ============================================================================
import * as THREE from 'three';
import { PAL } from '../kit';
import { SIZE } from '../scale';
import {
  addBody, addLegs, addWing, cached, ell, finishBug, legChain, legPair, lathe, merge, mix, newBug, newRig,
  rowYaw, seat, spotOn, tripodPhase, tube, MATTE, SATIN, SHINY, type LegSpec,
} from './parts';
import { clearDraw, leafOutline, makeWing } from './wings';
import type { BArgs, Bug } from './types';

/** Six legs in a tripod gait: `rows` = z of each pair, `x` = hip x, `y` = hip height, `chain` = the leg shape. */
function hexLegs(key: string, color: number, rows: number[], x: number, y: number, pts: Array<[number, number]>, rad: number[], knees = false) {
  const pair = legPair(key, () => legChain(color, pts.map(([px, py]) => [px, py, 0] as const), rad, { knees }));
  const specs: LegSpec[] = [];
  rows.forEach((z, row) => {
    for (const side of [-1, 1] as const) {
      specs.push({ at: [side * x, y, z], side, yaw: rowYaw(row, rows.length, side), phase: tripodPhase(row, side), geo: side === 1 ? pair.R : pair.L });
    }
  });
  return specs;
}

// ===========================================================================
// 🐞 LADYBUG — the starter plane. Red glossy dome shell split down the middle (the two halves are separate and
// LIFT OPEN when she flies), black spots, black head with white eyes, black pronotum with white patches, pale-blue wings.
// ===========================================================================
export function ladybug(a: BArgs): Bug {
  const L = SIZE.ladybug;
  const m = newBug('ladybug', 0.45 * L, L, a.scale);
  const rig = newRig(0.3);
  const red = a.color ?? PAL.ladybugRed;
  const hinge: [number, number, number] = [0, 0.36 * L, 0.26 * L];
  const g = cached(`ladybug|${red}`, () => {
    const c: [number, number, number] = [0, 0.15 * L, -0.1 * L];
    const r: [number, number, number] = [0.38 * L, 0.3 * L, 0.4 * L];
    const half = (side: 1 | -1) => {
      const parts = [ell(red, c, r, { w: 16, h: 10, ...(side === 1 ? { clipMinX: 0.014 * L } : { clipMaxX: -0.014 * L }) })];
      const sp: Array<[number, number, number]> = [[0.2, 0.14, 0.065], [0.27, -0.1, 0.065], [0.13, -0.27, 0.055]];
      for (const [x, z, s] of sp) parts.push(spotOn(0x1a1a1a, c, r, side * x * L, z * L, s * L, s * 0.72 * L, { w: 8, h: 5 }));
      const geo = merge(parts);
      geo.translate(-hinge[0], -hinge[1], -hinge[2]);
      return geo;
    };
    const body = merge([
      ell(0x1a1a1a, [0, 0.14 * L, -0.08 * L], [0.34 * L, 0.12 * L, 0.38 * L], { w: 10, h: 6 }), // black underbody
      ell(0x1a1a1a, [0, 0.19 * L, 0.33 * L], [0.28 * L, 0.15 * L, 0.1 * L], { w: 12, h: 7 }),     // pronotum
      ell(0x1a1a1a, [0, 0.14 * L, 0.43 * L], [0.19 * L, 0.11 * L, 0.09 * L], { w: 10, h: 6 }),   // head
      spotOn(0xffffff, [0, 0.19 * L, 0.33 * L], [0.28 * L, 0.15 * L, 0.1 * L], 0.17 * L, 0.35 * L, 0.06 * L, 0.045 * L),
      spotOn(0xffffff, [0, 0.19 * L, 0.33 * L], [0.28 * L, 0.15 * L, 0.1 * L], -0.17 * L, 0.35 * L, 0.06 * L, 0.045 * L),
      ...[-1, 1].flatMap((s) => [
        ell(0xffffff, [s * 0.12 * L, 0.17 * L, 0.47 * L], [0.055 * L, 0.055 * L, 0.05 * L], { w: 8, h: 5 }), // white eyes
        ell(0x1a1a1a, [s * 0.13 * L, 0.175 * L, 0.51 * L], [0.025 * L, 0.025 * L, 0.02 * L], { w: 6, h: 4 }),
        tube(0x1a1a1a, [s * 0.05 * L, 0.2 * L, 0.5 * L], [s * 0.15 * L, 0.27 * L, 0.6 * L], 0.014 * L, 0.01 * L, 4),
      ]),
    ]);
    const wing = makeWing('ladybug-wing', leafOutline(0.85 * L, 0.26 * L, 0.5), clearDraw('rgba(185,222,255,0.78)', 'rgba(60,95,140,0.85)'), true);
    return { body, R: half(1), Lh: half(-1), wing };
  });
  addBody(m, g.body, SATIN);
  // the two shell halves, each on a hinge at the front so they can lift open
  const el: THREE.Mesh[] = [];
  for (const side of [1, -1] as const) {
    const mesh = new THREE.Mesh(side === 1 ? g.R : g.Lh, SHINY);
    mesh.position.set(...hinge);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    m.bob.add(mesh);
    el.push(mesh);
  }
  for (const side of [1, -1] as const) {
    rig.hideWhenFolded.push(addWing(m, g.wing.R, g.wing.L, g.wing.mat, [side * 0.05 * L, 0.24 * L, 0.15 * L], side, true));
  }
  addLegs(m, rig, SATIN, hexLegs('ladybug', 0x1a1a1a, [0.22 * L, 0.02 * L, -0.2 * L], 0.15 * L, 0.12 * L,
    [[0, 0], [0.11 * L, 0.04 * L], [0.24 * L, -0.12 * L]], [0.032 * L, 0.026 * L, 0.018 * L]));
  seat(m, 0, 0.45 * L, 0.0 * L);
  seat(m, 0, 0.44 * L, -0.24 * L);
  finishBug(m, rig, [() => {
    const o = m.wingOpen;
    el[0].rotation.set(0, -0.85 * o, 0.28 * o);   // right half swings out + up
    el[1].rotation.set(0, 0.85 * o, -0.28 * o);   // left half
  }]);
  return m;
}

// ===========================================================================
// 🐝 BEE — the passenger shuttle. Fuzzy yellow/black banded abdomen, brown-yellow thorax, big dark eyes, stinger,
// two clear veined wings. (Matte material so it looks fuzzy, not shiny.)
// ===========================================================================
export function bee(a: BArgs): Bug {
  const L = SIZE.honeyBee;
  const m = newBug('bee', 0.48 * L, L, a.scale);
  const rig = newRig(0.3);
  const yel = a.color ?? PAL.beeYellow;
  const abR = (z: number) => { // abdomen radius at z (also used to put the seats on its back)
    const t = (z / L + 0.46) / 0.44; // 0 at the tail .. 1 at the waist
    return 0.2 * L * Math.sin(Math.PI * Math.min(1, Math.max(0.04, t * 0.9 + 0.05)) ** 0.85);
  };
  const g = cached(`bee|${yel}`, () => {
    const n = 20;
    const prof: Array<[number, number]> = [];
    for (let i = 0; i <= n; i++) {
      const z = (-0.46 + (0.44 * i) / n) * L;
      prof.push([i === 0 ? 0 : abR(z), z]);
    }
    prof.push([0, -0.02 * L]);
    const band = (_x: number, _y: number, z: number) => {
      const k = Math.floor(((z / L + 0.46) / 0.44) * 5.2);
      return k % 2 === 0 ? yel : 0x1e1a14;
    };
    const body = merge([
      lathe(band, prof, [0, 0.28 * L, 0], { segs: 10 }),
      tube(0x1e1a14, [0, 0.28 * L, -0.45 * L], [0, 0.26 * L, -0.52 * L], 0.03 * L, 0.004 * L, 4), // stinger
      ell((x, y) => mix(0x8a5a1c, 0xe0a52a, (y / L - 0.3) * 4 + 0.2), [0, 0.3 * L, 0.14 * L], [0.17 * L, 0.17 * L, 0.16 * L], { w: 12, h: 8 }), // thorax
      ell(0x2a1a0c, [0, 0.31 * L, 0.37 * L], [0.1 * L, 0.1 * L, 0.09 * L], { w: 10, h: 7 }), // head
      ...[-1, 1].flatMap((s) => [
        ell(0x3a2c20, [s * 0.1 * L, 0.34 * L, 0.385 * L], [0.055 * L, 0.075 * L, 0.07 * L], { w: 9, h: 6 }), // big eyes
        ell(0xffffff, [s * 0.12 * L, 0.375 * L, 0.425 * L], [0.024 * L, 0.024 * L, 0.018 * L], { w: 6, h: 4 }), // sparkle
        tube(0x2a1a0c, [s * 0.04 * L, 0.41 * L, 0.44 * L], [s * 0.1 * L, 0.5 * L, 0.54 * L], 0.014 * L, 0.01 * L, 4),
      ]),
    ]);
    const wing = makeWing('bee-wing', leafOutline(0.55 * L, 0.22 * L, 0.5), clearDraw('rgba(215,236,255,0.7)', 'rgba(70,80,100,0.8)', 5, 3), true);
    return { body, wing };
  });
  addBody(m, g.body, MATTE);
  for (const side of [1, -1] as const) addWing(m, g.wing.R, g.wing.L, g.wing.mat, [side * 0.06 * L, 0.45 * L, 0.18 * L], side, true);
  addLegs(m, rig, MATTE, hexLegs('bee', 0x3a2a14, [0.2 * L, 0.12 * L, 0.04 * L], 0.09 * L, 0.2 * L,
    [[0, 0], [0.1 * L, 0.04 * L], [0.2 * L, -0.2 * L]], [0.022 * L, 0.018 * L, 0.012 * L]));
  for (const z of [-0.04, -0.2, -0.34]) seat(m, 0, 0.28 * L + abR(z * L) , z * L);
  finishBug(m, rig);
  return m;
}

// ===========================================================================
// 🪲 BEETLE — the cargo hauler. Shiny dark shell (green / blue / bronze by seed) split down the middle,
// a darker pronotum + head with little mandibles, six cargo spots on the shell, smoky wings that unfold from under it.
// ===========================================================================
const BEETLE_COLOURS = [0x1f8a52, 0x2a5fd0, 0xb97428];
export function beetle(a: BArgs): Bug {
  const L = SIZE.beetle;
  const m = newBug('beetle', 0.42 * L, L, a.scale);
  const rig = newRig(0.3);
  const shell = a.color ?? BEETLE_COLOURS[Math.abs(Math.floor(a.seed)) % BEETLE_COLOURS.length];
  const dark = mix(shell, 0x000000, 0.45);
  const c: [number, number, number] = [0, 0.2 * L, -0.1 * L];
  const r: [number, number, number] = [0.27 * L, 0.21 * L, 0.4 * L];
  const g = cached(`beetle|${shell}`, () => {
    const body = merge([
      ell(shell, c, r, { w: 14, h: 9, clipMinX: 0.012 * L }),
      ell(shell, c, r, { w: 14, h: 9, clipMaxX: -0.012 * L }),
      ell(0x15110e, [0, 0.16 * L, -0.02 * L], [0.25 * L, 0.1 * L, 0.42 * L], { w: 10, h: 6 }),   // dark underbody (shows in the seam)
      ell(dark, [0, 0.21 * L, 0.28 * L], [0.22 * L, 0.14 * L, 0.1 * L], { w: 12, h: 7 }),       // pronotum
      ell(dark, [0, 0.18 * L, 0.39 * L], [0.12 * L, 0.09 * L, 0.08 * L], { w: 10, h: 6 }),      // head
      ...[-1, 1].flatMap((s) => [
        ell(0xffffff, [s * 0.075 * L, 0.2 * L, 0.43 * L], [0.03 * L, 0.035 * L, 0.03 * L], { w: 7, h: 5 }),
        ell(0x111111, [s * 0.08 * L, 0.2 * L, 0.455 * L], [0.016 * L, 0.02 * L, 0.012 * L], { w: 5, h: 4 }),
        tube(0x15110e, [s * 0.05 * L, 0.15 * L, 0.44 * L], [s * 0.025 * L, 0.14 * L, 0.5 * L], 0.02 * L, 0.006 * L, 4), // mandibles
        tube(0x15110e, [s * 0.05 * L, 0.24 * L, 0.42 * L], [s * 0.1 * L, 0.3 * L, 0.5 * L], 0.011 * L, 0.008 * L, 4),   // antennae
      ]),
    ]);
    const wing = makeWing('beetle-wing', leafOutline(0.62 * L, 0.2 * L, 0.5), clearDraw('rgba(120,110,100,0.4)', 'rgba(60,50,45,0.7)', 4, 2), true);
    return { body, wing };
  });
  addBody(m, g.body, SHINY);
  for (const side of [1, -1] as const) {
    rig.hideWhenFolded.push(addWing(m, g.wing.R, g.wing.L, g.wing.mat, [side * 0.1 * L, 0.2 * L, 0.12 * L], side, true));
  }
  addLegs(m, rig, SATIN, hexLegs('beetle', 0x15110e, [0.24 * L, 0.0, -0.24 * L], 0.18 * L, 0.15 * L,
    [[0, 0], [0.12 * L, 0.05 * L], [0.26 * L, -0.15 * L]], [0.03 * L, 0.024 * L, 0.014 * L], true));
  for (const x of [-0.11, 0.11]) {
    for (const z of [0.0, -0.17, -0.34]) {
      const k = 1 - (x * L) ** 2 / r[0] ** 2 - (z * L - c[2]) ** 2 / r[2] ** 2;
      seat(m, x * L, c[1] + r[1] * Math.sqrt(Math.max(0.01, k)), z * L);
    }
  }
  finishBug(m, rig);
  return m;
}

// ===========================================================================
// 🪰 HOUSEFLY — wild traffic. Grey striped thorax, banded abdomen, BIG red eyes, two clear wings.
// ===========================================================================
export function housefly(a: BArgs): Bug {
  const L = SIZE.houseFly;
  const m = newBug('housefly', 0.44 * L, L, a.scale);
  const rig = newRig(0.3);
  const g = cached('housefly', () => {
    const stripe = (x: number) => (Math.abs(x) < 0.045 * L || (Math.abs(x) > 0.1 * L && Math.abs(x) < 0.13 * L) ? 0x2e3033 : 0x8b8e91);
    const body = merge([
      ell((x) => stripe(x), [0, 0.3 * L, 0.1 * L], [0.19 * L, 0.18 * L, 0.2 * L], { w: 12, h: 7 }),
      ell((_x, _y, z) => (Math.floor((z / L + 0.5) * 7) % 2 ? 0x4a4c4f : 0x8a8672), [0, 0.27 * L, -0.26 * L], [0.2 * L, 0.16 * L, 0.27 * L], { w: 10, h: 7 }),
      ell(0xc9b88d, [0, 0.27 * L, 0.34 * L], [0.11 * L, 0.1 * L, 0.08 * L], { w: 8, h: 6 }),
      ...[-1, 1].map((s) => ell(0xc4372b, [s * 0.08 * L, 0.31 * L, 0.36 * L], [0.075 * L, 0.095 * L, 0.08 * L], { w: 8, h: 6 })),
      tube(0x3a3a3a, [0, 0.22 * L, 0.4 * L], [0, 0.14 * L, 0.46 * L], 0.025 * L, 0.018 * L, 4), // proboscis
    ]);
    const wing = makeWing('fly-wing', leafOutline(0.7 * L, 0.26 * L, 0.5), clearDraw('rgba(215,235,255,0.4)', 'rgba(70,80,95,0.65)', 4, 2), true);
    return { body, wing };
  });
  addBody(m, g.body, SATIN);
  for (const side of [1, -1] as const) addWing(m, g.wing.R, g.wing.L, g.wing.mat, [side * 0.07 * L, 0.46 * L, 0.14 * L], side, true);
  addLegs(m, rig, SATIN, hexLegs('housefly', 0x2a2a2a, [0.22 * L, 0.1 * L, -0.02 * L], 0.1 * L, 0.18 * L,
    [[0, 0], [0.1 * L, 0.05 * L], [0.22 * L, -0.18 * L]], [0.022 * L, 0.018 * L, 0.012 * L]));
  finishBug(m, rig);
  return m;
}

// ===========================================================================
// 🟢 APHID — tiny passenger. Soft green pear shape, two little tail tubes (cornicles), big dark eyes, thin antennae.
// ===========================================================================
export function aphid(a: BArgs): Bug {
  const L = SIZE.aphid;
  const m = newBug('aphid', 0.4 * L, L, a.scale);
  const rig = newRig(0.25);
  const green = a.color ?? 0x8fd45a;
  const g = cached(`aphid|${green}`, () => merge([
    ell(green, [0, 0.22 * L, -0.12 * L], [0.27 * L, 0.22 * L, 0.34 * L], { w: 10, h: 7 }),
    ell(mix(green, 0xffffff, 0.15), [0, 0.2 * L, 0.28 * L], [0.16 * L, 0.14 * L, 0.14 * L], { w: 9, h: 6 }),
    ...[-1, 1].flatMap((s) => [
      ell(0x16210f, [s * 0.1 * L, 0.24 * L, 0.36 * L], [0.05 * L, 0.06 * L, 0.05 * L], { w: 6, h: 4 }),
      tube(mix(green, 0x000000, 0.35), [s * 0.1 * L, 0.26 * L, -0.38 * L], [s * 0.1 * L, 0.3 * L, -0.5 * L], 0.035 * L, 0.02 * L, 4), // cornicles
      tube(mix(green, 0xffffff, 0.3), [s * 0.04 * L, 0.3 * L, 0.38 * L], [s * 0.2 * L, 0.42 * L, 0.52 * L], 0.016 * L, 0.01 * L, 3),
    ]),
  ]));
  addBody(m, g, SATIN);
  addLegs(m, rig, SATIN, hexLegs('aphid', mix(green, 0xffffff, 0.2), [0.18 * L, 0.0, -0.2 * L], 0.14 * L, 0.1 * L,
    [[0, 0], [0.09 * L, 0.03 * L], [0.2 * L, -0.1 * L]], [0.02 * L, 0.016 * L, 0.01 * L]));
  finishBug(m, rig);
  return m;
}

// ===========================================================================
// 🐛 PILLBUG — wild traffic. Grey-blue segmented armour (a ridged half-dome), small head with antennae, tiny legs.
// (Curling into a ball can be added later: the body is already a single closed dome.)
// ===========================================================================
export function pillbug(a: BArgs): Bug {
  const L = SIZE.pillbug;
  const m = newBug('pillbug', 0.28 * L, L, a.scale);
  const rig = newRig(0.25);
  const col = a.color ?? 0x7b8896;
  const g = cached(`pillbug|${col}`, () => {
    const prof: Array<[number, number]> = [];
    const n = 42;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const dome = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
      const groove = 0.5 * (1 + Math.cos(2 * Math.PI * 7 * t));
      prof.push([0.27 * L * dome * (1 - 0.07 * groove ** 3), (-0.48 + 0.86 * t) * L]);
    }
    return merge([
      lathe((_x, y) => mix(col, 0xdfe6ee, (y / L - 0.12) * 1.4), prof, [0, 0.14 * L, 0], { segs: 10, sy: 0.72 }),
      ell(mix(col, 0x000000, 0.2), [0, 0.12 * L, 0.42 * L], [0.14 * L, 0.08 * L, 0.08 * L], { w: 8, h: 5 }),
      ...[-1, 1].flatMap((s) => [
        ell(0x111111, [s * 0.1 * L, 0.15 * L, 0.46 * L], [0.03 * L, 0.03 * L, 0.025 * L], { w: 6, h: 4 }),
        tube(mix(col, 0xffffff, 0.2), [s * 0.05 * L, 0.14 * L, 0.48 * L], [s * 0.12 * L, 0.2 * L, 0.6 * L], 0.014 * L, 0.01 * L, 3),
        tube(mix(col, 0x000000, 0.25), [s * 0.06 * L, 0.1 * L, -0.46 * L], [s * 0.09 * L, 0.1 * L, -0.54 * L], 0.025 * L, 0.012 * L, 4), // uropods
      ]),
    ]);
  });
  addBody(m, g, SATIN);
  addLegs(m, rig, SATIN, hexLegs('pillbug', mix(col, 0xffffff, 0.15), [0.26 * L, 0.0, -0.26 * L], 0.14 * L, 0.08 * L,
    [[0, 0], [0.07 * L, 0.02 * L], [0.14 * L, -0.08 * L]], [0.025 * L, 0.02 * L, 0.012 * L]));
  finishBug(m, rig);
  return m;
}
