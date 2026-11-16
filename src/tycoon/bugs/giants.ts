// ============================================================================
// giants.ts — 🦎🐸 the "giants": anole, gecko and toad (tycoon bugs, v0.68). There are NO dinosaurs.
//
// To an ant these are enormous. All three have 4 legs (pivots, swung by animateCreature in a diagonal walk;
// the toad hops with its pairs together) and use `extra` for their own life:
//   anole : green, pointed face, long tail that SWAYS, and a pink DEWLAP (throat fan) that pops out now and then
//   gecko : pale tan with brown blotches, huge golden eyes, sticky round toe pads, a plump banded tail that sways
//   toad  : warty brown, golden eyes, throat + sides BREATHE, and it hops when it moves
// Tails are chains of pivot segments (each its own small mesh) so they can wave like a real tail.
// Triangle counts (default build): anole ~2,300 · gecko ~2,900 · toad ~3,300
// ============================================================================
import * as THREE from 'three';
import { rng } from '../kit';
import { SIZE } from '../scale';
import {
  addBody, addLegs, cached, ell, finishBug, legChain, legPair, merge, mix, newBug, newRig, rowYaw, spotOn, tube, SKIN, type LegSpec, type Rig,
} from './parts';
import type { BArgs, Bug } from './types';

const DEWLAP_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide });

/** Diagonal walk for 4 legs: front-left + back-right together (toad: pairs together = a hop). */
function legs4(key: string, rows: Array<{ z: number; x: number; y: number; spread: number; build: () => THREE.BufferGeometry }>, hop = false) {
  const specs: LegSpec[] = [];
  rows.forEach((r, row) => {
    const pair = legPair(`${key}|${row}`, r.build);
    for (const side of [-1, 1] as const) {
      const diagonal = (row === 0) === (side === -1) ? 0 : Math.PI;
      specs.push({
        at: [side * r.x, r.y, r.z],
        side,
        yaw: rowYaw(row, 2, side, r.spread),
        phase: hop ? (row === 0 ? 0 : Math.PI * 0.8) : diagonal,
        geo: side === 1 ? pair.R : pair.L,
      });
    }
  });
  return specs;
}

/** A tail made of `n` nested pivot segments (waves from the root to the tip). Returns the pivots to wiggle. */
function addTail(m: Bug, root: THREE.Vector3, len: number, radii: number[], colour: (i: number) => (x: number, y: number, z: number) => number, mat: THREE.Material, key: string) {
  const n = radii.length - 1;
  const segLen = len / n;
  const pivots: THREE.Group[] = [];
  let parent: THREE.Object3D = m.bob;
  for (let i = 0; i < n; i++) {
    const geo = cached(`tail|${key}|${i}`, () => merge([
      tube(colour(i), [0, 0, 0], [0, 0, -segLen * 1.04], radii[i], radii[i + 1], 7),
      ell(colour(i), [0, 0, 0], [radii[i], radii[i], radii[i]], { w: 7, h: 5 }), // round joint so bends stay smooth
    ]));
    const pivot = new THREE.Group();
    if (i === 0) pivot.position.copy(root);
    else pivot.position.set(0, 0, -segLen);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    pivot.add(mesh);
    parent.add(pivot);
    pivots.push(pivot);
    parent = pivot;
  }
  return pivots;
}

// ===========================================================================
// 🦎 ANOLE — bright green, pink dewlap, pointed snout, gold eyes, long swaying tail.
// ===========================================================================
export function anole(a: BArgs): Bug {
  const L = SIZE.anole;
  const m = newBug('anole', 0.11 * L, L, a.scale);
  const rig = newRig(0.3);
  const green = a.color ?? 0x25a86a;
  const skin = (x: number, y: number) => mix(0xdbe7a6, mix(green, 0x14603a, Math.max(0, (y / L - 0.06) * 14)), Math.min(1, (y / L - 0.035) * 22));
  const g = cached(`anole|${green}`, () => {
    const body = merge([
      ell(skin, [0, 0.062 * L, 0.24 * L], [0.034 * L, 0.031 * L, 0.15 * L], { w: 12, h: 8 }),    // trunk
      ell(skin, [0, 0.07 * L, 0.4 * L], [0.027 * L, 0.026 * L, 0.05 * L], { w: 10, h: 7 }),      // head
      ell(skin, [0, 0.063 * L, 0.455 * L], [0.017 * L, 0.015 * L, 0.05 * L], { w: 9, h: 6 }),    // snout
      ell(skin, [0, 0.067 * L, 0.355 * L], [0.022 * L, 0.024 * L, 0.04 * L], { w: 8, h: 6 }),    // neck
      ...[-1, 1].flatMap((s) => [
        ell(0xd9a441, [s * 0.021 * L, 0.086 * L, 0.41 * L], [0.012 * L, 0.012 * L, 0.012 * L], { w: 8, h: 6 }),   // gold eye ring
        ell(0x111111, [s * 0.027 * L, 0.088 * L, 0.413 * L], [0.007 * L, 0.007 * L, 0.007 * L], { w: 6, h: 4 }),   // pupil
        ell(0x3f7a2a, [s * 0.009 * L, 0.07 * L, 0.485 * L], [0.0025 * L, 0.0025 * L, 0.003 * L], { w: 4, h: 3 }),  // nostril
      ]),
    ]);
    const dew = (() => {
      const pts = [[0, 0], [0.012, -0.028], [0.04, -0.05], [0.07, -0.048], [0.085, -0.02], [0.08, 0]]
        .map(([z, y]) => new THREE.Vector2(z * L, y * L));
      const spline = new THREE.SplineCurve(pts).getPoints(14);
      const half = new THREE.ShapeGeometry(new THREE.Shape(spline));
      half.rotateY(-Math.PI / 2); // shape x -> forward (+z), flat in the side view
      const w1 = half.clone(); w1.rotateZ(0.32);
      const w2 = half.clone(); w2.rotateZ(-0.32);
      const col = (g2: THREE.BufferGeometry) => {
        g2.deleteAttribute('uv');
        const p = g2.getAttribute('position');
        const arr = new Float32Array(p.count * 3);
        const c = new THREE.Color();
        for (let i = 0; i < p.count; i++) { c.setHex(mix(0xff7d9a, 0xff3f6c, -p.getY(i) / (0.05 * L))); c.toArray(arr, i * 3); }
        g2.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        return g2;
      };
      return merge([col(w1), col(w2)]);
    })();
    return { body, dew };
  });
  addBody(m, g.body, SKIN);
  const legBuild = () => {
    const toes: THREE.BufferGeometry[] = [];
    const f: [number, number, number] = [0.062 * L, -0.052 * L, 0];
    for (const [dx, dz] of [[0.012, 0.034], [0.0, 0.04], [-0.01, 0.033]]) {
      toes.push(tube(0x4f9a30, f, [f[0] + dx * L, f[1], f[2] + dz * L], 0.006 * L, 0.003 * L, 4));
    }
    return merge([legChain(0x57a836, [[0, 0, 0], [0.05 * L, 0.004 * L, 0], f], [0.012 * L, 0.009 * L, 0.006 * L], { knees: true }), ...toes]);
  };
  addLegs(m, rig, SKIN, legs4('anole', [
    { z: 0.34 * L, x: 0.03 * L, y: 0.054 * L, spread: 0.35, build: legBuild },
    { z: 0.15 * L, x: 0.03 * L, y: 0.054 * L, spread: 0.3, build: legBuild },
  ]));
  const tail = addTail(m, new THREE.Vector3(0, 0.058 * L, 0.1 * L), 0.6 * L, [0.029 * L, 0.021 * L, 0.014 * L, 0.0075 * L, 0.001 * L],
    (i) => (x, y) => mix(green, 0x14603a, 0.15 * i), SKIN, `anole|${green}`);
  // the dewlap: hidden against the throat until it pops out
  const dew = new THREE.Mesh(g.dew, DEWLAP_MAT);
  dew.position.set(0, 0.046 * L, 0.37 * L);
  dew.visible = false;
  m.bob.add(dew);
  const R = rng(Math.floor(a.seed * 131) + 7);
  let t = R.range(0, 20);
  let nextPop = R.range(1.5, 4);
  let popT = -1; // seconds since this pop started (-1 = not popping)
  /** Pop the dewlap right now (the game can call this, e.g. when the anole spots an ant): m.root.userData.popDewlap() */
  m.root.userData.popDewlap = () => { if (popT < 0) popT = 0; };
  finishBug(m, rig, [(dt) => {
    t += dt;
    const sway = 0.2 + 0.3 * m.walkBlend;
    tail.forEach((p, i) => { p.rotation.y = Math.sin(t * 2.6 - i * 0.9) * sway * (0.6 + i * 0.25); });
    m.bob.rotation.y = Math.sin(m.walkT) * 0.07 * m.walkBlend; // little S-curve of the spine while walking
    // dewlap: out in 0.25 s, held for 0.9 s, back in 0.3 s, then wait 3-7 s
    nextPop -= dt;
    if (popT < 0 && nextPop <= 0) { popT = 0; nextPop = R.range(3, 7); }
    let k = 0;
    if (popT >= 0) {
      popT += dt;
      k = popT < 0.25 ? popT / 0.25 : popT < 1.15 ? 1 : 1 - (popT - 1.15) / 0.3;
      if (popT > 1.45) { popT = -1; k = 0; }
    }
    dew.visible = k > 0.02;
    dew.scale.set(1, 0.1 + 0.9 * k, 0.1 + 0.9 * k);
  }]);
  return m;
}

// ===========================================================================
// 🦎 GECKO — pale tan with brown blotches, huge golden eyes with slit pupils, round sticky toe pads, plump banded tail.
// ===========================================================================
export function gecko(a: BArgs): Bug {
  const L = SIZE.gecko;
  const m = newBug('gecko', 0.12 * L, L, a.scale);
  const rig = newRig(0.3);
  const tan = a.color ?? 0xe3c48c;
  const blot = 0x8f5f3a;
  const g = cached(`gecko|${tan}`, () => {
    const bc: [number, number, number] = [0, 0.066 * L, 0.2 * L];
    const br: [number, number, number] = [0.072 * L, 0.052 * L, 0.2 * L];
    const R = rng(23);
    const spots = Array.from({ length: 13 }, () => spotOn(blot, bc, br, R.range(-0.055, 0.055) * L, R.range(0.05, 0.34) * L, R.range(0.014, 0.024) * L, 0.012 * L, { w: 6, h: 4 }));
    return merge([
      ell((x, y) => (y < 0.05 * L ? mix(tan, 0xffffff, 0.45) : tan), bc, br, { w: 12, h: 8 }),
      ell(tan, [0, 0.07 * L, 0.4 * L], [0.062 * L, 0.04 * L, 0.075 * L], { w: 11, h: 7 }),          // head
      ell(tan, [0, 0.066 * L, 0.46 * L], [0.04 * L, 0.028 * L, 0.04 * L], { w: 9, h: 6 }),          // snout
      ...spots,
      ...[-1, 1].flatMap((s) => [
        ell(0xf0b830, [s * 0.047 * L, 0.098 * L, 0.415 * L], [0.027 * L, 0.027 * L, 0.027 * L], { w: 9, h: 7 }),  // BIG eyes
        ell(0x16120c, [s * 0.066 * L, 0.1 * L, 0.42 * L], [0.007 * L, 0.022 * L, 0.011 * L], { w: 5, h: 5 }),     // slit pupil
        ell(0x7a5230, [s * 0.015 * L, 0.075 * L, 0.5 * L], [0.004 * L, 0.004 * L, 0.004 * L], { w: 4, h: 3 }),
      ]),
    ]);
  });
  addBody(m, g, SKIN);
  const legBuild = () => {
    const f: [number, number, number] = [0.095 * L, -0.047 * L, 0];
    const parts: THREE.BufferGeometry[] = [legChain(tan, [[0, 0, 0], [0.07 * L, 0.002 * L, 0], f], [0.017 * L, 0.012 * L, 0.009 * L], { knees: true })];
    for (let i = 0; i < 5; i++) { // five toes, each with a round sticky pad
      const ang = (i - 2) * 0.42;
      const end: [number, number, number] = [f[0] + Math.sin(ang * 0.5) * 0.02 * L, f[1], f[2] + Math.cos(ang) * 0.042 * L + Math.sin(ang) * 0.0 * L];
      end[0] = f[0] + Math.sin(ang) * 0.036 * L;
      parts.push(tube(tan, f, end, 0.007 * L, 0.005 * L, 4));
      parts.push(ell(0xf3e6c6, [end[0], end[1] - 0.001 * L, end[2] + 0.004 * L], [0.0105 * L, 0.0045 * L, 0.0125 * L], { w: 7, h: 4 }));
    }
    return merge(parts);
  };
  addLegs(m, rig, SKIN, legs4('gecko', [
    { z: 0.34 * L, x: 0.06 * L, y: 0.05 * L, spread: 0.35, build: legBuild },
    { z: 0.1 * L, x: 0.06 * L, y: 0.05 * L, spread: 0.3, build: legBuild },
  ]));
  const tail = addTail(m, new THREE.Vector3(0, 0.06 * L, 0.0), 0.5 * L, [0.052 * L, 0.04 * L, 0.028 * L, 0.014 * L, 0.002 * L],
    (i) => (_x, _y, z) => (Math.floor(z / (0.03 * L) + i * 3) % 2 === 0 ? tan : mix(tan, blot, 0.55)), SKIN, `gecko|${tan}`);
  let t = rng(Math.floor(a.seed * 53) + 1).range(0, 20);
  finishBug(m, rig, [(dt) => {
    t += dt;
    const sway = 0.16 + 0.3 * m.walkBlend;
    tail.forEach((p, i) => { p.rotation.y = Math.sin(t * 2.2 - i * 0.8) * sway * (0.6 + i * 0.25); });
    m.bob.rotation.y = Math.sin(m.walkT) * 0.06 * m.walkBlend;
  }]);
  return m;
}

// ===========================================================================
// 🐸 TOAD — squat, warty brown, wide mouth, gold eyes on top of the head, glands behind them, breathing throat, hops.
// ===========================================================================
export function toad(a: BArgs): Bug {
  const L = SIZE.toad;
  const m = newBug('toad', 0.36 * L, L, a.scale);
  const rig = newRig(0.2);
  const brown = a.color ?? 0x8d6b3d;
  const g = cached(`toad|${brown}`, () => {
    const bc: [number, number, number] = [0, 0.17 * L, -0.02 * L];
    const br: [number, number, number] = [0.26 * L, 0.17 * L, 0.34 * L];
    const R = rng(31);
    const warts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) {
      warts.push(spotOn(R.next() < 0.3 ? 0xa85f3a : mix(brown, 0x3d2c14, 0.4), bc, br, R.range(-0.2, 0.2) * L, R.range(-0.3, 0.2) * L, R.range(0.022, 0.04) * L, 0.016 * L, { w: 6, h: 4 }));
    }
    const skin = (_x: number, y: number) => (y < 0.11 * L ? 0xdccaa0 : mix(brown, 0x5a4326, Math.max(0, (y / L - 0.2) * 3)));
    const body = merge([
      ell(skin, bc, br, { w: 14, h: 9 }),
      ell(skin, [0, 0.18 * L, 0.3 * L], [0.22 * L, 0.13 * L, 0.17 * L], { w: 12, h: 8 }),               // wide head
      ...warts,
      ...[-1, 1].flatMap((s) => [
        ell(0xd9a02b, [s * 0.1 * L, 0.3 * L, 0.33 * L], [0.058 * L, 0.055 * L, 0.052 * L], { w: 10, h: 7 }),        // gold eyes up top
        ell(0x15110a, [s * 0.1 * L, 0.31 * L, 0.375 * L], [0.045 * L, 0.012 * L, 0.012 * L], { w: 6, h: 4 }),       // horizontal pupil
        ell(mix(brown, 0x3d2c14, 0.45), [s * 0.15 * L, 0.27 * L, 0.2 * L], [0.05 * L, 0.035 * L, 0.08 * L], { w: 8, h: 6, rot: [0, s * 0.3, 0] }), // glands
        ell(0x2a1d0e, [s * 0.03 * L, 0.26 * L, 0.455 * L], [0.007 * L, 0.007 * L, 0.007 * L], { w: 4, h: 3 }),       // nostrils
      ]),
      // the wide mouth line: a dark curve across the front of the face
      ...[[-0.2, 0.28], [-0.12, 0.4], [0, 0.45], [0.12, 0.4], [0.2, 0.28]].slice(0, 4).map(([x, z], i, arr) => {
        const n = [[-0.2, 0.28], [-0.12, 0.4], [0, 0.45], [0.12, 0.4], [0.2, 0.28]][i + 1];
        return tube(0x3b2a18, [x * L, 0.15 * L, z * L], [n[0] * L, 0.15 * L, n[1] * L], 0.007 * L, 0.007 * L, 4);
      }),
    ]);
    const throat = ell(0xe6d4a6, [0, 0.12 * L, 0.34 * L], [0.12 * L, 0.06 * L, 0.09 * L], { w: 9, h: 6 });
    return { body, throat };
  });
  const bodyMesh = addBody(m, g.body, SKIN);
  const throat = addBody(m, g.throat, SKIN);
  const frontBuild = () => {
    const f: [number, number, number] = [0.1 * L, -0.12 * L, 0.03 * L];
    const parts = [legChain(brown, [[0, 0, 0], [0.08 * L, -0.02 * L, 0], f], [0.035 * L, 0.025 * L, 0.018 * L], { knees: true })];
    for (let i = 0; i < 4; i++) parts.push(tube(0x7b5a30, f, [f[0] + (i - 1.5) * 0.015 * L, f[1], f[2] + 0.05 * L], 0.011 * L, 0.007 * L, 4));
    return merge(parts);
  };
  const hindBuild = () => {
    const f: [number, number, number] = [0.27 * L, -0.15 * L, 0];
    const parts = [
      legChain(brown, [[0, 0, 0], [0.12 * L, 0.04 * L, 0], [0.2 * L, -0.02 * L, 0], f], [0.065 * L, 0.045 * L, 0.025 * L, 0.014 * L], { knees: true }),
      ell(brown, [0.07 * L, 0.01 * L, 0], [0.1 * L, 0.07 * L, 0.07 * L], { w: 8, h: 6 }), // fat thigh
    ];
    for (let i = 0; i < 4; i++) parts.push(tube(0x7b5a30, f, [f[0] + (i - 1.5) * 0.02 * L, f[1], f[2] + 0.075 * L], 0.013 * L, 0.008 * L, 4));
    return merge(parts);
  };
  addLegs(m, rig, SKIN, legs4('toad', [
    { z: 0.2 * L, x: 0.2 * L, y: 0.14 * L, spread: 0.25, build: frontBuild },
    { z: -0.22 * L, x: 0.21 * L, y: 0.16 * L, spread: 0.2, build: hindBuild },
  ], true));
  m.legAmp = 0.55;
  let t = rng(Math.floor(a.seed * 17) + 4).range(0, 20);
  finishBug(m, rig, [(dt) => {
    t += dt;
    const br = 0.5 + 0.5 * Math.sin(t * 2.4);           // breathing: the throat swells and falls
    throat.scale.set(1 + 0.16 * br, 1 + 0.45 * br, 1 + 0.25 * br);
    bodyMesh.scale.set(1 + 0.012 * br, 1 + 0.03 * br, 1 + 0.012 * br);
    m.bob.position.y += Math.abs(Math.sin(m.walkT * 0.5)) * 0.1 * L * m.walkBlend; // the hop
  }]);
  return m;
}
